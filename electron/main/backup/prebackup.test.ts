import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  writePreBackup,
  isCurrentDbReadable,
  preBackupFilename,
  backupsDir
} from './prebackup'

let workDir: string

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'hikey-prebackup-'))
})

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true })
})

describe('preBackupFilename', () => {
  it('含时间戳 + .hikey-backup 后缀', () => {
    expect(preBackupFilename(1700000000)).toBe('hikey-db.pre-restore.1700000000.hikey-backup')
  })
})

describe('isCurrentDbReadable', () => {
  it('文件存在 + 合法 JSON → true', async () => {
    const p = join(workDir, 'db.json')
    await fs.writeFile(p, '{"schemaVersion":2,"keys":[],"meta":{}}', 'utf8')
    expect(await isCurrentDbReadable(p)).toBe(true)
  })
  it('文件不存在 → false', async () => {
    expect(await isCurrentDbReadable(join(workDir, 'nope.json'))).toBe(false)
  })
  it('文件存在但非法 JSON（损坏）→ false', async () => {
    const p = join(workDir, 'db.json')
    await fs.writeFile(p, '!!!not json!!!', 'utf8')
    expect(await isCurrentDbReadable(p)).toBe(false)
  })
})

describe('writePreBackup + 保留最近 3', () => {
  it('写文件存在且内容正确', async () => {
    const target = await writePreBackup(workDir, '{"k":1}', 1700000000)
    const content = await fs.readFile(target, 'utf8')
    expect(content).toBe('{"k":1}')
  })

  it('保留最近 3，删超出（造 4 个，最旧被删）', async () => {
    for (const ts of [1700000000, 1700000001, 1700000002, 1700000003]) {
      await writePreBackup(workDir, `{"ts":${ts}}`, ts)
    }
    const dir = backupsDir(workDir)
    const files = (await fs.readdir(dir)).filter((n) => n.endsWith('.hikey-backup'))
    expect(files).toHaveLength(3)
    // 最旧（ts=1700000000）应被删
    expect(files).not.toContain(preBackupFilename(1700000000))
    expect(files).toContain(preBackupFilename(1700000003))
  })

  it('目录不存在时自动创建', async () => {
    const target = await writePreBackup(workDir, '{}', 1700000000)
    const dir = backupsDir(workDir)
    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
    expect(target).toContain('backups')
  })
})