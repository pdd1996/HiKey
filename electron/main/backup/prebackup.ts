// 预备份 + 当前库可读性探针（数据库设计 §8.3 步骤 4 + §8.4）
//
// 恢复前导出当前库到 userData/backups/hikey-db.pre-restore.{ts}.hikey-backup，
// 保留最近 3 个（按文件名时间戳排序，删超出）。
//   当前库可读但预备份失败 → 调用方应中止恢复（§8.3）
//   当前库损坏（读库抛错）→ 调用方应跳过预备份继续（"库坏了想恢复"是最需要恢复的场景）
//
// 注意：本模块需要当前库内容构造预备份。为保持纯逻辑可测，预备份的"内容"
// 由调用方传入（恢复流程已读取旧库作回滚快照，复用之），本模块只负责落盘 + 保留策略。

import { promises as fs } from 'fs'
import { join } from 'path'

const BACKUP_DIR = 'backups'
const PRE_RESTORE_PREFIX = 'hikey-db.pre-restore.'
const PRE_RESTORE_EXT = '.hikey-backup'
const KEEP_RECENT = 3

/** 预备份文件名：hikey-db.pre-restore.{ts}.hikey-backup */
export function preBackupFilename(ts: number): string {
  return `${PRE_RESTORE_PREFIX}${ts}${PRE_RESTORE_EXT}`
}

/** userData/backups 目录路径 */
export function backupsDir(userDataDir: string): string {
  return join(userDataDir, BACKUP_DIR)
}

/**
 * 探当前库是否可读（用于"损坏跳过"判定）。
 * 可读 = 文件存在且能 JSON.parse；不存在或解析失败都视为不可读（损坏）。
 */
export async function isCurrentDbReadable(dbPath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(dbPath, 'utf8')
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/**
 * 写预备份 + 保留最近 KEEP_RECENT 个。
 * @param userDataDir app.getPath('userData')
 * @param content 预备份内容（恢复前的旧库序列化字符串）
 * @param ts 时间戳，嵌入文件名
 */
export async function writePreBackup(
  userDataDir: string,
  content: string,
  ts: number
): Promise<string> {
  const dir = backupsDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })
  const filename = preBackupFilename(ts)
  const target = join(dir, filename)
  await fs.writeFile(target, content, 'utf8')
  await pruneOldPreBackups(dir)
  return target
}

/** 删超出最近 KEEP_RECENT 个的预备份（按文件名时间戳降序保留）。 */
async function pruneOldPreBackups(dir: string): Promise<void> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(dir)
  } catch {
    return
  }
  const preRestore = entries
    .filter((n) => n.startsWith(PRE_RESTORE_PREFIX) && n.endsWith(PRE_RESTORE_EXT))
    .sort() // 文件名含时间戳，字典序=时间序
    .reverse() // 最新在前
  const toDelete = preRestore.slice(KEEP_RECENT)
  await Promise.all(toDelete.map((n) => fs.unlink(join(dir, n)).catch(() => {})))
}