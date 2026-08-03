import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addKey, updateKey, removeKey } from './crud'
import { defaultDbRoot, type DbRoot, type KeyRecord, type SecretMode } from '../storage/schema'
import type { KeyInput } from './types'

// 可逆 fake safeStorage + 可用性开关
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

function encFor(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64')
}

function input(over: Partial<KeyInput> = {}): KeyInput {
  return {
    provider: 'openai',
    name: 'openai-1',
    baseUrl: 'https://api.openai.com',
    secret: 'sk-x',
    ...over
  }
}

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k1',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: encFor('sk-old'),
    secretMode: 'safeStorage' as SecretMode,
    status: 'valid',
    lastChecked: 100,
    lastCheckMode: 'deep',
    lastDeepCheckedAt: 100,
    lastError: 'E',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    notes: '',
    ...over
  }
}

beforeEach(() => {
  mockSafeStorage._setAvailable(true)
})

describe('addKey', () => {
  it('safeStorage 可用 → safeStorage 模式 + status=unchecked + testModel 取默认', () => {
    const root = defaultDbRoot()
    const out = addKey(root, input({ testModel: undefined }), 1000)
    expect(out.ok).toBe(true)
    expect(out.id).toBeTruthy()
    const rec = root.keys[0]
    expect(rec.secretMode).toBe('safeStorage')
    expect(rec.encSecret).toBe(encFor('sk-x'))
    expect(rec.status).toBe('unchecked')
    expect(rec.testModel).toBe('gpt-4o-mini')
    expect(rec.createdAt).toBe(1000)
    expect(rec.deepCheck).toBe(true)
  })

  it('safeStorage 不可用 + 降级开 → plaintext', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.meta.allowPlaintextFallback = true
    const out = addKey(root, input(), 1000)
    expect(out.ok).toBe(true)
    expect(root.keys[0].secretMode).toBe('plaintext')
    expect(root.keys[0].encSecret).toBe('sk-x')
    expect(root.meta.plaintextMode).toBe(true)
  })

  it('safeStorage 不可用 + 降级关 → fail-closed 拒绝，不改库', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    const out = addKey(root, input(), 1000)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('fail-closed')
    expect(root.keys).toHaveLength(0)
  })

  it('custom 无默认 testModel 缺填 → invalid-input', () => {
    const root = defaultDbRoot()
    const out = addKey(root, input({ provider: 'custom', testModel: undefined }), 1000)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('invalid-input')
    expect(root.keys).toHaveLength(0)
  })

  it('custom 填 testModel → 通过', () => {
    const root = defaultDbRoot()
    const out = addKey(root, input({ provider: 'custom', testModel: 'my-model' }), 1000)
    expect(out.ok).toBe(true)
    expect(root.keys[0].testModel).toBe('my-model')
  })

  it('有 plaintext 记录 → syncPlaintextMode 联动 plaintextMode=true', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.meta.allowPlaintextFallback = true
    addKey(root, input(), 1000)
    expect(root.meta.plaintextMode).toBe(true)
  })
})

describe('updateKey', () => {
  it('元数据更新保留 secret + status', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1', status: 'valid', encSecret: encFor('sk-old'), lastChecked: 100 })]
    const out = updateKey(root, 'k1', input({ name: 'new-name', secret: undefined }), 2000)
    expect(out.ok).toBe(true)
    const rec = root.keys[0]
    expect(rec.name).toBe('new-name')
    expect(rec.encSecret).toBe(encFor('sk-old')) // 保留
    expect(rec.status).toBe('valid') // 保留
    expect(rec.lastChecked).toBe(100) // 保留
    expect(rec.updatedAt).toBe(2000)
  })

  it('传新 secret → 重加密 + 重置 status=unchecked + 清 lastChecked 等', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1', status: 'valid', lastChecked: 100, lastCheckMode: 'deep', lastDeepCheckedAt: 100, lastError: 'E' })]
    const out = updateKey(root, 'k1', input({ secret: 'sk-new' }), 2000)
    expect(out.ok).toBe(true)
    const rec = root.keys[0]
    expect(rec.encSecret).toBe(encFor('sk-new'))
    expect(rec.status).toBe('unchecked')
    expect(rec.lastChecked).toBeUndefined()
    expect(rec.lastCheckMode).toBeUndefined()
    expect(rec.lastDeepCheckedAt).toBeUndefined()
    expect(rec.lastError).toBeUndefined()
  })

  it('未找到 → not-found', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1' })]
    const out = updateKey(root, 'nope', input(), 2000)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('not-found')
  })

  it('传新 secret 但 safeStorage 不可用且未降级 → fail-closed，完全不改库', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1', name: 'orig', encSecret: encFor('sk-old'), status: 'valid' })]
    const out = updateKey(root, 'k1', input({ name: 'new-name', secret: 'sk-new' }), 2000)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('fail-closed')
    // fail-closed 在改动前拒绝：secret 和元数据都保持原样
    expect(root.keys[0].encSecret).toBe(encFor('sk-old'))
    expect(root.keys[0].name).toBe('orig')
    expect(root.keys[0].status).toBe('valid')
  })

  it('元数据改 provider 为 custom 但缺 testModel → invalid-input', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'k1' })]
    const out = updateKey(root, 'k1', input({ provider: 'custom', testModel: undefined, secret: undefined }), 2000)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('invalid-input')
  })

  it('secret 改为 plaintext 模式 → syncPlaintextMode 联动', () => {
    mockSafeStorage._setAvailable(false)
    const root = defaultDbRoot()
    root.meta.allowPlaintextFallback = true
    root.keys = [key({ id: 'k1', secretMode: 'safeStorage' })]
    updateKey(root, 'k1', input({ secret: 'sk-plain' }), 2000)
    expect(root.keys[0].secretMode).toBe('plaintext')
    expect(root.meta.plaintextMode).toBe(true)
  })
})

describe('removeKey', () => {
  it('找到删除', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a' }), key({ id: 'b' })]
    const out = removeKey(root, 'a')
    expect(out.ok).toBe(true)
    expect(root.keys).toHaveLength(1)
    expect(root.keys[0].id).toBe('b')
  })

  it('未找到 → not-found', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a' })]
    const out = removeKey(root, 'nope')
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('not-found')
    expect(root.keys).toHaveLength(1)
  })

  it('删掉唯一 plaintext 记录 → plaintextMode 归 false', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a', secretMode: 'plaintext' })]
    root.meta.plaintextMode = true
    removeKey(root, 'a')
    expect(root.meta.plaintextMode).toBe(false)
  })
})