import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'

export const otpExpirationMs = 5 * 60 * 1000
export const requestCooldownMs = 60 * 1000
export const maxVerificationAttempts = 5

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'cache-control': 'no-store'
    }
  })
}

export async function readJsonBody(request) {
  const text = await request.text()
  if(text.length > 65536) {
    throw new Error('Request body too large')
  }
  return JSON.parse(text || '{}')
}

export function getOtpConfig(environment = process.env) {
  const missing = ['DISCORD_BOT_TOKEN', 'ADMIN_DISCORD_IDS', 'ADMIN_TRIGGER_PSEUDOS', 'OTP_PEPPER']
    .filter(name => !environment[name])
  if(missing.length > 0) {
    return { error: 'otp_service_not_configured', missing }
  }
  if(environment.OTP_PEPPER.length < 32) {
    return { error: 'otp_service_not_configured', missing: ['OTP_PEPPER'] }
  }

  const adminIds = environment.ADMIN_DISCORD_IDS
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  if(adminIds.length === 0 || adminIds.some(id => !/^\d{17,20}$/.test(id))) {
    return { error: 'otp_service_not_configured', missing: ['ADMIN_DISCORD_IDS'] }
  }

  const triggerPseudos = new Set(environment.ADMIN_TRIGGER_PSEUDOS
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean))
  if(triggerPseudos.size === 0) {
    return { error: 'otp_service_not_configured', missing: ['ADMIN_TRIGGER_PSEUDOS'] }
  }

  return {
    adminIds,
    botToken: environment.DISCORD_BOT_TOKEN,
    pepper: environment.OTP_PEPPER,
    triggerPseudos
  }
}

export function normalizePseudo(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashOtp(code, pepper) {
  return createHash('sha256').update(`${pepper}:${code}`).digest('hex')
}

export function matchesOtp(code, expectedHash, pepper) {
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = Buffer.from(hashOtp(code, pepper), 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}

export function getOtpStore() {
  return getStore('buildlauncher-otp')
}

export async function claimRequestCooldown(store, pseudo) {
  const key = `cooldown:${pseudo}`
  const now = Date.now()
  const current = await store.getWithMetadata(key, { type: 'json' })
  const expiresAt = current?.data?.expiresAt || 0
  if(expiresAt > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000))
    }
  }

  const nextExpiresAt = now + requestCooldownMs
  const result = await store.setJSON(key, { expiresAt: nextExpiresAt }, current
    ? { onlyIfMatch: current.etag }
    : { onlyIfNew: true })
  if(!result.modified) {
    const latest = await store.get(key, { type: 'json' })
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(((latest?.expiresAt || now + 1000) - now) / 1000))
    }
  }

  return { ok: true, key }
}

export async function sendOtpToAdmins(adminIds, botToken, code) {
  let delivered = 0
  for(const adminId of adminIds) {
    try {
      const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: {
          authorization: `Bot ${botToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ recipient_id: adminId })
      })
      if(!channelResponse.ok) {
        console.error(`[OTP] Could not open admin DM (HTTP ${channelResponse.status}).`)
        continue
      }

      const channel = await channelResponse.json()
      const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bot ${botToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          content: `Code OTP BuildLauncher : ${code}\nValable 5 minutes et utilisable une seule fois.`
        })
      })
      if(messageResponse.ok) {
        delivered += 1
      } else {
        console.error(`[OTP] Could not send admin DM (HTTP ${messageResponse.status}).`)
      }
    } catch (error) {
      console.error('[OTP] Discord DM request failed:', error.message)
    }
  }
  return delivered
}
