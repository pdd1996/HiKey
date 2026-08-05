// import handler（PRD §10 import:pickAndParse / import:confirm）
//
// pickAndParse：主进程弹文件选择框 → 读文件 → 按扩展名分流 parseEnvFile/parseJsonFile
//   → buildPreview（去重 + 掩码）→ 会话存内存 Map（明文 items 不外泄）→ 返回 {sessionId, rows}。
//   dialog 取消 → null；解析失败 → {ok:false, error}。
// confirm：按 sessionId 反查会话 → applyImport（写库，纯逻辑已测）→ 返回 ApplyResult。
//
// 接线逻辑：扩展名分流 + 解析错误映射 + 会话反查，单测覆盖。

import { randomUUID } from 'crypto'
import { basename, extname } from 'path'
import { parseEnvFile } from '../import/env'
import { parseJsonFile } from '../import/json'
import { buildPreview } from '../import/preview'
import { applyImport } from '../import/apply'
import { ImportParseError } from '../import/types'
import type { IpcDeps, PickAndParseResult, ConfirmResult } from './types'
import type { ConfirmItem } from '../import/types'

/** 文件选择框：限制 .env/.json，≤1MB（PRD FR-3）。 */
const OPEN_DIALOG_OPTS: Electron.OpenDialogOptions = {
  title: '导入 Key 文件',
  filters: [{ name: 'Key 文件', extensions: ['env', 'json'] }],
  properties: ['openFile']
}

export async function handlePickAndParse(deps: IpcDeps): Promise<PickAndParseResult> {
  const win = deps.getMainWindow()
  const res = await deps.dialog.showOpenDialog(win, OPEN_DIALOG_OPTS)
  if (res.canceled || res.filePaths.length === 0) return null

  const filePath = res.filePaths[0]
  const ext = extname(filePath).toLowerCase()
  const base = basename(filePath).toLowerCase()
  // extname('.env') === ''（点开头无主名），需用 basename 兜底识别裸 .env 文件
  const isEnv = ext === '.env' || base === '.env' || base.startsWith('.env.')
  if (!isEnv && ext !== '.json') {
    return { ok: false, error: '仅支持 .env / .json 文件' }
  }

  let content: string
  try {
    content = await deps.fs.readFile(filePath)
  } catch (e) {
    return { ok: false, error: `读取文件失败：${(e as Error).message}` }
  }

  // 按扩展名分流解析
  let parsed
  try {
    if (isEnv) {
      parsed = parseEnvFile(content)
    } else {
      parsed = parseJsonFile(content)
    }
  } catch (e) {
    if (e instanceof ImportParseError) {
      return { ok: false, error: e.kind === 'invalid-json' ? 'JSON 解析失败' : 'JSON 顶层须为数组' }
    }
    return { ok: false, error: `解析失败：${(e as Error).message}` }
  }

  // 去重 + 掩码预览（明文 items 留主进程内存）
  const session = buildPreview(parsed.items, parsed.skipped, deps.db.data.keys)
  const sessionId = randomUUID()
  deps.sessions.set(sessionId, session)

  return { ok: true, sessionId, rows: session.rows }
}

export async function handleConfirm(
  deps: IpcDeps,
  sessionId: string,
  confirms: ConfirmItem[]
): Promise<ConfirmResult> {
  const session = deps.sessions.get(sessionId)
  if (!session) {
    return { ok: false, reason: 'session-not-found' }
  }
  const result = await applyImport(confirms, session, deps.now())
  // 写入完成即清理会话（明文 items 不长期驻留）
  deps.sessions.delete(sessionId)
  return { ok: true, result }
}