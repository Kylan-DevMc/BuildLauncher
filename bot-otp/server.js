import 'dotenv/config'
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js'

const required = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'ADMIN_DISCORD_IDS', 'OTP_PEPPER']
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`)
  }
}

const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const pepper = process.env.OTP_PEPPER
const expirationMs = 5 * 60 * 1000
const adminIds = new Set(process.env.ADMIN_DISCORD_IDS.split(',').map(value => value.trim()).filter(Boolean))
const adminTriggerPseudos = new Set((process.env.ADMIN_TRIGGER_PSEUDOS || 'admin').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
const pendingOtps = new Map()

function hashOtp(code) {
  return createHash('sha256').update(`${pepper}:${code}`).digest()
}

function matchesOtp(code, expectedHash) {
  const actualHash = hashOtp(code)
  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash)
}

function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function json(response, statusCode, body) {
  const payload = JSON.stringify(body)
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-length': Buffer.byteLength(payload)
  })
  response.end(payload)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
      if (body.length > 4096) reject(new Error('Request too large'))
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    request.on('error', reject)
  })
}

const httpServer = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type'
    })
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, { ok: true })
    return
  }

  if (request.method === 'POST' && request.url === '/otp/verify') {
    try {
      const body = await readJson(request)
      const code = typeof body.code === 'string' ? body.code.trim() : ''
      const pseudo = typeof body.pseudo === 'string' ? body.pseudo.trim().toLowerCase() : ''
      if(!adminTriggerPseudos.has(pseudo)) {
        json(response, 403, { ok: false, error: 'admin_pseudo_required' })
        return
      }
      if (!/^\d{6}$/.test(code)) {
        json(response, 400, { ok: false, error: 'invalid_code' })
        return
      }

      const now = Date.now()
      for (const [userId, record] of pendingOtps) {
        if (record.expiresAt <= now) pendingOtps.delete(userId)
      }

      const record = [...pendingOtps.entries()].find(([, value]) => matchesOtp(code, value.hash))
      if (!record) {
        json(response, 401, { ok: false, error: 'invalid_or_expired_code' })
        return
      }

      pendingOtps.delete(record[0])
      json(response, 200, { ok: true, role: 'admin' })
    } catch {
      json(response, 400, { ok: false, error: 'invalid_request' })
    }
    return
  }

  json(response, 404, { ok: false, error: 'not_found' })
})

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('ready', async readyClient => {
  const command = new SlashCommandBuilder()
    .setName('otp')
    .setDescription('Envoie un code OTP admin en message prive')
    .toJSON()

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN)
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID)
  await rest.put(route, { body: [command] })
  console.log(`Bot connecte: ${readyClient.user.tag}`)
})

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'otp') return

  if (!adminIds.has(interaction.user.id)) {
    await interaction.reply({ content: 'Acces refuse.', ephemeral: true })
    return
  }

  const code = createOtp()
  pendingOtps.set(interaction.user.id, { hash: hashOtp(code), expiresAt: Date.now() + expirationMs })

  try {
    await interaction.user.send(`Code OTP BuildLauncher: ${code}\nValable pendant 5 minutes et utilisable une seule fois.`)
    await interaction.reply({ content: 'Le code OTP a ete envoye en message prive.', ephemeral: true })
  } catch {
    pendingOtps.delete(interaction.user.id)
    await interaction.reply({ content: 'Impossible de vous envoyer un message prive.', ephemeral: true })
  }
})

client.login(process.env.DISCORD_BOT_TOKEN)
httpServer.listen(port, host, () => console.log(`API OTP: http://${host}:${port}`))
