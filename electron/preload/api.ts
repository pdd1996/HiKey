// preload API 组合 + status:update 订阅（PRD §10 onStatusUpdate）
//
// 各子系统切片经 contextBridge 暴露；onStatusUpdate 订阅主进程下发的状态变更
// （status:update 载荷已剥 encSecret，见 ipc/keys.ts toSafeView）。

import { ipcRenderer } from 'electron'
import { Channels, type HikeyApi, type SafeKeyView } from '../main/ipc/types'
import { system } from './system'
import { keys } from './keys'
import { importer } from './import'
import { backup } from './backup'
import { settings } from './settings'
import { windowCtl as windowApi } from './window'

export type { HikeyApi }

/** 订阅状态变更，返回取消订阅函数。载荷已剥 encSecret（SafeKeyView）。 */
const onStatusUpdate: HikeyApi['onStatusUpdate'] = (cb) => {
  const handler = (_e: Electron.IpcRendererEvent, payload: { id: string; record: SafeKeyView }) => cb(payload)
  ipcRenderer.on(Channels.statusUpdate, handler)
  return () => ipcRenderer.removeListener(Channels.statusUpdate, handler)
}

export const hikeyApi: HikeyApi = {
  system,
  keys,
  import: importer,
  backup,
  settings,
  window: windowApi,
  onStatusUpdate
}