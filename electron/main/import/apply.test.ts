import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { initStorage, getDb } from '../storage/db'
import { applyImport } from './apply'
import { buildPreview } from './preview'
import { parseEnvFile } from './env'
import type { KeyRecord, SecretMode } from '../storage/schema'
import type { ImportSession, ConfirmItem, ParsedItem } from './types'

// mock electron safeStorage：默认可用、可逆
const { mockAvailable } = vi.hoisted(() => ({ mockAvailable: { value: true } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => mockAvailable.value,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))

let userDataDir: string
const NOW = 1_700_000_000_000

function encFor(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64')
}

beforeEach(async () => {
  mockAvailable.value = true
  userDataDir = join(tmpdir(), `hikey-apply-${randomUUID()}`)
  await initStorage(userDataDir)
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
})

function seedRec(over: Partial<KeyRecord> = {}): KeyRecord {
  const rec: KeyRecord = {
    id: randomUUID(),
    name: 'openai-1',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: encFor('sk-old'),
    secretMode: 'safeStorage' as SecretMode,
    status: 'valid',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    lastChecked: 1,
    lastCheckMode: 'ping',
    lastError: 'old err',
    createdAt: 1,
    updatedAt: 1,
    notes: 'my notes',
    ...over
  }
  getDb().data.keys.push(rec)
  return rec
}

function sessionFromEnv(content: string): ImportSession {
  const parsed = parseEnvFile(content)
  return buildPreview(parsed.items, parsed.skipped, getDb().data.keys)
}

function sessionFromItems(items: ParsedItem[]): ImportSession {
  return buildPreview(items, [], getDb().data.keys)
}

describe('applyImport — add / force-add', () => {
  it('add → 新记录默认值正确 + 落库', async () => {
    const session = sessionFromEnv('OPENAI_API_KEY=sk-abcdef1234567890\n')
    const confirms: ConfirmItem[] = [{ id: 'env-0', name: 'openai-1', action: 'add' }]
    const r = await applyImport(confirms, session, NOW)
    expect(r).toMatchObject({ added: 1, overwritten: 0, skipped: 0, failed: 0 })

    const keys = getDb().data.keys
    expect(keys).toHaveLength(1)
    const rec = keys[0]
    expect(rec.provider).toBe('openai')
    expect(rec.name).toBe('openai-1')
    expect(rec.baseUrl).toBe('https://api.openai.com')
    expect(rec.encSecret).toBe(encFor('sk-abcdef1234567890'))
    expect(rec.secretMode).toBe('safeStorage')
    expect(rec.status).toBe('unchecked')
    expect(rec.deepCheck).toBe(true)
    expect(rec.testModel).toBe('gpt-4o-mini')
    expect(rec.notes).toBe('')
    expect(rec.createdAt).toBe(NOW)
    expect(rec.updatedAt).toBe(NOW)
  })

  it('force-add 同 secret 两项共存', async () => {
    const items: ParsedItem[] = [
      { id: 'json-0', name: 'a', provider: 'openai', baseUrl: 'https://x', secret: 'sk-same', source: 'json' },
      { id: 'json-1', name: 'b', provider: 'openai', baseUrl: 'https://x', secret: 'sk-same', source: 'json' }
    ]
    const session = sessionFromItems(items)
    const confirms: ConfirmItem[] = [
      { id: 'json-0', name: 'a', action: 'force-add' },
      { id: 'json-1', name: 'b', action: 'force-add' }
    ]
    const r = await applyImport(confirms, session, NOW)
    expect(r.added).toBe(2)
    expect(getDb().data.keys).toHaveLength(2)
    // 两条 encSecret 相同（同明文同加密）
    expect(getDb().data.keys[0].encSecret).toBe(getDb().data.keys[1].encSecret)
  })
})

describe('applyImport — overwrite', () => {
  it('覆盖：更新 name/baseUrl/secret，保留 testModel/notes/id，状态置 unchecked', async () => {
    const existing = seedRec({ name: 'openai-1', baseUrl: 'https://old', encSecret: encFor('sk-old') })
    // 导入同 name 同 secret（dup db name+secret）
    const session = sessionFromEnv('OPENAI_API_KEY=sk-new-secret-123\n')
    const row = session.rows.find((r) => r.id === 'env-0')!
    expect(row.dupOf).toBe('db')
    expect(row.dupTargetId).toBe(existing.id)

    const confirms: ConfirmItem[] = [{ id: 'env-0', name: 'openai-1', action: 'overwrite' }]
    const r = await applyImport(confirms, session, NOW)
    expect(r).toMatchObject({ overwritten: 1, added: 0 })

    const rec = getDb().data.keys.find((k) => k.id === existing.id)!
    expect(rec.encSecret).toBe(encFor('sk-new-secret-123'))
    expect(rec.name).toBe('openai-1')
    // 保留 testModel/notes/id/createdAt
    expect(rec.testModel).toBe('gpt-4o-mini')
    expect(rec.notes).toBe('my notes')
    expect(rec.id).toBe(existing.id)
    expect(rec.createdAt).toBe(1)
    // 状态重置
    expect(rec.status).toBe('unchecked')
    expect(rec.lastChecked).toBeUndefined()
    expect(rec.lastCheckMode).toBeUndefined()
    expect(rec.lastError).toBeUndefined()
    expect(rec.updatedAt).toBe(NOW)
    // 仅一条记录（未新增）
    expect(getDb().data.keys).toHaveLength(1)
  })

  it('overwrite 但 dupOf=batch（无库目标）→ failed，不写', async () => {
    const items: ParsedItem[] = [
      { id: 'env-0', name: 'a', provider: 'openai', baseUrl: 'https://x', secret: 'sk-1', source: 'env' },
      { id: 'env-1', name: 'a', provider: 'openai', baseUrl: 'https://x', secret: 'sk-2', source: 'env' }
    ]
    const session = sessionFromItems(items)
    const r = await applyImport([{ id: 'env-1', name: 'a', action: 'overwrite' }], session, NOW)
    expect(r.failed).toBe(1)
    expect(r.failures[0].reason).toBe('无可覆盖的库记录')
    expect(getDb().data.keys).toHaveLength(0)
  })

  it('overwrite 目标已被删 → failed', async () => {
    const existing = seedRec({ name: 'openai-1' })
    const session = sessionFromEnv('OPENAI_API_KEY=sk-new-secret-123\n')
    // 删掉目标，模拟并发删除
    getDb().data.keys = getDb().data.keys.filter((k) => k.id !== existing.id)
    const r = await applyImport([{ id: 'env-0', name: 'openai-1', action: 'overwrite' }], session, NOW)
    expect(r.failed).toBe(1)
    expect(r.failures[0].reason).toBe('覆盖目标已不存在')
  })
})

describe('applyImport — fail-closed / 明文降级 / skip', () => {
  it('fail-closed（safeStorage 不可用 + 未开降级）→ add failed，不写', async () => {
    mockAvailable.value = false
    getDb().data.meta.allowPlaintextFallback = false
    const session = sessionFromEnv('OPENAI_API_KEY=sk-abcdef1234567890\n')
    const r = await applyImport([{ id: 'env-0', name: 'openai-1', action: 'add' }], session, NOW)
    expect(r.failed).toBe(1)
    expect(r.failures[0].reason).toContain('fail-closed')
    expect(getDb().data.keys).toHaveLength(0)
  })

  it('明文降级（不可用 + allowPlaintextFallback=true）→ secretMode=plaintext + plaintextMode=true', async () => {
    mockAvailable.value = false
    getDb().data.meta.allowPlaintextFallback = true
    const session = sessionFromEnv('OPENAI_API_KEY=sk-abcdef1234567890\n')
    const r = await applyImport([{ id: 'env-0', name: 'openai-1', action: 'add' }], session, NOW)
    expect(r.added).toBe(1)
    const rec = getDb().data.keys[0]
    expect(rec.secretMode).toBe('plaintext')
    expect(rec.encSecret).toBe('sk-abcdef1234567890') // 明文原样
    expect(getDb().data.meta.plaintextMode).toBe(true)
  })

  it('skip → 不写库、不落盘', async () => {
    const session = sessionFromEnv('OPENAI_API_KEY=sk-abcdef1234567890\n')
    const r = await applyImport([{ id: 'env-0', name: 'openai-1', action: 'skip' }], session, NOW)
    expect(r.skipped).toBe(1)
    expect(getDb().data.keys).toHaveLength(0)
  })

  it('未知条目 id → failed', async () => {
    const session = sessionFromEnv('OPENAI_API_KEY=sk-abcdef1234567890\n')
    const r = await applyImport([{ id: 'nope', name: 'x', action: 'add' }], session, NOW)
    expect(r.failed).toBe(1)
    expect(r.failures[0].reason).toBe('未知条目')
  })
})