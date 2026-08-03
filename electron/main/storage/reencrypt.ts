// 重加密（数据库设计 §7.3 + PRD FR-1）
//
// 触发场景：safeStorage 从不可用变为可用时（启动检测 / 恢复后）。
// 对每条 secretMode==='plaintext' 记录：取其 encSecret（明文本身）→ encrypt() →
// 新密文 + secretMode='safeStorage'。
// 单条失败：保留明文 + lastError 记原因，不抛错中断其余记录（§7.3 "部分失败保留明文"）。
// safeStorage 不可用：no-op，无法重加密。
// 纯函数，不读写文件；调用方负责后续 db.write()（syncPlaintextMode 在此一并刷新）。

import { isSafeStorageAvailable, encrypt } from '../crypto'
import { syncPlaintextMode } from './plaintext'
import type { DbRoot } from './schema'

export interface ReencryptResult {
  /** 是否发生变更（有记录被重加密或 lastError 被写） */
  changed: boolean
  /** 重加密失败的记录数（保留明文） */
  failed: number
}

/**
 * 遍历 plaintext 记录重加密为 safeStorage；单条失败保留明文 + lastError。
 * safeStorage 不可用时直接 no-op 返回。末尾刷新 meta.plaintextMode。
 */
export function reencryptPlaintext(root: DbRoot): ReencryptResult {
  // safeStorage 不可用：无法重加密，原样返回（§7.3 前提是 safeStorage 已恢复可用）
  if (!isSafeStorageAvailable()) {
    return { changed: false, failed: 0 }
  }

  let changed = false
  let failed = 0

  for (const k of root.keys) {
    if (k.secretMode !== 'plaintext') continue
    // plaintext 模式下 encSecret 即明文本身
    try {
      k.encSecret = encrypt(k.encSecret)
      k.secretMode = 'safeStorage'
      changed = true
    } catch {
      // 单条失败：保留明文，记原因，不中断（§7.3）
      failed++
      k.lastError = '重加密失败，仍为明文'
      changed = true
    }
  }

  // 刷新 plaintextMode（§7.4 同步）
  if (syncPlaintextMode(root).changed) {
    changed = true
  }

  return { changed, failed }
}