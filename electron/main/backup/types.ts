// 备份文件类型（数据库设计 §8.1 + PRD FR-6）
//
// .hikey-backup 为 JSON 打包。两种形态：
//   密文备份：verifier=非 null 加密探针，plaintextBackup=false
//   明文标记备份：verifier=null，plaintextBackup=true（safeStorage 不可用时导出）
// 两种都写 plaintextRecordCount（库内 secretMode=plaintext 记录数）。

import type { DbRoot, KeyRecord, Meta } from '../storage/schema'

/** 备份根对象（loose：恢复时要接受 schemaVersion<2 的旧备份，故 schemaVersion 不固定为字面量） */
export interface HikeyBackup {
  schemaVersion: number
  keys: KeyRecord[]
  meta: Meta
  /** safeStorage 加密的固定文本探针；明文标记备份时为 null */
  verifier: string | null
  /** true=明文标记备份（跳过 verifier）；false=密文备份（走 verifier） */
  plaintextBackup: boolean
  /** 库内 secretMode=plaintext 的记录数；两种备份都写 */
  plaintextRecordCount: number
}

/** 导出结果 */
export interface BackupExportResult {
  backup: HikeyBackup
  /** 备份包含的明文记录数，>0 时 UI 提示妥善保管 */
  plaintextRecordCount: number
}

/** 恢复拒绝原因（可对应 UI 文案） */
export type RestoreRejectReason =
  | 'shape-invalid' // 字段组合校验失败 / 缺失
  | 'not-same-machine' // 密文备份跨机（verifier 解密失败）
  | 'prebackup-failed' // 预备份失败且当前库可读 → 中止
  | 'write-failed' // 原子写失败
  | 'migrate-failed' // 恢复后迁移失败（已回滚）

/** 恢复结果（判别联合） */
export type RestoreOutcome =
  | { ok: true; migrated: boolean; reencrypted: number; rolledBack: boolean }
  | { ok: false; reason: RestoreRejectReason; message: string; rolledBack: boolean }

/** 从当前库根构造备份时用的入参（避免直接依赖 DbRoot，便于纯逻辑） */
export type DbRootLike = Pick<DbRoot, 'schemaVersion' | 'keys' | 'meta'> & {
  keys: KeyRecord[]
  meta: Meta
}