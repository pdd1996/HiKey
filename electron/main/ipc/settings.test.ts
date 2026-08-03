// settings handler 测试：validateMeta 范围校验 + allowPlaintextFallback 关闭门 + reschedule 接线。

import { describe, it, expect, vi } from 'vitest'

const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

import { handleGet, handleSet, validateMeta } from './settings'
import { makeDb, makeDeps } from './testutil'
import type { Meta } from '../storage/schema'

describe('handleSet', () => {
  it('set checkIntervalMinutes 合法 → db.write + reschedule', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { checkIntervalMinutes: 30 })
    expect(out.ok).toBe(true)
    expect(deps.db.data.meta.checkIntervalMinutes).toBe(30)
    expect(deps.db.write).toHaveBeenCalledTimes(1)
    expect(deps.scheduler.reschedule).toHaveBeenCalledTimes(1)
  })

  it('set 合法 partial → 仅覆盖传入字段，其余保留', async () => {
    const deps = makeDeps()
    const original = { ...deps.db.data.meta }
    const out = await handleSet(deps, { deepCheckEnabled: false })
    expect(out.ok).toBe(true)
    expect(deps.db.data.meta.deepCheckEnabled).toBe(false)
    expect(deps.db.data.meta.checkIntervalMinutes).toBe(original.checkIntervalMinutes)
  })

  it('checkIntervalMinutes=0 → 拒绝（<5），不写库不 reschedule', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { checkIntervalMinutes: 0 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('检测间隔')
    expect(deps.db.write).not.toHaveBeenCalled()
    expect(deps.scheduler.reschedule).not.toHaveBeenCalled()
  })

  it('checkIntervalMinutes=1500 → 拒绝（>1440）', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { checkIntervalMinutes: 1500 })
    expect(out.ok).toBe(false)
  })

  it('checkIntervalMinutes 非整数 → 拒绝', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { checkIntervalMinutes: 15.5 } as Partial<Meta>)
    expect(out.ok).toBe(false)
  })

  it('concurrentChecks=0 → 拒绝', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { concurrentChecks: 0 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('并发')
  })

  it('pingTimeoutMs≤0 → 拒绝', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { pingTimeoutMs: 0 })
    expect(out.ok).toBe(false)
  })

  it('clipboardClearMs≤0 → 拒绝', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { clipboardClearMs: -1 })
    expect(out.ok).toBe(false)
  })

  it('plaintextMode 直接设 → 拒绝（派生字段）', async () => {
    const deps = makeDeps()
    const out = await handleSet(deps, { plaintextMode: true } as Partial<Meta>)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('plaintextMode')
    expect(deps.db.data.meta.plaintextMode).toBe(false) // 未被改
  })

  it('allowPlaintextFallback:false + safeStorage 不可用 + 仍有明文记录 → 拒绝（PRD 不可关闭门）', async () => {
    mockSafeStorage.isEncryptionAvailable = () => false
    try {
      const deps = makeDeps({ db: makeDb([], { allowPlaintextFallback: true, plaintextMode: true }) })
      const out = await handleSet(deps, { allowPlaintextFallback: false })
      expect(out.ok).toBe(false)
      if (!out.ok) expect(out.reason).toContain('无法关闭')
      expect(deps.db.data.meta.allowPlaintextFallback).toBe(true) // 未被改
      expect(deps.scheduler.reschedule).not.toHaveBeenCalled()
    } finally {
      mockSafeStorage.isEncryptionAvailable = () => true
    }
  })

  it('allowPlaintextFallback:false + safeStorage 不可用 + 无明文记录（plaintextMode=false）→ 允许', async () => {
    mockSafeStorage.isEncryptionAvailable = () => false
    try {
      const deps = makeDeps({ db: makeDb([], { allowPlaintextFallback: true, plaintextMode: false }) })
      const out = await handleSet(deps, { allowPlaintextFallback: false })
      expect(out.ok).toBe(true)
      expect(deps.db.data.meta.allowPlaintextFallback).toBe(false)
    } finally {
      mockSafeStorage.isEncryptionAvailable = () => true
    }
  })

  it('allowPlaintextFallback:false + safeStorage 可用 → 允许（重加密完成后可关）', async () => {
    const deps = makeDeps({ db: makeDb([], { allowPlaintextFallback: true, plaintextMode: false }) })
    const out = await handleSet(deps, { allowPlaintextFallback: false })
    expect(out.ok).toBe(true)
  })
})

describe('handleGet', () => {
  it('返回当前 meta', () => {
    const deps = makeDeps({ db: makeDb([], { checkIntervalMinutes: 45 }) })
    const meta = handleGet(deps)
    expect(meta.checkIntervalMinutes).toBe(45)
  })
})

describe('validateMeta 纯函数', () => {
  it('布尔字段类型错 → 拒绝', () => {
    const m = makeDb().data.meta
    expect(validateMeta({ deepCheckEnabled: 'yes' as unknown as boolean }, m).ok).toBe(false)
    expect(validateMeta({ deepCheckOnEveryPoll: 1 as unknown as boolean }, m).ok).toBe(false)
    expect(validateMeta({ allowPlaintextFallback: 'true' as unknown as boolean }, m).ok).toBe(false)
  })

  it('null 输入 → 拒绝', () => {
    const m = makeDb().data.meta
    expect(validateMeta(null as unknown as Partial<Meta>, m).ok).toBe(false)
  })

  it('空对象 → 通过（无字段要改）', () => {
    const m = makeDb().data.meta
    expect(validateMeta({}, m).ok).toBe(true)
  })
})