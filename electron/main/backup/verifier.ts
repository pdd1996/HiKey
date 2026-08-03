// verifier 校验探针（数据库设计 §8.1 + PRD FR-6）
//
// 导出时：用 safeStorage 加密一段固定常量文本 → base64 密文写入 verifier。
// 恢复时：尝试用本机 safeStorage 解密；成功=同机（DPAPI 同 Windows 用户），
// 失败/抛错=跨机。固定文本本身不参与判定，仅作"能否用本机 safeStorage 解密这块
// 密文"的探针（§8.1 "一段固定文本经 safeStorage 加密"）。
//
// safeStorage 不可用时不导出 verifier（明文标记备份，verifier=null）。

import { isSafeStorageAvailable, encrypt, decrypt } from '../crypto'

/** 探针固定文本（版本化，便于将来换算法时区分） */
const VERIFIER_PLAINTEXT = 'HIKEY_BACKUP_VERIFIER_v1'

/** 导出时生成 verifier：safeStorage 可用 → 加密固定文本；不可用 → null。 */
export function makeVerifier(): string | null {
  if (!isSafeStorageAvailable()) return null
  return encrypt(VERIFIER_PLAINTEXT)
}

/**
 * 恢复时校验是否本机备份：尝试解密 verifier。
 * - safeStorage 不可用：无法校验密文备份，返回 false（密文备份要求 safeStorage 在场）
 * - 解密成功且文本匹配：同机 → true
 * - 解密抛错或文本不符：跨机 → false
 */
export function verifySameMachine(verifier: string): boolean {
  if (!isSafeStorageAvailable()) return false
  try {
    return decrypt(verifier) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}