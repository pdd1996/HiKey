// system handler（PRD §10 system:isEncryptionAvailable）
//
// 纯转发：直接调 crypto.isSafeStorageAvailable()。首启检查 safeStorage 是否就绪。
// 无副作用、无接线逻辑，不单测。

import { isSafeStorageAvailable } from '../crypto'
import type { IpcDeps } from './types'

export function handleIsEncryptionAvailable(_deps: IpcDeps): boolean {
  return isSafeStorageAvailable()
}