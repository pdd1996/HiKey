// settings handler（PRD §10 settings:get / settings:set）
//
// get：返回 db.data.meta，纯转发。
// set：服务端校验 validateMeta（PRD 范围 + allowPlaintextFallback 关闭门）→ 合并 →
//   syncPlaintextMode → db.write() → scheduler.reschedule()（无条件：reschedule 读
//   最新 meta 重设间隔与并发上限，开销小且覆盖所有可能影响调度的字段）。
//
// 接线逻辑：reschedule 调用 + allowPlaintextFallback 不可用时拒绝关闭，单测覆盖。

import { syncPlaintextMode } from '../storage/plaintext'
import { isSafeStorageAvailable } from '../crypto'
import type { IpcDeps, SetSettingsResult } from './types'
import type { Meta } from '../storage/schema'

/**
 * 校验 settings:set 的 partial 输入（PRD FR-5 范围 + 安全兜底）。
 * @param current 当前完整 meta（allowPlaintextFallback 关闭门需要 plaintextMode + safeStorage 状态）
 * @returns {ok, reason?}
 */
export function validateMeta(partial: Partial<Meta>, current: Meta): SetSettingsResult {
  if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) {
    return { ok: false, reason: '输入非法' }
  }

  // plaintextMode 由 syncPlaintextMode 派生，不允许直接设
  if ('plaintextMode' in partial) {
    return { ok: false, reason: 'plaintextMode 不可直接设置' }
  }

  if (partial.checkIntervalMinutes !== undefined) {
    const v = partial.checkIntervalMinutes
    if (!Number.isInteger(v) || v < 5 || v > 1440) {
      return { ok: false, reason: '检测间隔须为 5~1440 分钟整数' }
    }
  }

  if (partial.concurrentChecks !== undefined) {
    const v = partial.concurrentChecks
    if (!Number.isInteger(v) || v < 1) {
      return { ok: false, reason: '并发上限须为 ≥1 的整数' }
    }
  }

  if (partial.pingTimeoutMs !== undefined && (typeof partial.pingTimeoutMs !== 'number' || partial.pingTimeoutMs <= 0)) {
    return { ok: false, reason: 'ping 超时须 > 0' }
  }
  if (partial.deepTimeoutMs !== undefined && (typeof partial.deepTimeoutMs !== 'number' || partial.deepTimeoutMs <= 0)) {
    return { ok: false, reason: '深检超时须 > 0' }
  }
  if (partial.clipboardClearMs !== undefined && (typeof partial.clipboardClearMs !== 'number' || partial.clipboardClearMs <= 0)) {
    return { ok: false, reason: '剪贴板清除延时须 > 0' }
  }

  if (partial.deepCheckEnabled !== undefined && typeof partial.deepCheckEnabled !== 'boolean') {
    return { ok: false, reason: 'deepCheckEnabled 须为布尔' }
  }
  if (partial.deepCheckOnEveryPoll !== undefined && typeof partial.deepCheckOnEveryPoll !== 'boolean') {
    return { ok: false, reason: 'deepCheckOnEveryPoll 须为布尔' }
  }
  if (partial.allowPlaintextFallback !== undefined && typeof partial.allowPlaintextFallback !== 'boolean') {
    return { ok: false, reason: 'allowPlaintextFallback 须为布尔' }
  }

  // PRD FR-1/FR-5：safeStorage 不可用时，明文降级开关开启后不可关闭（需恢复并重加密完成才可关）。
  // 服务端兜底：关闭请求在"safeStorage 不可用 + 库内仍有 plaintext 记录（plaintextMode=true）"时拒绝。
  if (
    partial.allowPlaintextFallback === false &&
    !isSafeStorageAvailable() &&
    current.plaintextMode === true
  ) {
    return { ok: false, reason: 'safeStorage 不可用且仍有明文记录，无法关闭明文降级' }
  }

  return { ok: true }
}

export function handleGet(deps: IpcDeps): Meta {
  return deps.db.data.meta
}

export async function handleSet(deps: IpcDeps, partial: Partial<Meta>): Promise<SetSettingsResult> {
  const v = validateMeta(partial, deps.db.data.meta)
  if (!v.ok) return v

  // 合并到当前 meta（仅覆盖传入字段）
  Object.assign(deps.db.data.meta, partial)
  syncPlaintextMode(deps.db.data)
  await deps.db.write()
  // 无条件 reschedule：reschedule 读最新 meta 重设间隔与并发上限，覆盖所有调度相关变更
  deps.scheduler.reschedule()
  return { ok: true }
}