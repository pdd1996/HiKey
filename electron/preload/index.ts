import { contextBridge } from 'electron'

// preload：经 contextBridge 暴露最小安全 API 给渲染进程
// M1 仅放一个冒烟用 ping()，证明主↔渲染桥打通；真实 IPC API 留 M5
contextBridge.exposeInMainWorld('hikey', {
  ping: (): string => 'hikey-m1'
})
