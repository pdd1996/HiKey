// 查看明文（PRD §9）：二次确认 → keys.reveal 一次性显示 + 复制提示文案。
// 渲染进程不缓存明文（仅 Dialog 局部 state，关闭即弃）。keys.reveal 主进程已写剪贴板并
// 安排 60s 比对清除；UI 文案说明系统剪贴板历史可能保留。

import { useEffect, useState } from 'react'
import { ShieldAlert, Copy, Check } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useKeys } from '@/providers/KeysProvider'
import type { SafeKeyView, RevealOutcome } from '@main/keys/types'

interface RevealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  k: SafeKeyView | null
}

export function RevealDialog({ open, onOpenChange, k }: RevealDialogProps) {
  const { reveal } = useKeys()
  const [result, setResult] = useState<RevealOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // 关闭时清空状态
  useEffect(() => {
    if (!open) {
      setResult(null)
      setBusy(false)
      setCopied(false)
    }
  }, [open])

  async function handleConfirm() {
    if (!k) return
    setBusy(true)
    try {
      const r = await reveal(k.id)
      setResult(r)
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!result?.ok) return
    try {
      await navigator.clipboard.writeText(result.plaintext)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板写入失败（如未授权），静默；用户可手动选中复制
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>查看明文</DialogTitle>
          <DialogDescription>
            将一次性显示 key 的明文。
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <p className="text-sm">
              确认查看 <span className="font-medium">{k?.name}</span> 的明文？
            </p>
            <div className="flex items-start gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>明文仅显示一次，关闭后需再次确认；主进程将在约 60s 后比对剪贴板内容，若仍为本次复制的 key 则清除。</span>
            </div>
          </div>
        )}

        {result && result.ok && (
          <div className="space-y-3">
            <div className="break-all rounded-md border bg-muted/50 p-3 font-mono text-sm">
              {result.plaintext}
            </div>

          </div>
        )}

        {result && !result.ok && (
          <p className="text-sm text-destructive">
            无法解密：{result.reason === 'not-found' ? '记录不存在' : 'safeStorage 不可解密'}
          </p>
        )}

        <DialogFooter>
          {!result && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                取消
              </Button>
              <Button onClick={handleConfirm} disabled={busy}>
                {busy ? '读取中…' : '确认查看'}
              </Button>
            </>
          )}
          {result && result.ok && (
            <>
              <Button variant="outline" onClick={handleCopy} disabled={busy}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> 复制
                  </>
                )}
              </Button>
              <Button onClick={() => onOpenChange(false)}>关闭</Button>
            </>
          )}
          {result && !result.ok && (
            <Button onClick={() => onOpenChange(false)}>关闭</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}