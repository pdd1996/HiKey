import { describe, it, expect } from 'vitest'
import { syncPlaintextMode } from './plaintext'
import { defaultDbRoot, type KeyRecord } from './schema'

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: 'enc',
    secretMode: 'safeStorage',
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

describe('syncPlaintextMode', () => {
  it('全 safeStorage 记录 → plaintextMode=false，不变更', () => {
    const root = defaultDbRoot()
    root.keys = [key(), key()]
    expect(root.meta.plaintextMode).toBe(false)
    expect(syncPlaintextMode(root).changed).toBe(false)
    expect(root.meta.plaintextMode).toBe(false)
  })

  it('有 1 条 plaintext → plaintextMode=true，变更', () => {
    const root = defaultDbRoot()
    root.keys = [key(), key({ secretMode: 'plaintext' })]
    expect(syncPlaintextMode(root).changed).toBe(true)
    expect(root.meta.plaintextMode).toBe(true)
  })

  it('幂等：再调一次 changed=false', () => {
    const root = defaultDbRoot()
    root.keys = [key({ secretMode: 'plaintext' })]
    syncPlaintextMode(root)
    expect(syncPlaintextMode(root).changed).toBe(false)
  })

  it('plaintext 记录清空 → 置回 false，变更', () => {
    const root = defaultDbRoot()
    root.keys = [key({ secretMode: 'plaintext' })]
    syncPlaintextMode(root)
    root.keys = [key()]
    expect(syncPlaintextMode(root).changed).toBe(true)
    expect(root.meta.plaintextMode).toBe(false)
  })
})