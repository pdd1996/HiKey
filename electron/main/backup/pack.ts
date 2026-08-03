// 备份打包（数据库设计 §8.1 + PRD FR-6）
//
// buildBackup：从当前库根构造 .hikey-backup 对象。
//   safeStorage 可用 → 密文备份（verifier=加密探针，plaintextBackup=false）
//   safeStorage 不可用 → 明文标记备份（verifier=null，plaintextBackup=true）
// 两种都扫 secretMode=plaintext 记录写 plaintextRecordCount（§8.1）。
// 纯函数：safeStorage 调用走 crypto.ts / verifier.ts，不读写文件。

import { isSafeStorageAvailable } from '../crypto'
import { SCHEMA_VERSION } from '../storage/schema'
import { makeVerifier } from './verifier'
import type { HikeyBackup, DbRootLike } from './types'

/** 统计库内 secretMode=plaintext 的记录数（§8.1，两种备份都写）。 */
export function countPlaintext(keys: { secretMode: string }[]): number {
  return keys.reduce((n, k) => (k.secretMode === 'plaintext' ? n + 1 : n), 0)
}

/**
 * 从库根构造备份对象。
 * @param root 当前库根（schemaVersion/keys/meta）
 */
export function buildBackup(root: DbRootLike): HikeyBackup {
  const available = isSafeStorageAvailable()
  const plaintextRecordCount = countPlaintext(root.keys)

  if (available) {
    return {
      schemaVersion: SCHEMA_VERSION,
      keys: root.keys,
      meta: root.meta,
      verifier: makeVerifier(),
      plaintextBackup: false,
      plaintextRecordCount
    }
  }

  // 明文标记备份：safeStorage 不可用
  return {
    schemaVersion: SCHEMA_VERSION,
    keys: root.keys,
    meta: root.meta,
    verifier: null,
    plaintextBackup: true,
    plaintextRecordCount
  }
}