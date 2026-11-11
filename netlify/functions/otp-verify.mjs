import {
  getOtpConfig,
  getOtpStore,
  jsonResponse,
  matchesOtp,
  normalizePseudo,
  optionsResponse,
  readJsonBody
} from '../lib/otp.mjs'

export const config = { path: '/otp/verify' }

export default async function otpVerify(request) {
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

  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const pseudo = normalizePseudo(body.pseudo)
  if(!/^\d{6}$/.test(code)) {
    return jsonResponse(400, { ok: false, error: 'invalid_code' })
  }

  const otpConfig = getOtpConfig()
  if(otpConfig.error) {
    console.error(`[OTP] Netlify environment is incomplete: ${otpConfig.missing.join(', ')}`)
    return jsonResponse(503, { ok: false, error: otpConfig.error })
  }
  if(!otpConfig.triggerPseudos.has(pseudo)) {
    return jsonResponse(403, { ok: false, error: 'admin_pseudo_required' })
  }

  const challengeKey = `challenge:${pseudo}`
  try {
    const store = getOtpStore()
    const current = await store.getWithMetadata(challengeKey, { type: 'json' })
    const challenge = current?.data
    if(!challenge
      || challenge.consumed
      || !Number.isFinite(challenge.expiresAt)
      || challenge.expiresAt <= Date.now()
      || !Number.isInteger(challenge.attemptsLeft)
      || challenge.attemptsLeft <= 0
      || !/^[a-f\d]{64}$/i.test(challenge.hash || '')) {
      if(challenge) await store.delete(challengeKey)
      return jsonResponse(401, { ok: false, error: 'invalid_or_expired_code' })
    }

    const nextChallenge = { ...challenge }
    if(!matchesOtp(code, challenge.hash, otpConfig.pepper)) {
      nextChallenge.attemptsLeft -= 1
      if(nextChallenge.attemptsLeft <= 0) {
        nextChallenge.consumed = true
      }
      const updated = await store.setJSON(challengeKey, nextChallenge, { onlyIfMatch: current.etag })
      if(updated.modified && nextChallenge.consumed) {
        await store.delete(challengeKey)
      }
      return jsonResponse(401, { ok: false, error: 'invalid_or_expired_code' })
    }

    nextChallenge.consumed = true
    const updated = await store.setJSON(challengeKey, nextChallenge, { onlyIfMatch: current.etag })
    if(!updated.modified) {
      return jsonResponse(401, { ok: false, error: 'invalid_or_expired_code' })
    }
    await store.delete(challengeKey)
    return jsonResponse(200, { ok: true, role: 'admin' })
  } catch (error) {
    console.error('[OTP] Verification failed:', error.message)
    return jsonResponse(500, { ok: false, error: 'otp_verification_failed' })
  }
}
