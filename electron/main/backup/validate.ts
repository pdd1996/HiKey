// 字段组合校验（数据库设计 §8.2 + PRD FR-6 畸形字段组合）
//
// 恢复时先于 verifier 校验执行。合法组合仅两种：
//   密文备份：verifier 非 null + plaintextBackup=false
//   明文标记备份：verifier=null + plaintextBackup=true
// 非法组合（verifier 非 null 但 plaintextBackup=true；verifier=null 但
// plaintextBackup 缺失/false；字段缺失）→ 拒绝恢复。
// 纯函数。

export interface ShapeResult {
  ok: boolean
  reason: string
}

/** 校验备份根对象的字段组合合法性。 */
export function validateBackupShape(b: unknown): ShapeResult {
  if (!b || typeof b !== 'object') return { ok: false, reason: '备份根非法' }
  const o = b as Record<string, unknown>

  // 必备字段存在性
  if (!('keys' in o) || !Array.isArray(o.keys)) return { ok: false, reason: '缺少 keys 数组' }
  if (!('meta' in o) || typeof o.meta !== 'object') return { ok: false, reason: '缺少 meta' }
  if (typeof o.schemaVersion !== 'number') return { ok: false, reason: '缺少 schemaVersion' }
  if (typeof o.plaintextRecordCount !== 'number') return { ok: false, reason: '缺少 plaintextRecordCount' }

  const verifier = o.verifier
  const plain = o.plaintextBackup

  // plaintextBackup 必须是布尔
  if (typeof plain !== 'boolean') return { ok: false, reason: 'plaintextBackup 非布尔或缺失' }

  // 合法组合校验
  if (plain) {
    // 明文标记备份：必须 verifier=null
    if (verifier !== null) return { ok: false, reason: 'plaintextBackup=true 但 verifier 非 null' }
  } else {
    // 密文备份：必须 verifier=非 null 字符串
    if (typeof verifier !== 'string' || verifier === '') {
      return { ok: false, reason: 'verifier=null 但 plaintextBackup 非 true（密文备份缺 verifier）' }
    }
  }

  return { ok: true, reason: '' }
}