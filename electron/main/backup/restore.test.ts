import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { restoreBackup } from './restore'
import { buildBackup } from './pack'
import { preBackupFilename, backupsDir } from './prebackup'
import { defaultDbRoot, SCHEMA_VERSION, type KeyRecord, type SecretMode } from '../storage/schema'
import type { HikeyBackup } from './types'

// 可逆 fake safeStorage：可用性 + 解密失败开关（模拟跨机）
const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true, decryptFails: false }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
      decryptString: (s: string) => {
        if (state.decryptFails) throw new Error('cross-machine decrypt boom')
        return Buffer.from(s, 'base64').toString('utf8')
      },
      _setAvailable: (v: boolean) => {
        state.available = v
      },
      _setDecryptFails: (v: boolean) => {
        state.decryptFails = v
      }
    }
  }
})

vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

let workDir: string
let dbPath: string

function encFor(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64')
}

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k',
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

function rootWith(keys: KeyRecord[]) {
  const r = defaultDbRoot()
  r.keys = keys
  return r
}

async function writeDb(root: { schemaVersion: number; keys: KeyRecord[]; meta: unknown }) {
  await fs.writeFile(dbPath, JSON.stringify(root, null, 2), 'utf8')
}

async function readDb(): Promise<{ schemaVersion: number; keys: KeyRecord[]; meta: unknown }> {
  return JSON.parse(await fs.readFile(dbPath, 'utf8'))
}

beforeEach(async () => {
  mockSafeStorage._setAvailable(true)
  mockSafeStorage._setDecryptFails(false)
  workDir = await fs.mkdtemp(join(tmpdir(), 'hikey-restore-'))
  dbPath = join(workDir, 'hikey-db.json')
})

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true })
})

describe('restoreBackup', () => {
  it('密文备份同机恢复 → 成功 + 落盘', async () => {
    const src = rootWith([key({ id: 'a', name: 'openai-1' })])
    const backup = buildBackup(src)
    const out = await restoreBackup(backup, workDir, 1700000000)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.migrated).toBe(false) // schemaVersion 已是 2，无 gemini
      expect(out.reencrypted).toBe(0)
    }
    const db = await readDb()
    expect(db.keys).toHaveLength(1)
    expect(db.keys[0].name).toBe('openai-1')
    expect(db.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('密文备份跨机（verifier 解密失败）→ 整体拒绝，当前库未动', async () => {
    await writeDb(rootWith([key({ id: 'old' })]))
    const backup = buildBackup(rootWith([key({ id: 'new' })]))
    mockSafeStorage._setDecryptFails(true) // 恢复时解密失败 = 跨机
    const out = await restoreBackup(backup, workDir, 1700000000)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('not-same-machine')
    const db = await readDb()
    expect(db.keys[0].id).toBe('old') // 未被动
  })

  it('明文标记备份 → 跳过 verifier 恢复成功', async () => {
    mockSafeStorage._setAvailable(false) // 导出时不可用 → 明文标记备份
    const src = rootWith([key({ id: 'p', encSecret: 'sk-plain', secretMode: 'plaintext' })])
    const plainBackup = buildBackup(src)
    expect(plainBackup.plaintextBackup).toBe(true)
    expect(plainBackup.verifier).toBeNull()

    mockSafeStorage._setAvailable(true) // 恢复时 safeStorage 已恢复
    const out = await restoreBackup(plainBackup, workDir, 1700000000)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.reencrypted).toBe(1) // 恢复后重加密该明文记录
    const db = await readDb()
    expect(db.keys[0].secretMode).toBe('safeStorage') // 已重加密
  })

  it('畸形组合（verifier 非 null + plaintextBackup=true）→ 拒绝', async () => {
    await writeDb(rootWith([key({ id: 'old' })]))
    const bad: HikeyBackup = {
      schemaVersion: 2,
      keys: [],
      meta: defaultDbRoot().meta,
      verifier: 'AAAA',
      plaintextBackup: true, // 非法：verifier 非 null
      plaintextRecordCount: 0
    }
    const out = await restoreBackup(bad, workDir, 1700000000)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('shape-invalid')
    const db = await readDb()
    expect(db.keys[0].id).toBe('old') // 未被动
  })

  it('当前库可读 + 预备份失败 → 中止恢复', async () => {
    await writeDb(rootWith([key({ id: 'old' })]))
    const backup = buildBackup(rootWith([key({ id: 'new' })]))
    // 让 writePreBackup 失败：把 backups 目录占位为文件（mkdir 失败）
    const dir = backupsDir(workDir)
    await fs.writeFile(dir, 'block', 'utf8') // 同名文件堵住 mkdir
    const out = await restoreBackup(backup, workDir, 1700000000)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('prebackup-failed')
    const db = await readDb()
    expect(db.keys[0].id).toBe('old') // 未动
  })

  it('当前库损坏 → 跳过预备份继续恢复成功', async () => {
    await fs.writeFile(dbPath, '!!!corrupt!!!', 'utf8') // 损坏
    const backup = buildBackup(rootWith([key({ id: 'new' })]))
    const out = await restoreBackup(backup, workDir, 1700000000)
    expect(out.ok).toBe(true)
    const db = await readDb()
    expect(db.keys[0].id).toBe('new')
    // 损坏库跳过了预备份，backups 目录不应有预备份
    const dir = backupsDir(workDir)
    let entries: string[] = []
    try {
      entries = await fs.readdir(dir)
    } catch {
      entries = []
    }
    expect(entries).not.toContain(preBackupFilename(1700000000))
  })

  it('恢复后迁移失败 → 回滚到旧库状态', async () => {
    const oldRoot = rootWith([key({ id: 'old' })])
    await writeDb(oldRoot)
    const backup = buildBackup(rootWith([key({ id: 'new' })]))

    // 让 migrate 抛错：spyOn migrate
    const migrateMod = await import('../storage/migrate')
    const spy = vi.spyOn(migrateMod, 'migrate').mockImplementation(() => {
      throw new Error('migrate boom')
    })

    const out = await restoreBackup(backup, workDir, 1700000000)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.reason).toBe('migrate-failed')
      expect(out.rolledBack).toBe(true)
    }
    // 旧库回滚：内容 = 恢复前
    const db = await readDb()
    expect(db.keys[0].id).toBe('old')
    spy.mockRestore()
  })

  it('旧备份 schemaVersion<2 + gemini provider → 恢复后迁移成 custom + lastError', async () => {
    const oldBackup: HikeyBackup = {
      schemaVersion: 1,
      keys: [
        key({ id: 'g', provider: 'gemini' as unknown as KeyRecord['provider'] })
      ] as KeyRecord[],
      meta: defaultDbRoot().meta,
      verifier: 'verifier-blob',
      plaintextBackup: false,
      plaintextRecordCount: 0
    }
    // 直接造一个密文备份：用 makeVerifier 产出真实 verifier
    const realVerifier = Buffer.from('HIKEY_BACKUP_VERIFIER_v1', 'utf8').toString('base64')
    oldBackup.verifier = realVerifier

    const out = await restoreBackup(oldBackup, workDir, 1700000000)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.migrated).toBe(true)
    const db = await readDb()
    expect(db.schemaVersion).toBe(SCHEMA_VERSION)
    expect(db.keys[0].provider).toBe('custom')
    expect(db.keys[0].lastError).toContain('已迁移为 custom')
  })

  it('正常恢复生成预备份文件', async () => {
    await writeDb(rootWith([key({ id: 'old' })]))
    const backup = buildBackup(rootWith([key({ id: 'new' })]))
    await restoreBackup(backup, workDir, 1700000000)
    const dir = backupsDir(workDir)
    const files = await fs.readdir(dir)
    expect(files).toContain(preBackupFilename(1700000000))
  })
})