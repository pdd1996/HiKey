import { describe, it, expect } from 'vitest'
import { listKeys } from './list'
import { defaultDbRoot, type KeyRecord, type SecretMode } from '../storage/schema'

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: 'enc-secret-blob',
    secretMode: 'safeStorage' as SecretMode,
    status: '200',
    lastChecked: 100,
    lastCheckMode: 'deep',
    lastDeepCheckedAt: 100,
    lastError: '脱敏错误',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    notes: 'note',
    ...over
  }
}

describe('listKeys', () => {
  it('剥 encSecret', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a' })]
    const view = listKeys(root)
    expect(view[0]).not.toHaveProperty('encSecret')
    expect(JSON.stringify(view[0])).not.toContain('enc-secret-blob')
  })

  it('保留 secretMode / lastError / 其余字段', () => {
    const root = defaultDbRoot()
    root.keys = [key({ secretMode: 'plaintext', lastError: 'E' })]
    const v = listKeys(root)[0]
    expect(v.secretMode).toBe('plaintext')
    expect(v.lastError).toBe('E')
    expect(v.name).toBe('n')
    expect(v.status).toBe('200')
    expect(v.lastChecked).toBe(100)
  })

  it('空库 → []', () => {
    expect(listKeys(defaultDbRoot())).toEqual([])
  })

  it('数量正确 + 保留库内顺序', () => {
    const root = defaultDbRoot()
    root.keys = [key({ id: 'a', name: '1' }), key({ id: 'b', name: '2' }), key({ id: 'c', name: '3' })]
    const view = listKeys(root)
    expect(view).toHaveLength(3)
    expect(view.map((k) => k.id)).toEqual(['a', 'b', 'c'])
  })
})