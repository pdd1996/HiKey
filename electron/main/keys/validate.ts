// 输入校验（PRD FR-4 添加/编辑表单 + custom 必填 testModel）
//
// add 要求 secret 必填；update 不要求（可只改元数据）。
// custom 必填 testModel（无默认）；其余 provider 可缺省（取 DEFAULT_TEST_MODEL）。
// 纯函数。

import { KNOWN_PROVIDERS } from '../storage/schema'
import type { KeyInput } from './types'

export interface ValidateResult {
  ok: boolean
  reason: string
}

/**
 * 校验表单输入。
 * @param requireSecret add 传 true（secret 必填）；update 传 false（secret 可选）
 */
export function validateKeyInput(input: KeyInput, opts: { requireSecret: boolean }): ValidateResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: '输入非法' }

  if (!(KNOWN_PROVIDERS as readonly string[]).includes(input.provider)) {
    return { ok: false, reason: '未知 provider' }
  }
  if (!input.name || !input.name.trim()) return { ok: false, reason: 'name 不能为空' }
  if (!input.baseUrl || !input.baseUrl.trim()) return { ok: false, reason: 'baseUrl 不能为空' }

  if (opts.requireSecret) {
    if (!input.secret || !input.secret.trim()) return { ok: false, reason: 'secret 不能为空' }
  }

  // custom 必填 testModel（无默认）
  if (input.provider === 'custom') {
    const tm = input.testModel?.trim()
    if (!tm) return { ok: false, reason: 'custom 必填 testModel' }
  }

  return { ok: true, reason: '' }
}