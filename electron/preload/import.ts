// preload import 切片（PRD §10 import:pickAndParse / import:confirm）
//
// pickAndParse 返回 { sessionId, rows }；confirm 需带 sessionId 反查主进程会话
// （明文 secret 不经渲染进程，PreviewRow 已掩码）。

import { ipcRenderer } from 'electron'
import { Channels, type HikeyApi } from '../main/ipc/types'

export const importer: HikeyApi['import'] = {
  pickAndParse: () => ipcRenderer.invoke(Channels.importPickAndParse),
  confirm: (sessionId, confirms) => ipcRenderer.invoke(Channels.importConfirm, sessionId, confirms)
}