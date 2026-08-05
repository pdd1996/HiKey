// 导入预览表（PRD §9）：每行展示 name/provider/baseUrl/key 掩码 + 重复标记，
// 逐行 action 下拉（跳过/新增/覆盖/强制新增），跳过项锁定为 skip。

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ProviderBadge } from '@/components/ProviderBadge'
import { providerLabel } from '@/lib/status'
import type { PreviewRow } from '@main/import/types'

export type ImportAction = PreviewRow['action']

interface ImportPreviewTableProps {
  rows: PreviewRow[]
  actions: Record<string, ImportAction>
  onActionChange: (id: string, action: ImportAction) => void
}

function allowedActions(row: PreviewRow): ImportAction[] {
  if (row.status === 'skipped') return ['skip']
  if (row.status === 'duplicate' && row.dupOf === 'db') return ['overwrite', 'skip', 'force-add']
  return ['add', 'skip', 'force-add']
}

const ACTION_LABEL: Record<ImportAction, string> = {
  add: '新增',
  skip: '跳过',
  overwrite: '覆盖',
  'force-add': '强制新增',
}

function dupLabel(row: PreviewRow): string | null {
  if (row.status !== 'duplicate') return null
  const kind = row.dupKind ? `（${row.dupKind}）` : ''
  const where = row.dupOf === 'db' ? '库内重复' : '批次内重复'
  return `${where}${kind}`
}

export function ImportPreviewTable({ rows, actions, onActionChange }: ImportPreviewTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[140px] text-center">名称</TableHead>
          <TableHead className="w-[120px] text-center">供应商</TableHead>
          <TableHead className="text-center">baseUrl</TableHead>
          <TableHead className="w-[130px] text-center">Key 掩码</TableHead>
          <TableHead className="w-[110px] text-center">标记</TableHead>
          <TableHead className="w-[140px] text-center">动作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const locked = r.status === 'skipped'
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium py-3 text-center">{r.name || '—'}</TableCell>
              <TableCell className="py-3 text-center">
                {r.provider ? <ProviderBadge provider={r.provider} /> : <span className="text-muted-foreground">{providerLabel('custom')}</span>}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs py-3 text-center">{r.baseUrl || '—'}</TableCell>
              <TableCell className="font-mono text-xs py-3 text-center">{r.keyMask}</TableCell>
              <TableCell className="text-xs text-muted-foreground py-3 text-center">{dupLabel(r) ?? (r.status === 'skipped' ? '跳过' : '—')}</TableCell>
              <TableCell className="py-3 text-center">
                <Select
                  value={actions[r.id] ?? r.action}
                  onValueChange={(v) => onActionChange(r.id, v as ImportAction)}
                  disabled={locked}
                >
                  <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedActions(r).map((a) => (
                      <SelectItem key={a} value={a}>{ACTION_LABEL[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}