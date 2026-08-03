// preload settings 切片（PRD §10 settings:get / settings:set）

import { ipcRenderer } from 'electron'
import { Channels, type HikeyApi } from '../main/ipc/types'

export const settings: HikeyApi['settings'] = {
  get: () => ipcRenderer.invoke(Channels.settingsGet),
  set: (partial) => ipcRenderer.invoke(Channels.settingsSet, partial)
}