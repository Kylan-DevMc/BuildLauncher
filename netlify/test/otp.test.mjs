import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimRequestCooldown,
  createOtp,
  getOtpConfig,
  hashOtp,
  matchesOtp
} from '../lib/otp.mjs'

const validEnvironment = {
  DISCORD_BOT_TOKEN: 'test-token',
  ADMIN_DISCORD_IDS: '12345678901234567',
  ADMIN_TRIGGER_PSEUDOS: 'admin',
  OTP_PEPPER: '01234567890123456789012345678901'
}

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
    if(options.onlyIfMatch && current?.etag !== options.onlyIfMatch) {
      return { modified: false }
    }

    const etag = String(this.nextEtag++)
    this.entries.set(key, { value: structuredClone(value), etag })
    return { modified: true, etag }
  }
}

test('requires a valid Discord recipient and a strong pepper', () => {
  assert.equal(getOtpConfig(validEnvironment).error, undefined)
  assert.deepEqual(getOtpConfig({ ...validEnvironment, OTP_PEPPER: 'short' }).missing, ['OTP_PEPPER'])
  assert.deepEqual(getOtpConfig({ ...validEnvironment, ADMIN_DISCORD_IDS: 'not-an-id' }).missing, ['ADMIN_DISCORD_IDS'])
  assert.deepEqual(getOtpConfig({ ...validEnvironment, ADMIN_TRIGGER_PSEUDOS: '' }).missing, ['ADMIN_TRIGGER_PSEUDOS'])
})

test('creates six-digit OTPs and only matches the correct code and pepper', () => {
  const code = createOtp()
  const hash = hashOtp(code, validEnvironment.OTP_PEPPER)

  assert.match(code, /^\d{6}$/)
  assert.equal(matchesOtp(code, hash, validEnvironment.OTP_PEPPER), true)
  assert.equal(matchesOtp('000000', hash, 'different-pepper'), false)
})

test('allows only one OTP request per pseudo during the cooldown', async () => {
  const store = new MemoryStore()

  assert.equal((await claimRequestCooldown(store, 'admin')).ok, true)
  const nextRequest = await claimRequestCooldown(store, 'admin')
  assert.equal(nextRequest.ok, false)
  assert.ok(nextRequest.retryAfterSeconds > 0)
})
