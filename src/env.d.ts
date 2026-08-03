/// <reference types="vite/client" />

// preload 经 contextBridge 暴露给渲染进程的 14 通道安全 API（M5 起为完整 HikeyApi）。
// 类型来自主进程 ipc/types.ts，经 @main tsconfig 别名解析（type-only，不进 bundle）。
import type { HikeyApi } from '@main/ipc/types'

declare global {
  interface Window {
    hikey: HikeyApi
  }
}

export {}