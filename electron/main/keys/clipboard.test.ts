import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shouldClearClipboard, scheduleClipboardClear } from './clipboard'
import type { ClipboardDeps } from './types'

describe('shouldClearClipboard', () => {
  it('current === copiedKey 且非空 → true', () => {
    expect(shouldClearClipboard('sk-x', 'sk-x')).toBe(true)
  })
  it('current !== copiedKey → false（不误清其他内容）', () => {
    expect(shouldClearClipboard('other-stuff', 'sk-x')).toBe(false)
  })
  it('current 为空 → false', () => {
    expect(shouldClearClipboard('', 'sk-x')).toBe(false)
  })
  it('current 为 undefined → false', () => {
    expect(shouldClearClipboard(undefined, 'sk-x')).toBe(false)
  })
  it('copiedKey 为空 → false（无内容可比对）', () => {
    expect(shouldClearClipboard('', '')).toBe(false)
    expect(shouldClearClipboard('x', '')).toBe(false)
  })
})

describe('scheduleClipboardClear', () => {
  let readClipboard: ReturnType<typeof vi.fn>
  let clearClipboard: ReturnType<typeof vi.fn>
  let deps: ClipboardDeps

  beforeEach(() => {
    vi.useFakeTimers()
    readClipboard = vi.fn(() => 'sk-x')
    clearClipboard = vi.fn()
    deps = {
      readClipboard: readClipboard as unknown as ClipboardDeps['readClipboard'],
      clearClipboard: clearClipboard as unknown as ClipboardDeps['clearClipboard'],
      setTimeout: setTimeout as unknown as ClipboardDeps['setTimeout'],
      delayMs: 60000
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('60s 后 readClipboard 返回 copiedKey → clearClipboard 被调', () => {
    scheduleClipboardClear('sk-x', deps)
    expect(clearClipboard).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60000)
    expect(readClipboard).toHaveBeenCalledTimes(1)
    expect(clearClipboard).toHaveBeenCalledTimes(1)
  })

  it('60s 后 readClipboard 返回其他内容 → 不调 clearClipboard', () => {
    readClipboard = vi.fn(() => 'other-stuff')
    deps.readClipboard = readClipboard as unknown as ClipboardDeps['readClipboard']
    scheduleClipboardClear('sk-x', deps)
    vi.advanceTimersByTime(60000)
    expect(clearClipboard).not.toHaveBeenCalled()
  })

  it('未到 60s → 不读不清', () => {
    scheduleClipboardClear('sk-x', deps)
    vi.advanceTimersByTime(59999)
    expect(readClipboard).not.toHaveBeenCalled()
    expect(clearClipboard).not.toHaveBeenCalled()
  })

  it('copiedKey 为空 → 60s 后不调 clearClipboard', () => {
    scheduleClipboardClear('', deps)
    vi.advanceTimersByTime(60000)
    expect(clearClipboard).not.toHaveBeenCalled()
  })

  it('60s 后剪贴板已空 → 不调 clearClipboard（幂等，不清已空的）', () => {
    readClipboard = vi.fn(() => '')
    deps.readClipboard = readClipboard as unknown as ClipboardDeps['readClipboard']
    scheduleClipboardClear('sk-x', deps)
    vi.advanceTimersByTime(60000)
    expect(clearClipboard).not.toHaveBeenCalled()
  })
})