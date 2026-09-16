const { DistributionAPI } = require('helios-core/common')
const fs = require('fs-extra')
const path = require('path')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://launcher.cobblemon-ultra.fr/distribution.json'

const localDistroPath = path.resolve(__dirname, '../../../distribution.json')
const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    true
)

api.distroDevPath = localDistroPath
api.pullLocal = async function() {
    try {
        const raw = await fs.readFile(localDistroPath, 'utf-8')
        return JSON.parse(raw)
    } catch (err) {
        return null
    }
}

exports.DistroAPI = api