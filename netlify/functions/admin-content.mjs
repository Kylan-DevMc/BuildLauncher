import {
  getBearerToken,
  listContent,
  mutateContent,
  verifyAdminSession
} from '../lib/admin.mjs'
import {
  getOtpConfig,
  jsonResponse,
  optionsResponse,
  readJsonBody
} from '../lib/otp.mjs'

export const config = { path: '/admin/content' }

export default async function adminContent(request) {
  if(request.method === 'OPTIONS') return optionsResponse()
  if(request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' })
  }

  const otpConfig = getOtpConfig()
  if(otpConfig.error) {
    console.error(`[Admin] Netlify environment is incomplete: ${otpConfig.missing.join(', ')}`)
    return jsonResponse(503, { ok: false, error: 'admin_service_not_configured' })
  }
  const session = verifyAdminSession(getBearerToken(request), otpConfig.pepper)
  if(!session) return jsonResponse(401, { ok: false, error: 'admin_session_required' })

  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_request' })
  }
  if(!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { ok: false, error: 'invalid_request' })
  }

  try {
    const result = await mutateContent(body.collection, body.action, body.item)
    if(!result.found) return jsonResponse(404, { ok: false, error: 'content_not_found' })
    const items = await listContent(body.collection)
    return jsonResponse(200, { ok: true, items })
  } catch (error) {
    if(error instanceof TypeError) {
      return jsonResponse(400, { ok: false, error: error.message })
    }
    console.error('[Admin] Content update failed:', error.message)
    return jsonResponse(500, { ok: false, error: 'content_update_failed' })
  }
}
