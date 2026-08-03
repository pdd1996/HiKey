// 导入对话框（PRD §9）：pickAndParse → 预览表 → 逐条改 action → confirm → ApplyResult。
// 流程：选文件（pickAndParse）→ 预览（preview）→ 结果（result）→ 关闭后刷新 key 列表。
// session 仅存主进程内存，confirm 后删除。

import { useEffect, useState } from 'react'
import { Upload, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ImportPreviewTable, type ImportAction } from '@/components/ImportPreviewTable'
import { useKeys } from '@/providers/KeysProvider'
import type { PreviewRow, ConfirmItem } from '@main/import/types'
import type { ApplyResult } from '@main/import/apply'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Stage = 'pick' | 'preview' | 'result'

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { refresh } = useKeys()
  const [stage, setStage] = useState<Stage>('pick')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [actions, setActions] = useState<Record<string, ImportAction>>({})
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 关闭时复位
  useEffect(() => {
    if (!open) {
      setStage('pick')
      setSessionId(null)
      setRows([])
      setActions({})
      setResult(null)
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function handlePick() {
    setBusy(true)
    setError(null)
    try {
      const r = await window.hikey.import.pickAndParse()
      if (r === null) return // 用户取消，留在 pick
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSessionId(r.sessionId)
      setRows(r.rows)
      // 初始 action 按 row.action 预填
      const init: Record<string, ImportAction> = {}
      for (const row of r.rows) init[row.id] = row.action
      setActions(init)
      setStage('preview')
    } finally {
      setBusy(false)
    }
  }

  function handleActionChange(id: string, action: ImportAction) {
    setActions((prev) => ({ ...prev, [id]: action }))
  }

  async function handleConfirm() {
    if (!sessionId) return
    setBusy(true)
    try {
      const confirms: ConfirmItem[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        action: actions[r.id] ?? r.action,
      }))
      const out = await window.hikey.import.confirm(sessionId, confirms)
      if (out.ok) {
        setResult(out.result)
        setStage('result')
        await refresh()
      } else {
        toast.error('导入失败', { description: out.reason })
      }
    } finally {
      setBusy(false)
    }
  }

  const dupCount = rows.filter((r) => r.status === 'duplicate').length
  const skipCount = rows.filter((r) => r.status === 'skipped').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>导入 Key</DialogTitle>
          <DialogDescription>
            从 .env / .json 文件导入。明文仅在主进程内存暂存，确认后写入。
          </DialogDescription>
        </DialogHeader>

        {stage === 'pick' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              支持解析标准 <code>.env</code>（OPENAI_API_KEY / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY 等）与 key 数组 <code>.json</code>。
            </p>
            {error && <p className="text-sm text-destructive">解析失败：{error}</p>}
            <Button onClick={handlePick} disabled={busy}>
              <FileUp className="mr-2 h-4 w-4" /> {busy ? '处理中…' : '选择文件'}
            </Button>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              共 {rows.length} 条，其中 {dupCount} 条重复、{skipCount} 条跳过。逐条调整动作后确认写入。
            </p>
            <div className="max-h-[420px] overflow-auto">
              <ImportPreviewTable rows={rows} actions={actions} onActionChange={handleActionChange} />
            </div>
          </div>
        )}

        {stage === 'result' && result && (
          <div className="space-y-3 py-2">
            <p className="text-sm">导入完成：新增 {result.added}，覆盖 {result.overwritten}，跳过 {result.skipped}，失败 {result.failed}。</p>
            {result.failures.length > 0 && (
              <ul className="max-h-[200px] overflow-auto text-xs text-destructive">
                {result.failures.map((f) => (
                  <li key={f.id}>• {f.id}: {f.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === 'preview' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
              <Button onClick={handleConfirm} disabled={busy}>
                <Upload className="mr-2 h-4 w-4" /> {busy ? '写入中…' : '确认写入'}
              </Button>
            </>
          )}
          {stage === 'result' && (
            <Button onClick={() => onOpenChange(false)}>完成</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}