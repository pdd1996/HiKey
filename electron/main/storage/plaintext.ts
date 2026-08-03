// meta.plaintextMode 同步（数据库设计 §7.4 + M2 遗留契约）
//
// plaintextMode 应反映"库里是否还存在 secretMode=plaintext 记录"。
// 新增/改写/重加密/恢复等任何写库流程在 db.write() 前调用本函数，
// 在内存刷新 meta.plaintextMode 后一并原子写，避免"库里已有明文记录但
// plaintextMode=false"的漂移。纯函数，不读写文件。

import type { DbRoot } from './schema'

/**
 * 遍历 keys，任一 secretMode==='plaintext' → meta.plaintextMode=true，否则 false。
 * @returns 是否发生了变更（决定是否需要触发额外写——通常调用方本就要写库，忽略即可）
 */
export function syncPlaintextMode(root: DbRoot): { changed: boolean } {
  const any = root.keys.some((k) => k.secretMode === 'plaintext')
  if (root.meta.plaintextMode !== any) {
    root.meta.plaintextMode = any
    return { changed: true }
  }
  return { changed: false }
}