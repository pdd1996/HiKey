import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { AtomicJSONFile } from './adapter'

let dir: string
let filePath: string

beforeEach(() => {
  dir = join(tmpdir(), `hikey-test-${randomUUID()}`)
  filePath = join(dir, 'db.json')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
})

describe('AtomicJSONFile', () => {
  it('read 文件不存在 → null', async () => {
    const a = new AtomicJSONFile(filePath)
    expect(await a.read()).toBeNull()
  })

  it('write 后 read 往返一致，tmp 已清理', async () => {
    const a = new AtomicJSONFile(filePath)
    const data = { schemaVersion: 2, keys: [], meta: { ok: true } }
    await a.write(data)
    expect(await a.read()).toEqual(data)
    // tmp 不残留
    await expect(fs.stat(`${filePath}.tmp`)).rejects.toThrow()
  })

  it('write 创建不存在的父目录', async () => {
    const nested = join(dir, 'nested', 'deep', 'db.json')
    const a = new AtomicJSONFile(nested)
    await a.write({ x: 1 })
    expect(await a.read()).toEqual({ x: 1 })
  })

  it('覆盖既有文件，旧内容被替换', async () => {
    const a = new AtomicJSONFile(filePath)
    await a.write({ v: 1 })
    await a.write({ v: 2 })
    expect(await a.read()).toEqual({ v: 2 })
  })

  it('write 抛错时不破坏原文件，并清理 tmp', async () => {
    // 先写正常内容
    const a = new AtomicJSONFile(filePath)
    await a.write({ keep: true })
    const before = await fs.readFile(filePath, 'utf8')

    // 构造一个会失败的场景：tmp 路径不可写（用文件占位当目录）。
    // 这里改为用 spy 让 rename 失败：直接断言原文件不变。
    // 简单办法：再 open 一个写流锁住？跨平台不可靠。
    // 改用：把目标父目录里的 tmp 占用为只读目录使 open('w') 失败。
    // 为稳定起见，断言正常路径下二次 write 不破坏即可（上面覆盖用例已覆盖）。
    // 此用例改为：write 期间抛错 → 原文件字节不变。
    const a2 = new AtomicJSONFile(filePath)
    // 模拟抛错：让 JSON.stringify 失败（循环引用）
    const bad: unknown = (() => {
      const o: Record<string, unknown> = {}
      o.self = o
      return o
    })()
    await expect(a2.write(bad)).rejects.toThrow()
    expect(await fs.readFile(filePath, 'utf8')).toBe(before)
    await expect(fs.stat(`${filePath}.tmp`)).rejects.toThrow()
  })

  it('write 走到 rename 失败时清理 tmp、原文件不变（覆盖清理分支）', async () => {
    const a = new AtomicJSONFile(filePath)
    await a.write({ keep: true })
    const before = await fs.readFile(filePath, 'utf8')

    // 让 fs.rename 抛错：open/write/sync/close 都成功后，rename 失败 →
    // 走 catch 清理 tmp，而非 stringify 在 try 之前就失败的伪用例。
    const a2 = new AtomicJSONFile(filePath)
    const spy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename EPERM'))
    await expect(a2.write({ changed: true })).rejects.toThrow('rename EPERM')
    spy.mockRestore()

    expect(await fs.readFile(filePath, 'utf8')).toBe(before)
    await expect(fs.stat(`${filePath}.tmp`)).rejects.toThrow()
  })

  it('并发 write 被串行化：不交错、最终落盘最后一个', async () => {
    const a = new AtomicJSONFile(filePath)
    // 让每次 write 的 rename 串行解析；若未串行化，固定 tmp 会让
    // 后发的 write 覆盖先发的 tmp、导致先发 rename 读到错数据或失败。
    const order: number[] = []
    const realRename = fs.rename
    const spy = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (src, dest) => {
        // 给每次 rename 一个可辨别的耗时，强制交错暴露
        await new Promise((r) => setTimeout(r, 5))
        order.push(JSON.parse(await fs.readFile(src as unknown as string, 'utf8')).v)
        return realRename(src, dest)
      })
    await Promise.all([a.write({ v: 1 }), a.write({ v: 2 }), a.write({ v: 3 })])
    spy.mockRestore()
    // 三次都按调用顺序落盘，且最终内容是最后一个
    expect(order).toEqual([1, 2, 3])
    expect(await a.read()).toEqual({ v: 3 })
  })
})