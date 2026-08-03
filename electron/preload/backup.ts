// preload backup 切片（PRD §10 backup:export / backup:restore）

import { ipcRenderer } from 'electron'
import { Channels, type HikeyApi } from '../main/ipc/types'

export const backup: HikeyApi['backup'] = {
  export: () => ipcRenderer.invoke(Channels.backupExport),
  restore: () => ipcRenderer.invoke(Channels.backupRestore)
}