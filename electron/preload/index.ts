// preload：经 contextBridge 暴露最小安全 API 给渲染进程（PRD §10）
//
// M5：替换 M1 冒烟 ping()，暴露全部 14 通道（system/keys/import/backup/settings +
// onStatusUpdate）。contextIsolation: true 下，渲染进程只能经 window.hikey 访问这些
// invoke 包装，无法直接拿 ipcRenderer。明文仅在 keys:reveal 时经 IPC 一次性返回，
// 渲染进程不得缓存（PRD FR-1 明文边界）。

import { contextBridge } from 'electron'
import { hikeyApi, type HikeyApi } from './api'

contextBridge.exposeInMainWorld('hikey', hikeyApi)

// 渲染进程类型声明：window.hikey
declare global {
  interface Window {
    hikey: HikeyApi
  }
}