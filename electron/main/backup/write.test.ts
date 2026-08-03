import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeDbAtomic } from './write'

let workDir: string
let dbPath: string

beforeEach(async () => {
  workDir = await fs.mkdtemp(join(tmpdir(), 'hikey-write-'))
  dbPath = join(workDir, 'hikey-db.json')
})

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true })
})

describe('writeDbAtomic', () => {
  it('成功写入后内容正确', async () => {
    await writeDbAtomic(dbPath, { schemaVersion: 2, keys: [], meta: {} })
    const raw = await fs.readFile(dbPath, 'utf8')
    expect(JSON.parse(raw).schemaVersion).toBe(2)
  })

  it('覆盖既有文件（旧库被替换）', async () => {
    await fs.writeFile(dbPath, '{"old":true}', 'utf8')
    await writeDbAtomic(dbPath, { schemaVersion: 2, keys: [{ id: 'x' }], meta: {} })
    const raw = await fs.readFile(dbPath, 'utf8')
    expect(JSON.parse(raw).keys[0].id).toBe('x')
  })

  it('成功后无残留 tmp 文件', async () => {
    await writeDbAtomic(dbPath, { schemaVersion: 2, keys: [], meta: {} })
    const entries = await fs.readdir(workDir)
    expect(entries).toEqual(['hikey-db.json'])
  })

  it('rename 失败时旧库完好 + tmp 被清理', async () => {
    await fs.writeFile(dbPath, '{"old":true}', 'utf8')
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValue(new Error('rename boom'))
    await expect(writeDbAtomic(dbPath, { schemaVersion: 2, keys: [], meta: {} })).rejects.toThrow('rename boom')
    // 旧库未被动
    expect(await fs.readFile(dbPath, 'utf8')).toBe('{"old":true}')
    // tmp 被清理
    const entries = await fs.readdir(workDir)
    expect(entries.some((n) => n.endsWith('.restore-tmp'))).toBe(false)
    renameSpy.mockRestore()
  })

  it('目录不存在时自动创建', async () => {
    const nested = join(workDir, 'nested', 'deep', 'hikey-db.json')
    await writeDbAtomic(nested, { schemaVersion: 2, keys: [], meta: {} })
    const raw = await fs.readFile(nested, 'utf8')
    expect(JSON.parse(raw).schemaVersion).toBe(2)
  })
})