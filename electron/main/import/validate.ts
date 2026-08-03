// 文件校验纯函数（PRD FR-3：限 .env/.json 且 ≤ 1MB）
//
// 主进程文件选择框选中后、读内容前由 M5 调用。1MB = 1_048_576 字节。

import { extname } from 'path'

/** 1MB 字节上限。 */
export const MAX_IMPORT_BYTES = 1_048_576

export type ValidateFileResult = { ok: true } | { ok: false; reason: 'ext' | 'size' }

/**
 * 校验导入文件：后缀 .env / .json（大小写不敏感）+ size ≤ 1MB。
 */
export function validateImportFile(file: { name: string; size: number }): ValidateFileResult {
  const lower = file.name.toLowerCase()
  // .env 后缀：extname('.env') 在某些平台返回 ''，故用 endsWith 兜底
  const okExt = lower.endsWith('.env') || extname(lower) === '.json'
  if (!okExt) {
    return { ok: false, reason: 'ext' }
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, reason: 'size' }
  }
  return { ok: true }
}