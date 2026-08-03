// preload system 切片：system:isEncryptionAvailable（PRD §10）

import { ipcRenderer } from 'electron'
import { Channels } from '../main/ipc/types'

export const system = {
  isEncryptionAvailable: (): Promise<boolean> => ipcRenderer.invoke(Channels.systemIsEncryptionAvailable)
}