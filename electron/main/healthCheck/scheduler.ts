// 调度器：并发 / 超时 / 轮询 / 取消（PRD FR-2 调度 + 数据库设计 §6）
//
// 职责：
//   - 启动即首检一轮，再按 meta.checkIntervalMinutes 递归 setTimeout 排下一轮。
//   - 并发上限 meta.concurrentChecks（共享 Semaphore，round 与 checkNow/checkAll 共用）。
//   - 同 key 不重叠：per-key AbortController + launched 表覆盖队列态与在飞态。
//   - 上一轮未完成 → tick 静默跳过本轮。
//   - checkNow(id)：仅取消该 key 在飞 + 重发 manual 检测（不计入"影响其他 key"）。
//   - checkAll()：自增 generation 使旧轮在飞/排队结果全部丢弃，重发一轮 manual。
//   - best-effort：stop() abort 全部在飞、清 timer，未完成检测丢弃，不损坏数据。
//   - 写库：检测前 status=checking（落库，重启归位 unchecked），完成后写结果 +
//     syncPlaintextMode + 原子 db.write()，再触发 onUpdate 回调（M5 接 status:update）。
//
// 不接 IPC（留 M5）：onUpdate 仅留钩子，reschedule 留给 M5 settings:set 调用。

import type { Low } from 'lowdb'
import type { DbRoot, KeyRecord, Meta } from '../storage/schema'
import { getDb } from '../storage/db'
import { syncPlaintextMode } from '../storage/plaintext'
import { checkKey, type CheckTrigger, type FetchImpl, type CheckOutcome } from './checker'

export interface SchedulerHooks {
  /** 单 key 落库后回调（M5 接 IPC status:update）。 */
  onUpdate?: (keyId: string, record: KeyRecord) => void
}

/** 简易计数信号量：并发上限控制。 */
class Semaphore {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private cap: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.cap) {
      this.active++
      return () => this.release()
    }
    await new Promise<void>((res) => this.waiters.push(res))
    this.active++
    return () => this.release()
  }
  private release(): void {
    this.active--
    const w = this.waiters.shift()
    if (w) w()
  }
  /** 动态调整并发上限；cap 增大时立即释放排队 waiter。不替换实例，避免旧 waiter 泄漏。 */
  setCap(newCap: number): void {
    this.cap = newCap
    while (this.waiters.length > 0 && this.active < this.cap) {
      this.active++
      const w = this.waiters.shift()!
      w()
    }
  }
}

/** per-key 任务句柄：覆盖排队态与在飞态，支持外部 abort 并标记丢弃。 */
interface Launch {
  abort: () => void
}

export class Scheduler {
  private fetchImpl: FetchImpl
  private hooks: SchedulerHooks
  private sem: Semaphore
  private timer: NodeJS.Timeout | null = null
  private generation = 0
  private roundRunning = false
  private launched = new Map<string, Launch>()
  private stopped = false

  constructor(
    private db: Low<DbRoot>,
    fetchImpl?: FetchImpl,
    hooks?: SchedulerHooks
  ) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch
    this.hooks = hooks ?? {}
    this.sem = new Semaphore(this.meta.concurrentChecks)
  }

  private get meta(): Meta {
    return this.db.data.meta
  }

  private get keys(): KeyRecord[] {
    return this.db.data.keys
  }

  private findRecord(id: string): KeyRecord | undefined {
    return this.keys.find((k) => k.id === id)
  }

  /** 启动：立即首检一轮，再按间隔排下一轮。 */
  start(): void {
    this.stopped = false
    void this.runRound('poll')
    this.scheduleNext()
  }

  /** 关窗：abort 全部在飞、清 timer，best-effort 丢弃未完成。 */
  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.generation++ // 使所有排队/在飞结果丢弃
    for (const launch of this.launched.values()) launch.abort()
    this.launched.clear()
    this.roundRunning = false
  }

  /** meta 变更后重设间隔（M5 settings:set 调用）。 */
  reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.sem.setCap(this.meta.concurrentChecks)
    if (!this.stopped) this.scheduleNext()
  }

  /** 单条立即检测：取消该 key 在飞，重发 manual。计入共享并发。 */
  checkNow(id: string): void {
    if (this.stopped) return
    if (!this.findRecord(id)) return
    this.abortKey(id)
    void this.runOne(id, 'manual')
  }

  /** 立即全部重检：取消当前轮所有在飞，重发一轮 manual。 */
  checkAll(): void {
    if (this.stopped) return
    this.generation++ // 旧轮排队/在飞结果全部丢弃
    for (const launch of this.launched.values()) launch.abort()
    this.launched.clear()
    this.roundRunning = false
    void this.runRound('manual')
  }

  // ---- 内部 ----

  private abortKey(id: string): void {
    const launch = this.launched.get(id)
    if (launch) {
      launch.abort()
      this.launched.delete(id)
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return
    const intervalMs = this.meta.checkIntervalMinutes * 60_000
    this.timer = setTimeout(() => {
      if (this.stopped) return
      // 上一轮未完成 → 静默跳过本轮
      if (!this.roundRunning) void this.runRound('poll')
      this.scheduleNext()
    }, intervalMs)
  }

  /** 跑一轮：对所有 key 发起 trigger 检测。 */
  private async runRound(trigger: CheckTrigger): Promise<void> {
    if (this.roundRunning) return
    this.roundRunning = true
    const myGen = this.generation
    const ids = this.keys.map((k) => k.id)
    await Promise.allSettled(ids.map((id) => this.runOne(id, trigger, myGen)))
    // 仅当代际未变（未被 checkAll 取代）才清 roundRunning
    if (this.generation === myGen) this.roundRunning = false
  }

  /**
   * 单 key 检测任务。gen 默认当前代际；runRound 传其捕获的 myGen 以便 checkAll 取代后丢弃。
   */
  private async runOne(id: string, trigger: CheckTrigger, gen: number = this.generation): Promise<void> {
    if (this.stopped) return
    let aborted = false
    let controller: AbortController | undefined
    const launch: Launch = {
      abort: () => {
        aborted = true
        controller?.abort()
      }
    }
    this.launched.set(id, launch)

    const release = await this.sem.acquire()
    try {
      // 排队期间已被取消或代际取代 → 丢弃
      if (aborted || gen !== this.generation || this.stopped) return
      controller = new AbortController()
      const record = this.findRecord(id)
      if (!record) return
      // 先落库 checking（await 确保写入完成后再发网络，避免 applyOutcome
      // 在 checking 写入执行前就改写 status，导致 checking 状态不上盘/不触发 onUpdate）
      await this.markChecking(id)
      if (aborted || gen !== this.generation || this.stopped) return
      const outcome = await checkKey(
        record,
        this.meta,
        trigger,
        this.fetchImpl,
        Date.now(),
        controller.signal
      )
      // 在飞期间被 abort 或代际取代 → 丢弃结果不写库
      if (aborted || gen !== this.generation || this.stopped) return
      this.applyOutcome(id, outcome)
    } finally {
      // 仅当本任务仍拥有 launched 槽时清理（checkNow 可能已用新 launch 覆盖）
      if (this.launched.get(id) === launch) this.launched.delete(id)
      release()
    }
  }

  private async markChecking(id: string): Promise<void> {
    const r = this.findRecord(id)
    if (!r) return
    r.status = 'checking'
    r.updatedAt = Date.now()
    // checking 写入不改变 secretMode，跳过 syncPlaintextMode 扫描
    await this.persist(id, true)
  }

  private async applyOutcome(id: string, outcome: CheckOutcome): Promise<void> {
    const r = this.findRecord(id)
    if (!r) return
    r.status = outcome.status
    r.lastChecked = outcome.lastChecked
    r.lastCheckMode = outcome.lastCheckMode
    if (outcome.lastDeepCheckedAt !== undefined) r.lastDeepCheckedAt = outcome.lastDeepCheckedAt
    r.lastError = outcome.lastError
    r.updatedAt = Date.now()
    await this.persist(id)
  }

  /**
   * 落库：原子写 + onUpdate 回调。仅在结果写入时同步 plaintextMode
   * （检测不改变 secretMode，checking 写入跳过以省去无意义的全表扫描）。
   */
  private async persist(id: string, skipSyncPlaintext = false): Promise<void> {
    if (!skipSyncPlaintext) syncPlaintextMode(this.db.data)
    await this.db.write()
    const r = this.findRecord(id)
    if (r) this.hooks.onUpdate?.(id, r)
  }
}

/** 工厂：用已初始化的 db 构造 Scheduler（index.ts 用）。 */
export function createScheduler(fetchImpl?: FetchImpl, hooks?: SchedulerHooks): Scheduler {
  return new Scheduler(getDb(), fetchImpl, hooks)
}