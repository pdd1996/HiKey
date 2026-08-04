import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { DEFAULT_META, type KeyRecord, type DbRoot } from '../storage/schema'
import { Scheduler } from './scheduler'
import type { FetchImpl } from './checker'
import type { Low } from 'lowdb'

// mock electron safeStorage：默认可用、可逆。
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

const NOW = 1_700_000_000_000

/**
 * 内存假 db：scheduler 只用 db.data（读写引用）+ db.write()。
 * 原子写落盘已在 adapter.test/db.test 覆盖；此处聚焦编排逻辑，避免 fs 与
 * fake timers 的竞态（afterEach 删目录时未决写会 ENOENT）。
 */
function makeDb(keys: KeyRecord[] = [], metaOver: Partial<typeof DEFAULT_META> = {}): Low<DbRoot> {
  const data: DbRoot = {
    schemaVersion: 2 as DbRoot['schemaVersion'],
    keys,
    meta: { ...DEFAULT_META, ...metaOver }
  }
  return { data, write: async () => {} } as unknown as Low<DbRoot>
}

function key(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: randomUUID(),
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: Buffer.from('sk-secret', 'utf8').toString('base64'),
    secretMode: 'safeStorage',
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

/**
 * 门控 mock fetch：每个请求挂起在 gate 上，直到 releaseOne() 放行；
 * 同时监听 signal，abort 即 reject（模拟取消）。记录峰值并发。
 */
function makeGateFetch(status = 200) {
  const gates: (() => void)[] = []
  let pending = 0
  let maxPending = 0
  const calls: { url: string; method: string }[] = []
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    pending++
    maxPending = Math.max(maxPending, pending)
    calls.push({ url: String(input), method: String(init?.method) })
    try {
      await new Promise<void>((resolve, reject) => {
        gates.push(resolve)
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
      return { status, json: async () => null } as unknown as Response
    } finally {
      pending--
    }
  }) as unknown as ReturnType<typeof vi.fn> & FetchImpl
  const releaseOne = () => gates.shift()?.()
  const releaseAll = () => {
    while (gates.length) gates.shift()?.()
  }
  return { impl, releaseOne, releaseAll, maxPending: () => maxPending, pending: () => pending, calls }
}

/** 刷新微任务队列。 */
async function flush(n = 30): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

/** 放行 + 刷新循环，直到没有挂起请求（处理排队任务逐级进入 fetch 的情形）。 */
async function settle(gate: ReturnType<typeof makeGateFetch>): Promise<void> {
  for (let i = 0; i < 100; i++) {
    gate.releaseAll()
    await flush()
    if (gate.pending() === 0) return
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Scheduler', () => {
  it('启动即首检：所有 key 走完落库为 valid', async () => {
    const db = makeDb([key(), key()], { deepCheckEnabled: false })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await settle(gate)
    expect(db.data.keys.every((k) => k.status === '200')).toBe(true)
    expect(db.data.keys.every((k) => k.lastCheckMode === 'ping')).toBe(true)
  })

  it('poll 深检门控：deepCheckEnabled=true → 每Key 2次fetch(ping+deep)；=false → 1次', async () => {
    const dbYes = makeDb([key()], { deepCheckEnabled: true })
    const gateYes = makeGateFetch(200)
    const schedYes = new Scheduler(dbYes, gateYes.impl)
    schedYes.start()
    await settle(gateYes)
    expect(gateYes.calls.length).toBe(2) // ping + deep
    expect(dbYes.data.keys[0].lastCheckMode).toBe('deep')

    const dbNo = makeDb([key()], { deepCheckEnabled: false })
    const gateNo = makeGateFetch(200)
    const schedNo = new Scheduler(dbNo, gateNo.impl)
    schedNo.start()
    await settle(gateNo)
    expect(gateNo.calls.length).toBe(1) // 仅 ping
    expect(dbNo.data.keys[0].lastCheckMode).toBe('ping')
  })

  it('checkNow(mode=deep) 强制深检：bypass 开关', async () => {
    const a = key({ deepCheck: false })
    const db = makeDb([a], { deepCheckEnabled: false })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await settle(gate)
    // 启动 poll → ping（开关关）；手动 deep → 仍跑 deep
    sched.checkNow(a.id, 'deep')
    await settle(gate)
    const r = db.data.keys.find((k) => k.id === a.id)!
    expect(r.lastCheckMode).toBe('deep')
  })

  it('pingMs 落库：检测后 record.pingMs 有值（fake timer 下 Date.now 不变 → 0）', async () => {
    const db = makeDb([key()], { deepCheckEnabled: false })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await settle(gate)
    expect(db.data.keys[0].pingMs).toBe(0)
  })

  it('并发上限：4 key / cap=2，峰值在飞 ≤ 2', async () => {
    const db = makeDb([key(), key(), key(), key()], {
      concurrentChecks: 2,
      deepCheckEnabled: false
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await flush()
    expect(gate.pending()).toBe(2)
    expect(gate.maxPending()).toBe(2)
    gate.releaseOne()
    await flush()
    expect(gate.maxPending()).toBe(2)
    await settle(gate)
    expect(db.data.keys.every((k) => k.status === '200')).toBe(true)
  })

  it('上一轮未完成 → 下一轮 tick 静默跳过（无新 fetch）', async () => {
    const db = makeDb([key(), key()], {
      concurrentChecks: 4,
      deepCheckEnabled: false,
      checkIntervalMinutes: 1, // 60_000ms
      pingTimeoutMs: 600_000 // 避免推进 60s 时误触自身超时
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await flush()
    const callsBefore = gate.calls.length
    // 不 release，前轮未完成；推进一个 tick
    await vi.advanceTimersByTimeAsync(60_000)
    expect(gate.calls.length).toBe(callsBefore) // 未发新请求
    sched.stop()
    await settle(gate)
  })

  it('checkNow 取消自身在飞并重发（fetch 调用 2 次）', async () => {
    const a = key()
    const db = makeDb([a], {
      concurrentChecks: 1,
      deepCheckEnabled: false,
      pingTimeoutMs: 600_000
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await flush()
    expect(gate.pending()).toBe(1)
    sched.checkNow(a.id, 'ping')
    await flush()
    // 旧请求被 abort（reject），新请求发出，共 2 次
    expect(gate.calls.length).toBe(2)
    await settle(gate)
    const r = db.data.keys.find((k) => k.id === a.id)!
    expect(r.status).toBe('200')
  })

  it('checkAll 取消当前轮并重发（fetch 翻倍，最终全 valid）', async () => {
    const db = makeDb([key(), key(), key()], {
      concurrentChecks: 4,
      deepCheckEnabled: false,
      pingTimeoutMs: 600_000
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await flush()
    expect(gate.calls.length).toBe(3)
    sched.checkAll('ping')
    await flush()
    expect(gate.calls.length).toBe(6) // 旧 3 被弃 + 新 3
    await settle(gate)
    expect(db.data.keys.every((k) => k.status === '200')).toBe(true)
  })

  it('写库后 syncPlaintextMode 同步 meta.plaintextMode', async () => {
    const db = makeDb([key({ secretMode: 'plaintext', encSecret: 'sk-plain' })], {
      deepCheckEnabled: false
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await settle(gate)
    expect(db.data.meta.plaintextMode).toBe(true)
  })

  it('stop：abort 全部在飞、清 timer，推进时间不再发 fetch', async () => {
    const db = makeDb([key(), key()], {
      concurrentChecks: 4,
      deepCheckEnabled: false,
      checkIntervalMinutes: 1,
      pingTimeoutMs: 600_000
    })
    const gate = makeGateFetch(200)
    const sched = new Scheduler(db, gate.impl)
    sched.start()
    await flush()
    const callsAfterStart = gate.calls.length
    sched.stop()
    await settle(gate)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(gate.calls.length).toBe(callsAfterStart) // 停止后 tick 不再发
  })

  it('onUpdate 回调：每 key 落库后触发', async () => {
    const a = key()
    const b = key()
    const db = makeDb([a, b], { concurrentChecks: 4, deepCheckEnabled: false })
    const gate = makeGateFetch(200)
    const updated: string[] = []
    const sched = new Scheduler(db, gate.impl, { onUpdate: (id) => updated.push(id) })
    sched.start()
    await settle(gate)
    expect(updated.filter((id) => id === a.id).length).toBeGreaterThan(0)
    expect(updated.filter((id) => id === b.id).length).toBeGreaterThan(0)
  })
})