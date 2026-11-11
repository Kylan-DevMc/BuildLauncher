import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminSessionLifetimeMs,
  createAdminSession,
  mutateContent,
  validateContentItem,
  verifyAdminSession
} from '../lib/admin.mjs'

const pepper = '01234567890123456789012345678901'

class MemoryStore {
  entries = new Map()
  nextEtag = 1

  async getWithMetadata(key) {
    const entry = this.entries.get(key)
    return entry ? { data: structuredClone(entry.value), etag: entry.etag } : null
  }

  async get(key) {
    const entry = this.entries.get(key)
    return entry ? structuredClone(entry.value) : null
  }

  async setJSON(key, value, options = {}) {
    const current = this.entries.get(key)
    if(options.onlyIfNew && current) return { modified: false }
    if(options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false }
    const etag = String(this.nextEtag++)
    this.entries.set(key, { value: structuredClone(value), etag })
    return { modified: true, etag }
  }
}

test('admin session tokens are signed and expire', () => {
  const now = 1000
  const session = createAdminSession('admin', pepper, now)

  assert.equal(session.expiresAt, now + adminSessionLifetimeMs)
  assert.equal(verifyAdminSession(session.token, pepper, now)?.pseudo, 'admin')
  assert.equal(verifyAdminSession(session.token, 'different-pepper', now), null)
  assert.equal(verifyAdminSession(session.token, pepper, session.expiresAt), null)
})

test('mod entries require HTTPS direct links and valid world IDs', () => {
  const mod = {
    name: 'Test mod',
    serverIds: ['Build-1'],
    downloadUrl: 'https://cdn.example.test/test.jar',
    sha512: ''
  }

  assert.equal(validateContentItem('mods', mod, null).serverIds[0], 'Build-1')
  assert.throws(() => validateContentItem('mods', { ...mod, downloadUrl: 'http://example.test/test.jar' }, null), /invalid_mod/)
  assert.throws(() => validateContentItem('mods', { ...mod, serverIds: ['../other'] }, null), /invalid_mod/)
})

test('articles can be created, updated, and deleted from shared storage', async () => {
  const store = new MemoryStore()
  const created = await mutateContent('articles', 'save', {
    title: 'Release notes',
    content: 'First version'
  }, store)
  const article = created.items[0]

  const updated = await mutateContent('articles', 'save', {
    ...article,
    title: 'Updated notes',
    content: 'Updated text'
  }, store)
  assert.equal(updated.items[0].title, 'Updated notes')

  const deleted = await mutateContent('articles', 'delete', { id: article.id }, store)
  assert.deepEqual(deleted.items, [])
})
