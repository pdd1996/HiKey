import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revealKey } from './reveal'
import { defaultDbRoot, type KeyRecord, type SecretMode } from '../storage/schema'

const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true, decryptFails: false }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
      decryptString: (s: string) => {
        if (state.decryptFails) throw new Error('decrypt boom')
        return Buffer.from(s, 'base64').toString('utf8')
      },
      _setAvailable: (v: boolean) => {
        state.available = v
      },
      _setDecryptFails: (v: boolean) => {
        state.decryptFails = v
      }
    }
  }
})

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

function encFor(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64')
}

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k1',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: encFor('sk-secret'),
    secretMode: 'safeStorage' as SecretMode,
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

beforeEach(() => {
  mockSafeStorage._setAvailable(true)
  mockSafeStorage._setDecryptFails(false)
})

describe('revealKey', () => {
  it('safeStorage 密文 → 还原明文', () => {
    const root = defaultDbRoot()
    root.keys = [key({ encSecret: encFor('sk-secret') })]
    const r = revealKey(root, 'k1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plaintext).toBe('sk-secret')
  })

  it('plaintext 模式 → 直取，与 safeStorage 可用性无关', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.keys = [key({ encSecret: 'sk-plain', secretMode: 'plaintext' })]
    const r = revealKey(root, 'k1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plaintext).toBe('sk-plain')
  })

  it('safeStorage 不可用 + safeStorage 密文 → undecryptable', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.keys = [key({ encSecret: encFor('sk-secret'), secretMode: 'safeStorage' })]
    const r = revealKey(root, 'k1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('undecryptable')
  })

  it('密文损坏 → undecryptable，不抛原始异常', () => {
    mockSafeStorage._setDecryptFails(true)
    const root = defaultDbRoot()
    root.keys = [key({ encSecret: 'AAAA', secretMode: 'safeStorage' })]
    const r = revealKey(root, 'k1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('undecryptable')
  })

  it('未找到 → not-found', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1' })]
    const r = revealKey(root, 'nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not-found')
  })
})