import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useKeys } from '@/providers/KeysProvider'
import type { SafeKeyView } from '@main/keys/types'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  k: SafeKeyView | null
}

export function DeleteConfirmDialog({ open, onOpenChange, k }: DeleteConfirmDialogProps) {
  const { removeKey } = useKeys()

  async function handleDelete() {
    if (!k) return
    const out = await removeKey(k.id)
    if (out.ok) {
      toast.success('已删除')
      onOpenChange(false)
    } else {
      toast.error('删除失败', { description: out.reason ?? '未知原因' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>删除 Key</DialogTitle>
          <DialogDescription>
            确认删除 <span className="font-medium text-foreground">{k?.name}</span>？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}