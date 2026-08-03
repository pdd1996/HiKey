import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reencryptPlaintext } from './reencrypt'
import { defaultDbRoot, type KeyRecord, type SecretMode } from './schema'

// 可逆 fake safeStorage：base64 编/解码 + 可用性 + 加密失败开关。
const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true, encryptFails: false }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => {
        if (state.encryptFails) throw new Error('encrypt boom')
        return Buffer.from(s, 'utf8').toString('base64')
      },
      decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8'),
      _setAvailable: (v: boolean) => {
        state.available = v
      },
      _setEncryptFails: (v: boolean) => {
        state.encryptFails = v
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
    id: 'k',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: 'sk-plain',
    secretMode: 'plaintext' as SecretMode,
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
  mockSafeStorage._setEncryptFails(false)
})

describe('reencryptPlaintext', () => {
  it('safeStorage 可用 → plaintext 记录全转 safeStorage，plaintextMode 归 false', () => {
    const root = defaultDbRoot()
    root.keys = [
      key({ id: 'a', encSecret: 'sk-1' }),
      key({ id: 'b', encSecret: 'sk-2' }),
      key({ id: 'c', encSecret: encFor('sk-3'), secretMode: 'safeStorage' })
    ]
    root.meta.plaintextMode = true

    const r = reencryptPlaintext(root)
    expect(r.failed).toBe(0)
    expect(root.keys[0].secretMode).toBe('safeStorage')
    expect(root.keys[0].encSecret).toBe(encFor('sk-1'))
    expect(root.keys[1].secretMode).toBe('safeStorage')
    expect(root.keys[2].secretMode).toBe('safeStorage') // 原本就是
    expect(root.meta.plaintextMode).toBe(false)
  })

  it('单条 encrypt 失败 → 保留明文 + lastError，不中断其余，plaintextMode 仍 true', () => {
    const root = defaultDbRoot()
    root.keys = [
      key({ id: 'a', encSecret: 'sk-1' }),
      key({ id: 'b', encSecret: 'sk-2' })
    ]
    root.meta.plaintextMode = true

    // 让 encrypt 对第一条抛错：用计数器模拟单条失败
    let calls = 0
    mockSafeStorage.encryptString = () => {
      calls++
      if (calls === 1) throw new Error('boom')
      return Buffer.from('sk-2', 'utf8').toString('base64')
    }

    const r = reencryptPlaintext(root)
    expect(r.failed).toBe(1)
    expect(root.keys[0].secretMode).toBe('plaintext') // 保留明文
    expect(root.keys[0].encSecret).toBe('sk-1')
    expect(root.keys[0].lastError).toBe('重加密失败，仍为明文')
    expect(root.keys[1].secretMode).toBe('safeStorage') // 其余继续
    expect(root.meta.plaintextMode).toBe(true) // 仍有明文记录
  })

  it('safeStorage 不可用 → no-op，不改任何记录', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a', encSecret: 'sk-1' })]
    root.meta.plaintextMode = true

    const r = reencryptPlaintext(root)
    expect(r.changed).toBe(false)
    expect(r.failed).toBe(0)
    expect(root.keys[0].secretMode).toBe('plaintext')
    expect(root.meta.plaintextMode).toBe(true)
  })

  it('无 plaintext 记录 → 无变更', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a', encSecret: encFor('sk'), secretMode: 'safeStorage' })]
    const r = reencryptPlaintext(root)
    expect(r.changed).toBe(false)
    expect(r.failed).toBe(0)
  })
})