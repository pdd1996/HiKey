import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'
import { KeyRow } from '@/components/KeyRow'
import type { SafeKeyView } from '@main/keys/types'

interface KeyTableProps {
  keys: SafeKeyView[]
  loading: boolean
  onReveal: (k: SafeKeyView) => void
  onEdit: (k: SafeKeyView) => void
  onRemove: (k: SafeKeyView) => void
  onCheckNow: (id: string) => void
}

export function KeyTable({ keys, loading, onReveal, onEdit, onRemove, onCheckNow }: KeyTableProps) {
  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">加载中…</div>
  }
  if (keys.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        暂无 Key，点击右上角“添加”或“导入”开始管理。
      </div>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名称</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>最后检测</TableHead>
          <TableHead>检测模式</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((k) => (
          <KeyRow
            key={k.id}
            k={k}
            onReveal={onReveal}
            onEdit={onEdit}
            onRemove={onRemove}
            onCheckNow={onCheckNow}
          />
        ))}
      </TableBody>
    </Table>
  )
}