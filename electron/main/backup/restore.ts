// 恢复编排（数据库设计 §8.3 + PRD FR-6）
//
// 全流程：
//   1. 字段组合校验（shape）→ 非法拒绝
//   2. 备份标记识别：plaintextBackup=true 跳过 verifier；密文备份 verifySameMachine
//      跨机失败 → 整体拒绝，不破坏当前库
//   3. 预备份当前库：可读→导出预备份（失败则中止）；损坏/缺失→跳过继续
//   4. 原子写备份内容到 db.json
//   5. 内存跑 migrate + reencryptPlaintext → 再次原子写回
//      迁移抛错 → 回滚到恢复前状态（写回 rawOld 或删文件）
//
// 纯逻辑：接受 userDataDir 参数（不调 app.getPath），safeStorage 走 crypto.ts。
// 文件对话框、二次确认弹窗属 M5，本模块不碰——plaintextBackup 的"强制二次确认"
// 由 M5 IPC 层在调用前把关，纯逻辑直接放行。

import { promises as fs } from 'fs'
import { join } from 'path'
import { validateBackupShape } from './validate'
import { verifySameMachine } from './verifier'
import { writePreBackup } from './prebackup'
import { writeDbAtomic } from './write'
import { migrate } from '../storage/migrate'
import { reencryptPlaintext } from '../storage/reencrypt'
import type { DbRoot } from '../storage/schema'
import type { HikeyBackup, RestoreOutcome } from './types'

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * 从备份对象恢复，覆盖当前库。
 * @param b 已解析的备份对象（来自 M5 读取的 .hikey-backup JSON）
 * @param userDataDir app.getPath('userData')
 * @param now 时间戳（预备份文件名嵌入 + 回滚判定），由调用方传入便于测试
 */
export async function restoreBackup(
  b: unknown,
  userDataDir: string,
  now: number
): Promise<RestoreOutcome> {
  const dbPath = join(userDataDir, 'hikey-db.json')

  // 步骤 2：字段组合校验
  const shape = validateBackupShape(b)
  if (!shape.ok) {
    return { ok: false, reason: 'shape-invalid', message: shape.reason, rolledBack: false }
  }
  const backup = b as HikeyBackup

  // 步骤 3：备份标记识别
  if (!backup.plaintextBackup) {
    // 密文备份：verifier 校验
    if (!verifySameMachine(backup.verifier!)) {
      return { ok: false, reason: 'not-same-machine', message: '非本机备份（跨机恢复拒绝）', rolledBack: false }
    }
  }
  // plaintextBackup=true：跳过 verifier（二次确认由 M5 把关）

  // 步骤 4：读旧库（回滚快照 + 预备份内容）
  let rawOld: string | null = null
  let oldExisted = false
  try {
    rawOld = await fs.readFile(dbPath, 'utf8')
    oldExisted = true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // 文件存在但读出错 → 视为损坏，跳过预备份（rawOld 仍 null，oldExisted 标记文件在）
      oldExisted = true
    }
  }

  if (rawOld !== null && canParse(rawOld)) {
    // 当前库可读 → 预备份（原样字节快照）；失败则中止（§8.3 步骤 4）
    try {
      await writePreBackup(userDataDir, rawOld, now)
    } catch (e) {
      return { ok: false, reason: 'prebackup-failed', message: `预备份失败：${errMsg(e)}`, rolledBack: false }
    }
  }
  // 不可读（损坏/缺失）→ 跳过预备份继续（"库坏了想恢复"是最需要恢复的场景）

  // 步骤 5：原子写备份内容（先落盘未迁移版，保证后续 migrate 失败可回滚到此前的旧库）
  const newRoot = {
    schemaVersion: backup.schemaVersion,
    keys: backup.keys,
    meta: backup.meta
  }
  try {
    await writeDbAtomic(dbPath, newRoot)
  } catch (e) {
    return { ok: false, reason: 'write-failed', message: `原子写失败：${errMsg(e)}`, rolledBack: false }
  }

  // 步骤 6 + 7：内存 migrate + reencrypt，再原子写回
  const plainBefore = backup.keys.filter((k) => k.secretMode === 'plaintext').length
  let migrated = false
  try {
    const root = newRoot as DbRoot
    const m = migrate(root)
    migrated = m.changed
    const re = reencryptPlaintext(root)
    const reencrypted = Math.max(0, plainBefore - re.failed)
    await writeDbAtomic(dbPath, root)
    return { ok: true, migrated, reencrypted, rolledBack: false }
  } catch (e) {
    // 回滚到恢复前状态：写回 rawOld（原样字节，含损坏态），或文件本不存在则删
    await rollback(dbPath, rawOld, oldExisted)
    return {
      ok: false,
      reason: 'migrate-failed',
      message: `迁移/重加密失败，已回滚：${errMsg(e)}`,
      rolledBack: true
    }
  }
}

function canParse(s: string): boolean {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

async function rollback(dbPath: string, rawOld: string | null, oldExisted: boolean): Promise<void> {
  try {
    if (oldExisted && rawOld !== null) {
      // 写回原样字节（恢复前状态，含损坏态）
      await fs.writeFile(dbPath, rawOld, 'utf8')
    } else if (!oldExisted) {
      // 文件本不存在 → 删掉刚写入的
      await fs.unlink(dbPath)
    }
    // oldExisted && rawOld===null（文件在但读不出）：无法写回原样，保持刚写入状态
  } catch {
    // 回滚失败只能尽力而为，不抛（已在报错路径）
  }
}