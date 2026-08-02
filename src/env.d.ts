/// <reference types="vite/client" />

// preload 经 contextBridge 暴露给渲染进程的安全 API（M1 仅冒烟用 ping）
interface HikeyBridge {
  ping: () => string
}

interface Window {
  hikey: HikeyBridge
}
