import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeVerifier, verifySameMachine } from './verifier'

const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true, decryptFails: false, decryptMismatch: false }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
      decryptString: (s: string) => {
        if (state.decryptFails) throw new Error('decrypt boom')
        if (state.decryptMismatch) return 'WRONG'
        return Buffer.from(s, 'base64').toString('utf8')
      },
      _setAvailable: (v: boolean) => {
        state.available = v
      },
      _setDecryptFails: (v: boolean) => {
        state.decryptFails = v
      },
      _setDecryptMismatch: (v: boolean) => {
        state.decryptMismatch = v
      }
    }
  }
})

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

beforeEach(() => {
  mockSafeStorage._setAvailable(true)
  mockSafeStorage._setDecryptFails(false)
  mockSafeStorage._setDecryptMismatch(false)
})

describe('makeVerifier', () => {
  it('safeStorage 可用 → 返回 base64 密文（非空）', () => {
    const v = makeVerifier()
    expect(typeof v).toBe('string')
    expect(v).not.toBe('')
    // base64 形态：能解回固定文本
    expect(Buffer.from(v!, 'base64').toString('utf8')).toBe('HIKEY_BACKUP_VERIFIER_v1')
  })

  it('safeStorage 不可用 → 返回 null', () => {
    mockSafeStorage._setAvailable(false)
    expect(makeVerifier()).toBeNull()
  })
})

describe('verifySameMachine', () => {
  it('同机解密成功 + 文本匹配 → true', () => {
    const v = makeVerifier()!
    expect(verifySameMachine(v)).toBe(true)
  })

  it('解密抛错（跨机 DPAPI 不同）→ false', () => {
    mockSafeStorage._setDecryptFails(true)
    const v = makeVerifier()!
    mockSafeStorage._setDecryptFails(true) // 恢复时也抛
    expect(verifySameMachine(v)).toBe(false)
  })

  it('解密成功但文本不符 → false', () => {
    mockSafeStorage._setDecryptMismatch(true)
    const v = 'AAAA' // 任意 base64
    expect(verifySameMachine(v)).toBe(false)
  })

  it('safeStorage 不可用 → false（密文备份要求 safeStorage 在场）', () => {
    mockSafeStorage._setAvailable(false)
    expect(verifySameMachine('AAAA')).toBe(false)
  })
})