// preload keys 切片（PRD §10 keys:*）

import { ipcRenderer } from 'electron'
import { Channels, type HikeyApi } from '../main/ipc/types'

export const keys: HikeyApi['keys'] = {
  list: () => ipcRenderer.invoke(Channels.keysList),
  add: (input) => ipcRenderer.invoke(Channels.keysAdd, input),
  update: (id, input) => ipcRenderer.invoke(Channels.keysUpdate, id, input),
  remove: (id) => ipcRenderer.invoke(Channels.keysRemove, id),
  reveal: (id) => ipcRenderer.invoke(Channels.keysReveal, id),
  checkNow: (id, mode) => ipcRenderer.invoke(Channels.keysCheckNow, id, mode),
  checkAll: (mode) => ipcRenderer.invoke(Channels.keysCheckAll, mode)
}