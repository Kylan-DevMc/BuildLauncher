import { listContent } from '../lib/admin.mjs'
import { jsonResponse, optionsResponse } from '../lib/otp.mjs'

export const config = { path: '/content' }

export default async function content(request) {
  if(request.method === 'OPTIONS') return optionsResponse()
  if(request.method !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' })
  }

  try {
    const [articles, mods] = await Promise.all([
      listContent('articles'),
      listContent('mods')
    ])
    return jsonResponse(200, { articles, mods })
  } catch (error) {
    console.error('[Content] Failed to load managed content:', error.message)
    return jsonResponse(500, { ok: false, error: 'content_load_failed' })
  }
}
