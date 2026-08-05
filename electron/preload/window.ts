// preload window 切片：自定义标题栏所需的最小化/最大化/关闭 IPC。
// 仅在主进程 titleBarStyle: 'hidden' 后由渲染进程的 WindowControls 调用；
// 通道安全无副作用（直接转发到主进程对主窗口的调用）。
// 主窗口可能尚未创建（getMainWindow() 返回 undefined），handler 静默 no-op，
// 故此处不必关心返回。

import { ipcRenderer } from 'electron'
import { Channels } from '../main/ipc/types'

export const windowCtl = {
  minimize: (): Promise<void> => ipcRenderer.invoke(Channels.windowMinimize),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke(Channels.windowToggleMaximize),
  close: (): Promise<void> => ipcRenderer.invoke(Channels.windowClose)
}