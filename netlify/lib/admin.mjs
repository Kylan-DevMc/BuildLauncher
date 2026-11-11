import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'

export const adminSessionLifetimeMs = 4 * 60 * 60 * 1000
const contentStoreName = 'buildlauncher-admin-content'
const contentKeyByCollection = { articles: 'articles', mods: 'mods' }

function sessionSignature(encodedPayload, pepper) {
  return createHmac('sha256', `${pepper}:BuildLauncher-admin-session-v1`)
    .update(encodedPayload)
    .digest()
}

export function createAdminSession(pseudo, pepper, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    pseudo,
    expiresAt: now + adminSessionLifetimeMs,
    nonce: randomBytes(16).toString('hex')
  })).toString('base64url')
  const signature = sessionSignature(payload, pepper).toString('base64url')
  return { token: `${payload}.${signature}`, expiresAt: now + adminSessionLifetimeMs }
}

export function verifyAdminSession(token, pepper, now = Date.now()) {
  if(typeof token !== 'string') return null
  const parts = token.split('.')
  if(parts.length !== 2 || parts.some(part => !part)) return null

  const expected = sessionSignature(parts[0], pepper)
  let actual
  try {
    actual = Buffer.from(parts[1], 'base64url')
  } catch {
    return null
  }
  if(actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if(payload.role !== 'admin'
      || typeof payload.pseudo !== 'string'
      || !Number.isFinite(payload.expiresAt)
      || payload.expiresAt <= now) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function getBearerToken(request) {
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(request.headers.get('authorization') || '')
  return match?.[1] || null
}

export function getContentStore() {
  return getStore(contentStoreName)
}

export function validateContentItem(collection, item, existing, now = Date.now()) {
  if(!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('invalid_item')
  }
  const id = existing?.id || (typeof item.id === 'string' ? item.id : randomUUID())
  if(!/^[a-f0-9-]{36}$/i.test(id)) throw new TypeError('invalid_id')

  if(collection === 'articles') {
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    const author = typeof item.author === 'string' ? item.author.trim() : ''
    const link = typeof item.link === 'string' ? item.link.trim() : ''
    if(!title || title.length > 160 || !content || content.length > 20000 || author.length > 80) {
      throw new TypeError('invalid_article')
    }
    if(link) {
      let parsed
      try {
        parsed = new URL(link)
      } catch {
        throw new TypeError('invalid_article_link')
      }
      if(!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new TypeError('invalid_article_link')
      }
    }
    return {
      id,
      title,
      author: author || 'BuildLauncher',
      link,
      content,
      date: existing?.date || new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }
  }

  if(collection === 'mods') {
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const version = typeof item.version === 'string' ? item.version.trim() : ''
    const downloadUrl = typeof item.downloadUrl === 'string' ? item.downloadUrl.trim() : ''
    const sha512 = typeof item.sha512 === 'string' ? item.sha512.trim().toLowerCase() : ''
    const serverIds = Array.isArray(item.serverIds)
      ? [...new Set(item.serverIds.filter(value => typeof value === 'string').map(value => value.trim()))]
      : []
    let parsedUrl
    try {
      parsedUrl = new URL(downloadUrl)
    } catch {
      throw new TypeError('invalid_mod_url')
    }
    if(!name || name.length > 120 || version.length > 80
      || parsedUrl.protocol !== 'https:'
      || parsedUrl.username || parsedUrl.password
      || serverIds.length === 0
      || serverIds.some(value => value !== '*' && !/^[a-zA-Z0-9._-]{1,100}$/.test(value))
      || (sha512 && !/^[a-f0-9]{128}$/.test(sha512))) {
      throw new TypeError('invalid_mod')
    }
    return {
      id,
      name,
      version,
      downloadUrl: parsedUrl.toString(),
      sha512,
      serverIds,
      fileName: existing?.fileName || `buildlauncher-managed-${id}.jar`,
      updatedAt: new Date(now).toISOString()
    }
  }

  throw new TypeError('invalid_collection')
}

export async function listContent(collection, store = getContentStore()) {
  const key = contentKeyByCollection[collection]
  if(!key) throw new TypeError('invalid_collection')
  const items = await store.get(key, { type: 'json' })
  return Array.isArray(items) ? items : []
}

export async function mutateContent(collection, action, item, store = getContentStore()) {
  const key = contentKeyByCollection[collection]
  if(!key) throw new TypeError('invalid_collection')
  if(!['save', 'delete'].includes(action)) throw new TypeError('invalid_action')

  for(let attempt = 0; attempt < 5; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json' })
    const items = Array.isArray(current?.data) ? current.data : []
    const itemId = typeof item?.id === 'string' ? item.id : ''
    const existingIndex = items.findIndex(value => value.id === itemId)
    if(action === 'delete' && existingIndex < 0) return { found: false, items }
    if(action === 'save' && itemId && existingIndex < 0) return { found: false, items }

    let nextItems
    if(action === 'delete') {
      nextItems = items.filter(value => value.id !== itemId)
    } else {
      const existing = existingIndex >= 0 ? items[existingIndex] : null
      const normalized = validateContentItem(collection, item, existing)
      nextItems = [...items]
      if(existingIndex >= 0) nextItems[existingIndex] = normalized
      else nextItems.unshift(normalized)
    }

    const result = await store.setJSON(key, nextItems, current
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true })
    if(result.modified) return { found: true, items: nextItems }
  }

  throw new Error('content_write_conflict')
}
