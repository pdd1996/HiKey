// 剪贴板 60s 比对清除（PRD FR-1）
//
// FR-1：复制后应用在 60 秒后尝试清除剪贴板；清除前由主进程比对剪贴板当前内容
// 是否仍等于本次复制的明文 key，一致才清除，否则不动（避免误清用户期间复制的
// 其他内容）。UI 文案明确说明系统剪贴板历史可能仍保留，不承诺"即弃"。
//
// 全部副作用（readClipboard/clearClipboard/setTimeout）注入，vitest 用 fake timers
// + mock 可完整测时序与判定，不依赖真实 Electron clipboard。

import type { ClipboardDeps } from './types'

/**
 * 纯决策：剪贴板当前内容是否仍等于本次复制的 key，一致才应清除。
 * - copiedKey 为空 → 不清除（无内容可比对）
 * - current === copiedKey → 清除
 * - current 为其他内容（用户期间复制了别的）→ 不动，避免误清
 */
export function shouldClearClipboard(current: string | undefined, copiedKey: string): boolean {
  if (!copiedKey) return false
  return current === copiedKey
}

/**
 * 编排：delayMs 后读剪贴板 → 比对 → 命中才清空。
 * @returns 定时器句柄（调用方可留存以备取消，关窗 best-effort 丢弃未完成定时器）
 */
export function scheduleClipboardClear(copiedKey: string, deps: ClipboardDeps): unknown {
  return deps.setTimeout(() => {
    const current = deps.readClipboard()
    if (shouldClearClipboard(current, copiedKey)) {
      deps.clearClipboard()
    }
  }, deps.delayMs)
}