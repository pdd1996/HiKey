import { Eye, Pencil, Trash2, Activity } from 'lucide-react'
import { TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { ProviderBadge } from '@/components/ProviderBadge'
import { formatRelative, formatPingMs } from '@/lib/format'
import type { SafeKeyView } from '@main/keys/types'

interface KeyRowProps {
  k: SafeKeyView
  onReveal: (k: SafeKeyView) => void
  onEdit: (k: SafeKeyView) => void
  onRemove: (k: SafeKeyView) => void
  onCheckNow: (id: string, mode: 'ping' | 'deep') => void
}

export function KeyRow({ k, onReveal, onEdit, onRemove, onCheckNow }: KeyRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium text-center">{k.name}</TableCell>
      <TableCell className="text-center"><ProviderBadge provider={k.provider} /></TableCell>
      <TableCell className="text-center"><StatusBadge status={k.status} /></TableCell>
      <TableCell className="text-muted-foreground text-center">{formatRelative(k.lastChecked)}</TableCell>
      <TableCell className="text-muted-foreground text-center">{formatPingMs(k.pingMs)}</TableCell>
      <TableCell className="text-center">
        <div className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onReveal(k)}
            title="查看明文"
            aria-label="查看明文"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(k)}
            title="编辑"
            aria-label="编辑"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onCheckNow(k.id, 'deep')}
            title="深检"
            aria-label="深检"
          >
            <Activity className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onRemove(k)}
            title="删除"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
