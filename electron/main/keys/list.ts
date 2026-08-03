// 列表投影（PRD FR-4 列表展示）
//
// 剥 encSecret（敏感字段，明文绝不进列表）；保留 secretMode（UI 据此提示明文记录）
// 与脱敏后的 lastError。不排序（默认按 provider 字母序属 UI 展示规则，M6 处理），
// 保留库内顺序。纯函数。

import type { DbRoot } from '../storage/schema'
import type { SafeKeyView } from './types'

/** 返回不含 encSecret 的安全列表视图。 */
export function listKeys(root: DbRoot): SafeKeyView[] {
  return root.keys.map((k) => {
    // 剥 encSecret，保留其余字段（含 secretMode / 脱敏 lastError）
    const { encSecret: _enc, ...view } = k
    return view as SafeKeyView
  })
}