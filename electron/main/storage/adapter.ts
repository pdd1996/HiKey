// lowdb 原子写 adapter（数据库设计 §1.2）
// lowdb v7 的 JSONFile 不自带原子写，需自行实现 temp + fsync + rename。
// 写入流程：写 <file>.tmp → fsync → rename 覆盖目标；异常时清理 tmp。
// tmp 与目标同目录保证同卷 rename 原子（Windows 上 rename 覆盖既有文件成立）。
// 写互斥：固定 tmp 名 + lowdb write() 不串行，并发写会抢同一 tmp；
// 用进程内 promise 链串行化所有 write（单实例锁保证同库只有一个实例）。

import { promises as fs, type PathLike } from 'fs'
import { dirname, join } from 'path'
import type { Adapter } from 'lowdb'

export class AtomicJSONFile<T> implements Adapter<T> {
  private tmpPath: string
  // 进程内写互斥：固定 tmp 名 + lowdb write() 不串行，并发写会抢同一 tmp
  // 导致交错写入或 rename 失败。用 promise 链把所有 write 串成单队列。
  // 单实例锁足以覆盖：一个 userData 目录对应一个 AtomicJSONFile 实例，
  // 同库不会有第二个实例并发写。
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private filename: PathLike) {
    const f = String(filename)
    this.tmpPath = join(dirname(f), `${basename(f)}.tmp`)
  }

  async read(): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.filename as string, 'utf8')
      return JSON.parse(raw) as T
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async write(data: T): Promise<void> {
    // 串行化：本次 write 等上一次的 chain 落定后再开始，避免并发抢同一 tmp。
    // resolve 后立刻抛错不传播，避免一次失败 reject 影响后续排队写入。
    const previous = this.writeChain
    let release!: () => void
    this.writeChain = new Promise((res) => {
      release = res as () => void
    })
    await previous.catch(() => {})
    try {
      await this.doWrite(data)
    } finally {
      release()
    }
  }

  private async doWrite(data: T): Promise<void> {
    await fs.mkdir(dirname(this.tmpPath), { recursive: true })
    const payload = JSON.stringify(data, null, 2)
    let fd
    try {
      fd = await fs.open(this.tmpPath, 'w')
      await fd.writeFile(payload, 'utf8')
      await fd.sync() // 落盘后再 rename，避免崩溃时 tmp 半写
      await fd.close()
      fd = undefined
      await fs.rename(this.tmpPath, this.filename as string)
    } catch (err) {
      if (fd) await fd.close().catch(() => {})
      await fs.unlink(this.tmpPath).catch(() => {})
      throw err
    }
  }
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}