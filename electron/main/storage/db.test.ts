import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { initStorage, getDb } from './db'
import { SCHEMA_VERSION } from './schema'

let userDataDir: string
let dbPath: string

beforeEach(() => {
  userDataDir = join(tmpdir(), `hikey-ud-${randomUUID()}`)
  dbPath = join(userDataDir, 'hikey-db.json')
})

afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
})

async function readDbFile(): Promise<unknown> {
  return JSON.parse(await fs.readFile(dbPath, 'utf8'))
}

describe('initStorage', () => {
  it('文件不存在 → 物化默认根并落盘', async () => {
    await initStorage(userDataDir)
    const onDisk = (await readDbFile()) as { schemaVersion: number; keys: unknown[]; meta: unknown }
    expect(onDisk.schemaVersion).toBe(SCHEMA_VERSION)
    expect(onDisk.keys).toEqual([])
    expect(onDisk.meta).toBeTruthy()
    expect(getDb()).toBeDefined()
  })

  it('二次初始化读回一致（往返）', async () => {
    await initStorage(userDataDir)
    const first = await readDbFile()
    // 再初始化一次：已是 v2、无 checking → 不写回，内容应一致
    await initStorage(userDataDir)
    const second = await readDbFile()
    expect(second).toEqual(first)
  })

  it('历史库（schemaVersion 0 + gemini）→ 迁移并持久化', async () => {
    const legacy = {
      schemaVersion: 0,
      keys: [
        {
          id: 'k1',
          name: 'gemini-key',
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          encSecret: 'enc',
          secretMode: 'safeStorage',
          status: 'unchecked',
          deepCheck: true,
          testModel: 'gemini-1.5',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      meta: {
        checkIntervalMinutes: 15,
        deepCheckEnabled: true,
        deepCheckOnEveryPoll: false,
        concurrentChecks: 4,
        pingTimeoutMs: 2000,
        deepTimeoutMs: 2000,
        allowPlaintextFallback: false,
        plaintextMode: false,
        clipboardClearMs: 60000
      }
    }
    await fs.mkdir(userDataDir, { recursive: true })
    await fs.writeFile(dbPath, JSON.stringify(legacy))

    await initStorage(userDataDir)
    const onDisk = (await readDbFile()) as {
      schemaVersion: number
      keys: { provider: string; status: string; lastError?: string }[]
    }
    expect(onDisk.schemaVersion).toBe(SCHEMA_VERSION)
    expect(onDisk.keys[0].provider).toBe('custom')
    expect(onDisk.keys[0].lastError).toContain('原 provider=gemini')
  })

  it('已是当前版本且无变更 → 不写回，原文件字节不变', async () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      keys: [],
      meta: {
        checkIntervalMinutes: 15,
        deepCheckEnabled: true,
        deepCheckOnEveryPoll: false,
        concurrentChecks: 4,
        pingTimeoutMs: 2000,
        deepTimeoutMs: 2000,
        allowPlaintextFallback: false,
        plaintextMode: false,
        clipboardClearMs: 60000
      }
    }
    await fs.mkdir(userDataDir, { recursive: true })
    await fs.writeFile(dbPath, JSON.stringify(current, null, 2))
    const before = await fs.readFile(dbPath, 'utf8')

    await initStorage(userDataDir)
    const after = await fs.readFile(dbPath, 'utf8')
    expect(after).toBe(before)
  })
})