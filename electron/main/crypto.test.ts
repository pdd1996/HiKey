import { describe, it, expect, vi, beforeEach } from 'vitest'

// 可逆 fake safeStorage：base64 编/解码 + 可用性开关。
// vi.mock 工厂不能引用外部变量，用 vi.hoisted 共享可变状态。
const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
      decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8'),
      _setAvailable: (v: boolean) => {
        state.available = v
      }
    }
  }
})

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

import {
  encryptForStore,
  revealSecret,
  isSafeStorageAvailable
} from './crypto'

beforeEach(() => {
  mockSafeStorage._setAvailable(true)
})

describe('crypto encryptForStore', () => {
  it('safeStorage 可用 → 强制 safeStorage 模式，往返还原', () => {
    const out = encryptForStore('sk-secret', false)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.mode).toBe('safeStorage')
    if (out.ok && out.mode === 'safeStorage') {
      expect(revealSecret(out.encSecret, 'safeStorage')).toBe('sk-secret')
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
      expect(revealSecret(out.encSecret, 'plaintext')).toBe('sk-secret')
    }
  })

  it('isSafeStorageAvailable 反映开关状态', () => {
    mockSafeStorage._setAvailable(true)
    expect(isSafeStorageAvailable()).toBe(true)
    mockSafeStorage._setAvailable(false)
    expect(isSafeStorageAvailable()).toBe(false)
  })
})