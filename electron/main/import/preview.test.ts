import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { buildPreview } from './preview'
import type { KeyRecord, SecretMode } from '../storage/schema'
import type { ParsedItem, SkippedVar } from './types'

// mock electron safeStorage：默认可用、可逆
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
    encSecret: encFor('sk-H'),
    secretMode: 'safeStorage' as SecretMode,
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

function item(over: Partial<ParsedItem>): ParsedItem {
  return {
    id: 'env-0',
    name: 'openai-1',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    secret: 'sk-x',
    source: 'env',
    ...over
  }
}

describe('buildPreview', () => {
  it('对照现有库判定 new/duplicate', () => {
    const existing = [rec({ name: 'openai-1', encSecret: encFor('sk-H') })]
    const items = [
      item({ id: 'env-0', name: 'openai-1', secret: 'sk-H' }), // name+secret dup(db)
      item({ id: 'env-1', name: 'openai-1', secret: 'sk-X' }), // name dup(db)
      item({ id: 'env-2', name: 'other', secret: 'sk-H' }), // secret dup(db)
      item({ id: 'env-3', name: 'deepseek-1', provider: 'deepseek', secret: 'sk-D' }) // new
    ]
    const session = buildPreview(items, [], existing)
    expect(session.rows).toHaveLength(4)

    const r = session.rows
    expect(r[0]).toMatchObject({ status: 'duplicate', dupKind: 'name+secret', dupOf: 'db', action: 'skip' })
    expect(r[0].dupTargetId).toBe(existing[0].id)
    expect(r[1]).toMatchObject({ status: 'duplicate', dupKind: 'name', dupOf: 'db', action: 'skip' })
    expect(r[2]).toMatchObject({ status: 'duplicate', dupKind: 'secret', dupOf: 'db', action: 'skip' })
    expect(r[3]).toMatchObject({ status: 'new', action: 'add' })

    // items Map 保留明文 secret
    expect(session.items.get('env-3')?.secret).toBe('sk-D')
  })

  it('批次内重复：首现 new 入集合，后续 duplicate(batch) 不可覆盖', () => {
    const items = [
      item({ id: 'env-0', name: 'openai-1', secret: 'sk-X' }),
      item({ id: 'env-1', name: 'openai-1', secret: 'sk-Z' })
    ]
    const session = buildPreview(items, [], [])
    expect(session.rows[0]).toMatchObject({ status: 'new', action: 'add' })
    expect(session.rows[1]).toMatchObject({ status: 'duplicate', dupKind: 'name', dupOf: 'batch', action: 'skip' })
    expect(session.rows[1].dupTargetId).toBeUndefined()
  })

  it('keyMask 掩码正确', () => {
    const items = [item({ id: 'env-0', secret: 'sk-abcdef1234567890' })]
    const session = buildPreview(items, [], [])
    expect(session.rows[0].keyMask).toBe('sk-••••7890')
  })

  it('skipped 变量 → row status=skipped, provider="", action=skip', () => {
    const skipped: SkippedVar[] = [{ id: 'env-9', label: 'FOO', valueMask: '••••', reason: '未识别的变量' }]
    const session = buildPreview([], skipped, [])
    expect(session.rows).toHaveLength(1)
    expect(session.rows[0]).toMatchObject({
      status: 'skipped',
      provider: '',
      action: 'skip',
      keyMask: '••••'
    })
  })

  it('new 入集合后，同 secret 不同 name 也判 batch secret dup', () => {
    const items = [
      item({ id: 'env-0', name: 'a', secret: 'sk-H' }),
      item({ id: 'env-1', name: 'b', secret: 'sk-H' })
    ]
    const session = buildPreview(items, [], [])
    expect(session.rows[0].status).toBe('new')
    expect(session.rows[1]).toMatchObject({ status: 'duplicate', dupKind: 'secret', dupOf: 'batch' })
  })
})