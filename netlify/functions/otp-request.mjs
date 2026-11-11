import {
  claimRequestCooldown,
  createOtp,
  getOtpConfig,
  getOtpStore,
  hashOtp,
  jsonResponse,
  maxVerificationAttempts,
  normalizePseudo,
  optionsResponse,
  otpExpirationMs,
  readJsonBody,
  sendOtpToAdmins
} from '../lib/otp.mjs'

export const config = { path: '/otp/request' }

export default async function otpRequest(request) {
  if(request.method === 'OPTIONS') return optionsResponse()
  if(request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' })
  }

  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_request' })
  }
  if(!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { ok: false, error: 'invalid_request' })
  }

  const pseudo = normalizePseudo(body.pseudo)
  const otpConfig = getOtpConfig()
  if(otpConfig.error) {
    console.error(`[OTP] Netlify environment is incomplete: ${otpConfig.missing.join(', ')}`)
    return jsonResponse(503, { ok: false, error: otpConfig.error })
  }
  if(!otpConfig.triggerPseudos.has(pseudo)) {
    return jsonResponse(403, { ok: false, error: 'admin_pseudo_required' })
  }

  let store
  let cooldown
  let challengeKey
  try {
    store = getOtpStore()
    cooldown = await claimRequestCooldown(store, pseudo)
    if(!cooldown.ok) {
      return jsonResponse(429, {
        ok: false,
        error: 'otp_request_cooldown',
        retryAfterSeconds: cooldown.retryAfterSeconds
      })
    }

    const code = createOtp()
    challengeKey = `challenge:${pseudo}`
    await store.setJSON(challengeKey, {
      hash: hashOtp(code, otpConfig.pepper),
      expiresAt: Date.now() + otpExpirationMs,
      attemptsLeft: maxVerificationAttempts
    })

    const delivered = await sendOtpToAdmins(otpConfig.adminIds, otpConfig.botToken, code)
    if(delivered === 0) {
      await store.delete(challengeKey)
      await store.delete(cooldown.key)
      return jsonResponse(502, { ok: false, error: 'otp_dm_delivery_failed' })
    }

    return jsonResponse(200, { ok: true })
  } catch (error) {
    console.error('[OTP] Request failed:', error.message)
    if(store) {
      try {
        await Promise.all([
          challengeKey ? store.delete(challengeKey) : Promise.resolve(),
          cooldown?.ok ? store.delete(cooldown.key) : Promise.resolve()
        ])
      } catch (cleanupError) {
        console.error('[OTP] Request cleanup failed:', cleanupError.message)
      }
    }
    return jsonResponse(500, { ok: false, error: 'otp_request_failed' })
  }
}
