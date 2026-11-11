/* global window, ConfigManager */
const fs = require('fs-extra')
const path = require('path')
const { createHash, randomUUID } = require('crypto')
const { Transform } = require('stream')
const { pipeline } = require('stream/promises')
const got = require('got')

const MAX_MOD_SIZE = 500 * 1024 * 1024
const MOD_ID_REGEX = /^[a-f0-9-]{36}$/i
const SERVER_ID_REGEX = /^[a-zA-Z0-9._-]{1,100}$/

function isManagedFileName(value, id) {
    return typeof value === 'string'
        && path.basename(value) === value
        && value === `buildlauncher-managed-${id}.jar`
}

async function loadContent() {
    const apiBase = window.adminContentBaseUrl
    if(typeof apiBase !== 'string' || !/^https:\/\/[^/]+$/i.test(apiBase)) {
        throw new Error('Le service de mods partagés est mal configuré.')
    }

    const cachePath = path.join(ConfigManager.getLauncherDirectory(), 'managed-content-cache.json')
    try {
        const response = await fetch(`${apiBase}/content`, { signal: AbortSignal.timeout(15000) })
        if(!response.ok) throw new Error(`Le service a répondu HTTP ${response.status}.`)
        const content = await response.json()
        if(!content || !Array.isArray(content.mods)) {
            throw new Error('Le catalogue de mods reçu est invalide.')
        }
        fs.writeJsonSync(cachePath, content)
        return content
    } catch (error) {
        if(fs.existsSync(cachePath)) {
            console.warn('[Mods] Service inaccessible; utilisation du dernier catalogue en cache.', error)
            const cached = fs.readJsonSync(cachePath)
            if(cached && Array.isArray(cached.mods)) return cached
        }
        throw new Error(`Impossible de charger le catalogue de mods partagés. ${error.message}`)
    }
}

async function downloadMod(mod, targetPath) {
    let parsedUrl
    try {
        parsedUrl = new URL(mod.downloadUrl)
    } catch {
        throw new Error(`URL invalide pour le mod « ${mod.name} ».`)
    }
    if(parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
        throw new Error(`L’URL du mod « ${mod.name} » doit être une URL HTTPS publique.`)
    }

    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`
    const hash = createHash('sha512')
    let size = 0
    const meter = new Transform({
        transform(chunk, encoding, callback) {
            size += chunk.length
            if(size > MAX_MOD_SIZE) {
                callback(new Error(`Le fichier « ${mod.name} » dépasse la limite de 500 Mo.`))
                return
            }
            hash.update(chunk)
            callback(null, chunk)
        }
    })

    try {
        await pipeline(
            got.stream(parsedUrl.toString(), { timeout: { request: 180000 }, maxRedirects: 5 }),
            meter,
            fs.createWriteStream(temporaryPath, { flags: 'wx' })
        )
        const actualHash = hash.digest('hex')
        if(mod.sha512 && actualHash !== mod.sha512.toLowerCase()) {
            throw new Error(`La vérification SHA-512 a échoué pour « ${mod.name} ».`)
        }

        const descriptor = fs.openSync(temporaryPath, 'r')
        const header = Buffer.alloc(4)
        let bytesRead
        try {
            bytesRead = fs.readSync(descriptor, header, 0, header.length, 0)
        } finally {
            fs.closeSync(descriptor)
        }
        if(bytesRead < 4 || header[0] !== 0x50 || header[1] !== 0x4b) {
            throw new Error(`Le lien du mod « ${mod.name} » ne renvoie pas un fichier JAR/ZIP.`)
        }

        fs.moveSync(temporaryPath, targetPath, { overwrite: true })
        return actualHash
    } catch (error) {
        fs.removeSync(temporaryPath)
        throw error
    }
}

exports.syncManagedMods = async function(serverId) {
    if(typeof serverId !== 'string' || !SERVER_ID_REGEX.test(serverId)) {
        throw new Error('ID de monde invalide.')
    }

    const content = await loadContent()
    const mods = content.mods.filter(mod => mod && Array.isArray(mod.serverIds)
        && (mod.serverIds.includes('*') || mod.serverIds.includes(serverId)))
    const instanceRoot = path.resolve(ConfigManager.getInstanceDirectory())
    const gameDirectory = path.resolve(instanceRoot, serverId)
    if(!gameDirectory.startsWith(`${instanceRoot}${path.sep}`)) {
        throw new Error('Le chemin du monde est invalide.')
    }

    const modsDirectory = path.join(gameDirectory, 'mods')
    fs.ensureDirSync(modsDirectory)
    const manifestPath = path.join(gameDirectory, '.buildlauncher-managed-online-mods.json')
    let previousMods = []
    try {
        const manifest = fs.readJsonSync(manifestPath)
        if(Array.isArray(manifest)) {
            previousMods = manifest.filter(mod =>
                mod && MOD_ID_REGEX.test(mod.id) && isManagedFileName(mod.fileName, mod.id)
            )
        }
    } catch (error) {
        if(fs.existsSync(manifestPath)) {
            console.warn('[Mods] Previous shared-mod manifest is unreadable; it will be rebuilt.', error)
        }
        previousMods = []
    }

    const nextMods = []
    for(const mod of mods) {
        if(!mod || !MOD_ID_REGEX.test(mod.id) || !isManagedFileName(mod.fileName, mod.id)
            || typeof mod.updatedAt !== 'string') {
            throw new Error('Le catalogue contient un mod invalide.')
        }
        const targetPath = path.join(modsDirectory, mod.fileName)
        const previous = previousMods.find(value => value.id === mod.id)
        if(previous?.updatedAt === mod.updatedAt && fs.existsSync(targetPath)) {
            nextMods.push(previous)
            continue
        }
        const sha512 = await downloadMod(mod, targetPath)
        nextMods.push({ id: mod.id, fileName: mod.fileName, updatedAt: mod.updatedAt, sha512 })
    }

    const nextIds = new Set(nextMods.map(mod => mod.id))
    for(const previous of previousMods) {
        if(!nextIds.has(previous.id)) {
            fs.removeSync(path.join(modsDirectory, previous.fileName))
        }
    }
    fs.writeJsonSync(manifestPath, nextMods, { spaces: 2 })
    return nextMods.length
}
