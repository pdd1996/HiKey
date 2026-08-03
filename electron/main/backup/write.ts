// 恢复原子写（数据库设计 §8.3 步骤 5 + PRD FR-6 原子写入）
//
// temp + fsync + rename 覆盖 hikey-db.json：先写 <db>.restore-tmp → fsync →
// rename 覆盖目标；异常时清理 tmp。tmp 与目标同目录保证同卷 rename 原子
// （Windows 上 rename 覆盖既有文件成立）。复用 [adapter.ts] 思路，独立于 lowdb
// Adapter 接口——恢复是覆盖 db 文件的流程，不经过 lowdb 实例。
//
// [adapter.ts]: electron/main/storage/adapter.ts

import { promises as fs, type PathLike } from 'fs'
import { dirname, join } from 'path'

/** tmp 名固定（恢复串行化由调用方保证：restoreBackup 单次调用，无并发）。 */
function tmpPathFor(dbPath: string): string {
  return join(dirname(dbPath), `${basename(dbPath)}.restore-tmp`)
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/**
 * 原子写 db.json：序列化 root → 写 tmp → fsync → rename 覆盖目标。
 * @throws 写入或 rename 失败时抛出；此时旧库完好（tmp 被清理）。
 */
export async function writeDbAtomic(dbPath: string, root: unknown): Promise<void> {
  const tmp = tmpPathFor(dbPath)
  const payload = JSON.stringify(root, null, 2)
  let fd
  try {
    await fs.mkdir(dirname(tmp), { recursive: true })
    fd = await fs.open(tmp, 'w')
    await fd.writeFile(payload, 'utf8')
    await fd.sync() // 落盘后再 rename，避免崩溃时 tmp 半写
    await fd.close()
    fd = undefined
    await fs.rename(tmp, dbPath as PathLike)
  } catch (err) {
    if (fd) await fd.close().catch(() => {})
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}