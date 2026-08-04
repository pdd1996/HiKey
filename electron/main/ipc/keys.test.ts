// keys handler 测试：reveal 剪贴板接线 + add/update 保存即检测。
// 复用 scheduler.test 的 safeStorage 可逆 mock。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleReveal, handleAdd, handleUpdate, handleList, handleRemove, toSafeView } from './keys'
import { makeDb, makeKey, makeDeps } from './testutil'
import type { IpcDeps } from './types'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

describe('handleReveal 剪贴板接线', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reveal ok → writeText(明文) + 60s 后比对命中 → clear 被调', () => {
    const k = makeKey({ encSecret: Buffer.from('sk-x', 'utf8').toString('base64') })
    const deps = makeDeps({ db: makeDb([k]) })
    deps.clipboard.readText.mockReturnValue('sk-x')

    const out = handleReveal(deps, k.id)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.plaintext).toBe('sk-x')
    expect(deps.clipboard.writeText).toHaveBeenCalledTimes(1)
    expect(deps.clipboard.writeText).toHaveBeenCalledWith('sk-x')
    expect(deps.clipboard.clear).not.toHaveBeenCalled()

    vi.advanceTimersByTime(deps.db.data.meta.clipboardClearMs) // 60000
    expect(deps.clipboard.clear).toHaveBeenCalledTimes(1)
  })

  it('60s 后剪贴板内容已变 → 不清（避免误清用户期间复制的其他内容）', () => {
    const k = makeKey({ encSecret: Buffer.from('sk-x', 'utf8').toString('base64') })
    const deps = makeDeps({ db: makeDb([k]) })
    deps.clipboard.readText.mockReturnValue('other-stuff')

    handleReveal(deps, k.id)
    vi.advanceTimersByTime(deps.db.data.meta.clipboardClearMs)
    expect(deps.clipboard.clear).not.toHaveBeenCalled()
  })

  it('未到 60s → 不读不清', () => {
    const k = makeKey({ encSecret: Buffer.from('sk-x', 'utf8').toString('base64') })
    const deps = makeDeps({ db: makeDb([k]) })
    deps.clipboard.readText.mockReturnValue('sk-x')

    handleReveal(deps, k.id)
    vi.advanceTimersByTime(deps.db.data.meta.clipboardClearMs - 1)
    expect(deps.clipboard.clear).not.toHaveBeenCalled()
  })

  it('reveal undecryptable（safeStorage 不可用）→ 不动剪贴板', () => {
    mockSafeStorage.isEncryptionAvailable = () => false
    try {
      const k = makeKey({ encSecret: Buffer.from('sk-x', 'utf8').toString('base64') })
      const deps = makeDeps({ db: makeDb([k]) })
      deps.clipboard.readText.mockReturnValue('sk-x')

      const out = handleReveal(deps, k.id)
      expect(out.ok).toBe(false)
      expect(deps.clipboard.writeText).not.toHaveBeenCalled()
      vi.advanceTimersByTime(deps.db.data.meta.clipboardClearMs)
      expect(deps.clipboard.clear).not.toHaveBeenCalled()
    } finally {
      mockSafeStorage.isEncryptionAvailable = () => true
    }
  })

  it('reveal not-found → 不动剪贴板', () => {
    const deps = makeDeps()
    const out = handleReveal(deps, 'no-such-id')
    expect(out.ok).toBe(false)
    expect(deps.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('delayMs 取自 meta.clipboardClearMs（自定义值生效）', () => {
    const k = makeKey({ encSecret: Buffer.from('sk-y', 'utf8').toString('base64') })
    const deps = makeDeps({ db: makeDb([k], { clipboardClearMs: 3000 }) })
    expect(deps.db.data.meta.clipboardClearMs).toBe(3000)
    deps.clipboard.readText.mockReturnValue('sk-y')

    handleReveal(deps, k.id)
    vi.advanceTimersByTime(2999)
    expect(deps.clipboard.clear).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(deps.clipboard.clear).toHaveBeenCalledTimes(1)
  })
})

describe('keys CRUD 接线', () => {
  it('add 成功 → db.write + scheduler.checkNow(id)', async () => {
    const deps = makeDeps()
    const input = { provider: 'openai' as const, name: 'n', baseUrl: 'https://api.openai.com', secret: 'sk-x' }
    const out = await handleAdd(deps, input)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.id).toBeTruthy()
    expect(deps.db.write).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.checkNow).toHaveBeenCalledWith(out.id, 'ping')
  })

  it('add 失败（fail-closed，safeStorage 不可用 + 未开降级）→ 不写库不检测', async () => {
    mockSafeStorage.isEncryptionAvailable = () => false
    const deps = makeDeps()
    const input = { provider: 'openai' as const, name: 'n', baseUrl: 'https://api.openai.com', secret: 'sk-x' }
    const out = await handleAdd(deps, input)
    expect(out.ok).toBe(false)
    expect(deps.db.write).not.toHaveBeenCalled()
    expect(deps.scheduler.checkNow).not.toHaveBeenCalled()
    mockSafeStorage.isEncryptionAvailable = () => true
  })

  it('update 成功 → db.write + checkNow(id)', async () => {
    const k = makeKey()
    const deps = makeDeps({ db: makeDb([k]) })
    const out = await handleUpdate(deps, k.id, { provider: 'openai', name: 'n2', baseUrl: 'https://api.openai.com' })
    expect(out.ok).toBe(true)
    expect(deps.db.write).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.checkNow).toHaveBeenCalledWith(k.id, 'ping')
  })

  it('update not-found → 不写库不检测', async () => {
    const deps = makeDeps()
    const out = await handleUpdate(deps, 'no-such', { provider: 'openai', name: 'n', baseUrl: 'https://api.openai.com' })
    expect(out.ok).toBe(false)
    expect(deps.db.write).not.toHaveBeenCalled()
    expect(deps.scheduler.checkNow).not.toHaveBeenCalled()
  })

  it('remove 成功 → db.write', async () => {
    const k = makeKey()
    const deps = makeDeps({ db: makeDb([k]) })
    const out = await handleRemove(deps, k.id)
    expect(out.ok).toBe(true)
    expect(deps.db.write).toHaveBeenCalledTimes(1)
    expect(deps.db.data.keys).toHaveLength(0)
  })

  it('list → 剥 encSecret', () => {
    const k = makeKey()
    const deps = makeDeps({ db: makeDb([k]) })
    const rows = handleList(deps)
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('encSecret')
    expect(rows[0].id).toBe(k.id)
  })

  it('toSafeView 剥 encSecret 保留其余字段', () => {
    const k = makeKey({ name: 'nn', status: 'valid' })
    const view = toSafeView(k)
    expect(view).not.toHaveProperty('encSecret')
    expect(view.name).toBe('nn')
    expect(view.status).toBe('valid')
    expect(view.secretMode).toBe('safeStorage')
  })
})