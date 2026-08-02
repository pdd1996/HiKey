// safeStorage 封装 + fail-closed/明文降级策略（数据库设计 §7）
//
// 写入策略（§3.2 + PRD FR-1）：
//   safeStorage 可用        → 强制 safeStorage（即便误开降级也不主动存明文）
//   不可用 + 降级已开        → 明文，secretMode='plaintext'
//   不可用 + 降级未开        → fail-closed，拒绝写新 secret
// 读取策略：按 secretMode 决定调解密 or 直取（§7.2）。

import { safeStorage } from 'electron'
import type { SecretMode } from './storage/schema'

/** safeStorage 是否可用（OS keychain/DPAPI 等就绪）。 */
export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** 加密：明文 → safeStorage 密文（base64 字符串）。仅在可用时调用。 */
export function encrypt(plaintext: string): string {
  // Electron 43 的 encryptString 返回 Buffer；schema 要求 encSecret 为 base64 字符串。
  return safeStorage.encryptString(plaintext).toString('base64')
}

/** 解密：base64 密文 → 明文。 */
export function decrypt(encSecret: string): string {
  return safeStorage.decryptString(Buffer.from(encSecret, 'base64'))
}

/** encryptForStore 的结果 */
export type EncryptOutcome =
  | { ok: true; encSecret: string; mode: 'safeStorage' }
  | { ok: true; encSecret: string; mode: 'plaintext' }
  | { ok: false; reason: 'fail-closed' }

/**
 * 按当前 safeStorage 可用性与降级开关决定如何写入 secret。
 * fail-closed：safeStorage 不可用且未显式允许降级 → 返回拒绝，调用方不得写入。
 */
export function encryptForStore(
  plaintext: string,
  allowPlaintextFallback: boolean
): EncryptOutcome {
  if (isSafeStorageAvailable()) {
    // 可用即强制加密，忽略降级开关（§3.2）
    return { ok: true, encSecret: encrypt(plaintext), mode: 'safeStorage' }
  }
  if (allowPlaintextFallback) {
    // 明文降级：原样存，由 secretMode 自描述
    return { ok: true, encSecret: plaintext, mode: 'plaintext' }
  }
  // fail-closed
  return { ok: false, reason: 'fail-closed' }
}

/**
 * 读取侧：按 secretMode 还原明文。
 * safeStorage 密文 → 调解密；plaintext → 直取。
 */
export function revealSecret(encSecret: string, mode: SecretMode): string {
  if (mode === 'plaintext') return encSecret
  return decrypt(encSecret)
}