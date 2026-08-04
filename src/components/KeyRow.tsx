import { MoreHorizontal, Eye, Pencil, Trash2, RefreshCw, Activity } from 'lucide-react'
import { TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
      <TableCell className="font-medium">{k.name}</TableCell>
      <TableCell><ProviderBadge provider={k.provider} /></TableCell>
      <TableCell><StatusBadge status={k.status} /></TableCell>
      <TableCell className="text-muted-foreground">{formatRelative(k.lastChecked)}</TableCell>
      <TableCell className="text-muted-foreground">{formatPingMs(k.pingMs)}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onReveal(k)}>
              <Eye className="mr-2 h-4 w-4" /> 查看明文
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(k)}>
              <Pencil className="mr-2 h-4 w-4" /> 编辑
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCheckNow(k.id, 'ping')}>
              <RefreshCw className="mr-2 h-4 w-4" /> Ping
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCheckNow(k.id, 'deep')}>
              <Activity className="mr-2 h-4 w-4" /> 深检
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRemove(k)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}