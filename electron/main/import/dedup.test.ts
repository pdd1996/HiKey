import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { buildDedupContext, classifyItem, addToContext } from './dedup'
import { secretHash } from './mask'
import type { KeyRecord, SecretMode } from '../storage/schema'
import type { ParsedItem } from './types'

// mock electron safeStorage：默认可用、可逆（沿用 M2/M3 范式）
const { mockAvailable } = vi.hoisted(() => ({ mockAvailable: { value: true } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mockAvailable.value,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))

function encFor(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64')
}

function rec(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: randomUUID(),
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

function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return {
    id: 'env-0',
    name: 'openai-1',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    secret: 'sk-secret',
    source: 'env',
    ...over
  }
}

describe('buildDedupContext', () => {
  it('safeStorage 记录入 name + secret 集合', () => {
    const k = rec({ name: 'openai-1', encSecret: encFor('sk-H') })
    const ctx = buildDedupContext([k])
    expect(ctx.nameSet.has('openai|openai-1')).toBe(true)
    expect(ctx.secretHashSet.has(secretHash('sk-H'))).toBe(true)
    expect(ctx.nameToId.get('openai|openai-1')).toBe(k.id)
    expect(ctx.hashToId.get(secretHash('sk-H'))).toBe(k.id)
  })

  it('plaintext 记录同样入 name + secret 集合', () => {
    const k = rec({ secretMode: 'plaintext', encSecret: 'sk-plain' })
    const ctx = buildDedupContext([k])
    expect(ctx.secretHashSet.has(secretHash('sk-plain'))).toBe(true)
  })

  it('undecryptable（safeStorage 不可用 + safeStorage 模式）→ secret 维跳过、name 维仍入', () => {
    mockAvailable.value = false
    try {
      const k = rec({ name: 'openai-1', encSecret: encFor('sk-H') })
      const ctx = buildDedupContext([k])
      expect(ctx.nameSet.has('openai|openai-1')).toBe(true)
      expect(ctx.secretHashSet.has(secretHash('sk-H'))).toBe(false)
      expect(ctx.hashToId.has(secretHash('sk-H'))).toBe(false)
    } finally {
      mockAvailable.value = true
    }
  })
})

describe('classifyItem', () => {
  it('都不命中 → new', () => {
    const ctx = buildDedupContext([])
    expect(classifyItem(item({ name: 'openai-9', secret: 'sk-z' }), ctx)).toEqual({ status: 'new' })
  })

  it('name 命中库 → duplicate(db, name)', () => {
    const k = rec({ name: 'openai-1', encSecret: encFor('sk-other') })
    const ctx = buildDedupContext([k])
    const c = classifyItem(item({ name: 'openai-1', secret: 'sk-different' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'name', dupOf: 'db', dupTargetId: k.id })
  })

  it('secret 命中库 → duplicate(db, secret)', () => {
    const k = rec({ name: 'other-name', encSecret: encFor('sk-H') })
    const ctx = buildDedupContext([k])
    const c = classifyItem(item({ name: 'openai-1', secret: 'sk-H' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'secret', dupOf: 'db', dupTargetId: k.id })
  })

  it('name+secret 都命中同一记录 → name+secret', () => {
    const k = rec({ name: 'openai-1', encSecret: encFor('sk-H') })
    const ctx = buildDedupContext([k])
    const c = classifyItem(item({ name: 'openai-1', secret: 'sk-H' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'name+secret', dupOf: 'db', dupTargetId: k.id })
  })

  it('name+secret 命中不同库记录 → name 命中优先为目标', () => {
    const kName = rec({ id: 'kn', name: 'openai-1', encSecret: encFor('sk-nameSecret') })
    const kSecret = rec({ id: 'ks', name: 'other', encSecret: encFor('sk-H') })
    const ctx = buildDedupContext([kName, kSecret])
    const c = classifyItem(item({ name: 'openai-1', secret: 'sk-H' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'name+secret', dupOf: 'db', dupTargetId: 'kn' })
  })

  it('仅批次内命中 → duplicate(batch)，无 dupTargetId', () => {
    const ctx = buildDedupContext([])
    const first = item({ name: 'openai-1', secret: 'sk-H' })
    addToContext(first, ctx)
    const c = classifyItem(item({ name: 'openai-1', secret: 'sk-H' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'name+secret', dupOf: 'batch' })
    expect(c.dupTargetId).toBeUndefined()
  })

  it('addToContext 后 secret 维也可批次内命中', () => {
    const ctx = buildDedupContext([])
    addToContext(item({ name: 'a', secret: 'sk-H' }), ctx)
    const c = classifyItem(item({ name: 'b', secret: 'sk-H' }), ctx)
    expect(c).toMatchObject({ status: 'duplicate', dupKind: 'secret', dupOf: 'batch' })
  })
})