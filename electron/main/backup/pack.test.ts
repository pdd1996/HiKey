import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildBackup, countPlaintext } from './pack'
import { defaultDbRoot, type KeyRecord, type SecretMode } from '../storage/schema'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    _available: true,
    isEncryptionAvailable: () => mockSafeStorage._available,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: 'enc',
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
  mockSafeStorage._available = true
})

describe('countPlaintext', () => {
  it('全密文 → 0', () => {
    expect(countPlaintext([key(), key()])).toBe(0)
  })
  it('混合 → 计 plaintext 条数', () => {
    expect(countPlaintext([key(), key({ secretMode: 'plaintext' }), key({ secretMode: 'plaintext' })])).toBe(2)
  })
})

describe('buildBackup', () => {
  it('safeStorage 可用 → 密文备份：verifier 非 null + plaintextBackup=false', () => {
    const root = defaultDbRoot()
    root.keys = [key(), key()]
    const b = buildBackup(root)
    expect(b.plaintextBackup).toBe(false)
    expect(typeof b.verifier).toBe('string')
    expect(b.verifier).not.toBe('')
    expect(b.schemaVersion).toBe(3)
    expect(b.plaintextRecordCount).toBe(0)
  })

  it('safeStorage 不可用 → 明文标记备份：verifier=null + plaintextBackup=true', () => {
    mockSafeStorage._available = false
    const root = defaultDbRoot()
    root.keys = [key()]
    const b = buildBackup(root)
    expect(b.plaintextBackup).toBe(true)
    expect(b.verifier).toBeNull()
  })

  it('混合库 plaintextRecordCount 正确（密文备份也计）', () => {
    const root = defaultDbRoot()
    root.keys = [
      key({ id: 'a' }),
      key({ id: 'b', secretMode: 'plaintext' }),
      key({ id: 'c', secretMode: 'plaintext' })
    ]
    const b = buildBackup(root)
    expect(b.plaintextRecordCount).toBe(2)
  })

  it('明文标记备份也写 plaintextRecordCount', () => {
    mockSafeStorage._available = false
    const root = defaultDbRoot()
    root.keys = [key({ secretMode: 'plaintext' }), key()]
    const b = buildBackup(root)
    expect(b.plaintextBackup).toBe(true)
    expect(b.plaintextRecordCount).toBe(1)
  })
})