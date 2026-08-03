import { describe, it, expect, vi, beforeEach } from 'vitest'

// 可逆 fake safeStorage：base64 编/解码 + 可用性开关。
// vi.mock 工厂不能引用外部变量，用 vi.hoisted 共享可变状态。
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

import {
  encrypt,
  encryptForStore,
  revealSecret,
  isSafeStorageAvailable
} from './crypto'

beforeEach(() => {
  mockSafeStorage._setAvailable(true)
  mockSafeStorage._setDecryptFails(false)
})

describe('crypto encryptForStore', () => {
  it('safeStorage 可用 → 强制 safeStorage 模式，往返还原', () => {
    const out = encryptForStore('sk-secret', false)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.mode).toBe('safeStorage')
    if (out.ok && out.mode === 'safeStorage') {
      const r = revealSecret(out.encSecret, 'safeStorage')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.plaintext).toBe('sk-secret')
    }
  })

  it('safeStorage 可用 + 误开降级 → 仍强制 safeStorage，不主动存明文', () => {
    const out = encryptForStore('sk-secret', true)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.mode).toBe('safeStorage')
  })

  it('safeStorage 不可用 + 降级未开 → fail-closed', () => {
    mockSafeStorage._setAvailable(false)
    const out = encryptForStore('sk-secret', false)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('fail-closed')
  })

  it('safeStorage 不可用 + 降级已开 → 明文模式，直取还原', () => {
    mockSafeStorage._setAvailable(false)
    const out = encryptForStore('sk-secret', true)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.mode).toBe('plaintext')
    if (out.ok && out.mode === 'plaintext') {
      expect(out.encSecret).toBe('sk-secret')
      const r = revealSecret(out.encSecret, 'plaintext')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.plaintext).toBe('sk-secret')
    }
  })

  it('isSafeStorageAvailable 反映开关状态', () => {
    mockSafeStorage._setAvailable(true)
    expect(isSafeStorageAvailable()).toBe(true)
    mockSafeStorage._setAvailable(false)
    expect(isSafeStorageAvailable()).toBe(false)
  })
})

describe('crypto revealSecret (RevealResult 判别联合)', () => {
  it('safeStorage 可用 + 密文完好 → 还原明文', () => {
    const enc = encrypt('sk-secret')
    const r = revealSecret(enc, 'safeStorage')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plaintext).toBe('sk-secret')
  })

  it('plaintext 模式 → 直取，不调解密，与 safeStorage 可用性无关', () => {
    mockSafeStorage._setAvailable(false)
    const r = revealSecret('sk-plain', 'plaintext')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plaintext).toBe('sk-plain')
  })

  it('safeStorage 不可用 + safeStorage 密文 → undecryptable，不抛异常', () => {
    mockSafeStorage._setAvailable(false)
    const r = revealSecret('AAAA', 'safeStorage')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('undecryptable')
  })

  it('safeStorage 可用但密文损坏 → undecryptable，不抛原始异常', () => {
    mockSafeStorage._setDecryptFails(true)
    const r = revealSecret('AAAA', 'safeStorage')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('undecryptable')
  })
})