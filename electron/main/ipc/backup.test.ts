// backup handler 测试：restore 明文二次确认门 + 成功后 db.read/reschedule；export 写文件。
// restoreBackup/mock 以隔离 glue（restoreBackup 本身已在 M4.5 测过）。

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { RestoreResult } from './types'

const { mockRestore } = vi.hoisted(() => ({
  // 默认成功；按测试改返回值。返回类型显式标 RestoreResult，使 mockResolvedValue
  // 可同时接受成功/失败两种变体。
  mockRestore: vi.fn(async (): Promise<RestoreResult> => ({ ok: true, migrated: false, reencrypted: 0, rolledBack: false }))
}))
vi.mock('../backup/restore', () => ({ restoreBackup: mockRestore }))

// buildBackup 用真实 safeStorage（可逆 mock）。
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

import { handleExport, handleRestore } from './backup'
import { makeDb, makeKey, makeDeps } from './testutil'
import { buildBackup } from '../backup/pack'
import type { HikeyBackup } from '../backup/types'

function ciphertextBackupJson(): string {
  const root = makeDb([makeKey()]).data
  return JSON.stringify(buildBackup(root), null, 2)
}

function plaintextBackupJson(): string {
  const root = makeDb([makeKey({ secretMode: 'plaintext', encSecret: 'sk-plain' })]).data
  // 明文标记备份：verifier=null + plaintextBackup=true（buildBackup 在 safeStorage 可用时
  // 产出密文备份，此处手动构造以保证 plaintextBackup=true，不受 safeStorage mock 状态影响）
  const backup: HikeyBackup = {
    schemaVersion: 2,
    keys: root.keys,
    meta: root.meta,
    verifier: null,
    plaintextBackup: true,
    plaintextRecordCount: 1
  }
  return JSON.stringify(backup, null, 2)
}

describe('handleRestore', () => {
  beforeEach(() => {
    mockRestore.mockReset()
    mockRestore.mockResolvedValue({ ok: true, migrated: false, reencrypted: 0, rolledBack: false })
  })

  it('密文备份 → 不弹二次确认 → restoreBackup + 成功后 db.read + reschedule', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }) } as never,
      fs: { readFile: async () => ciphertextBackupJson() } as never
    })
    const showMessageBox = vi.spyOn(deps.dialog, 'showMessageBox')

    const out = await handleRestore(deps)
    expect(out.ok).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled() // 密文备份无二次确认
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(deps.db.read).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.reschedule).toHaveBeenCalledTimes(1)
  })

  it('明文标记备份 → showMessageBox 二次确认，用户取消 → restoreBackup 不调 + 返回 cancelled', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }),
        showMessageBox: async () => ({ response: 0, checkboxChecked: false }) // 取消
      } as never,
      fs: { readFile: async () => plaintextBackupJson() } as never
    })

    const out = await handleRestore(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('cancelled')
    expect(mockRestore).not.toHaveBeenCalled()
    expect(deps.db.read).not.toHaveBeenCalled()
    expect(deps.scheduler.reschedule).not.toHaveBeenCalled()
  })

  it('明文标记备份 → 用户确认 → restoreBackup + db.read + reschedule', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }),
        showMessageBox: async () => ({ response: 1, checkboxChecked: false }) // 确认恢复
      } as never,
      fs: { readFile: async () => plaintextBackupJson() } as never
    })

    const out = await handleRestore(deps)
    expect(out.ok).toBe(true)
    expect(mockRestore).toHaveBeenCalledTimes(1)
    expect(deps.db.read).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.reschedule).toHaveBeenCalledTimes(1)
  })

  it('restoreBackup 失败 → 不 db.read 不 reschedule，透传失败原因', async () => {
    mockRestore.mockResolvedValue({ ok: false, reason: 'not-same-machine', message: '跨机', rolledBack: false })
    const deps = makeDeps({
      db: makeDb(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }) } as never,
      fs: { readFile: async () => ciphertextBackupJson() } as never
    })

    const out = await handleRestore(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('not-same-machine')
    expect(deps.db.read).not.toHaveBeenCalled()
    expect(deps.scheduler.reschedule).not.toHaveBeenCalled()
  })

  it('dialog 取消 → 返回 cancelled，不读备份', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } as never
    })
    const out = await handleRestore(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('cancelled')
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it('备份 JSON 解析失败 → load-failed', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }) } as never,
      fs: { readFile: async () => '!!!corrupt!!!' } as never
    })
    const out = await handleRestore(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('load-failed')
    expect(mockRestore).not.toHaveBeenCalled()
  })

  it('文件读取抛错 → load-failed', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/b.hikey-backup'] }) } as never,
      fs: { readFile: async () => { throw new Error('EACCES') } } as never
    })
    const out = await handleRestore(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('load-failed')
  })
})

describe('handleExport', () => {
  it('成功 → buildBackup + writeFile + 返回 plaintextRecordCount', async () => {
    const deps = makeDeps({
      db: makeDb([makeKey()]),
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/out.hikey-backup' }) } as never,
      fs: { writeFile: async () => {} } as never
    })
    const writeFile = vi.spyOn(deps.fs, 'writeFile')

    const out = await handleExport(deps)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.plaintextRecordCount).toBe(0)
    expect(writeFile).toHaveBeenCalledTimes(1)
    const [, content] = writeFile.mock.calls[0]
    const parsed = JSON.parse(content as string) as HikeyBackup
    expect(parsed.plaintextBackup).toBe(false)
    expect(parsed.verifier).not.toBeNull()
  })

  it('库内有明文记录 → plaintextRecordCount 计入', async () => {
    const deps = makeDeps({
      db: makeDb([makeKey({ secretMode: 'plaintext', encSecret: 'sk-plain' })]),
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/out.hikey-backup' }) } as never,
      fs: { writeFile: async () => {} } as never
    })
    const out = await handleExport(deps)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.plaintextRecordCount).toBe(1)
  })

  it('dialog 取消 → cancelled，不写文件', async () => {
    const deps = makeDeps({
      dialog: { showSaveDialog: async () => ({ canceled: true, filePath: '' }) } as never,
      fs: { writeFile: async () => {} } as never
    })
    const writeFile = vi.spyOn(deps.fs, 'writeFile')
    const out = await handleExport(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('cancelled')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('writeFile 抛错 → write-failed', async () => {
    const deps = makeDeps({
      db: makeDb(),
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/out.hikey-backup' }) } as never,
      fs: { writeFile: async () => { throw new Error('disk full') } } as never
    })
    const out = await handleExport(deps)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('write-failed')
  })
})