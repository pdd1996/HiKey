import { Badge } from '@/components/ui/badge'
import { statusBadge } from '@/lib/status'
import type { KeyStatus } from '@main/storage/schema'

export function StatusBadge({ status }: { status: KeyStatus }) {
  const { label, className } = statusBadge(status)
  return <Badge variant="outline" className={className}>{label}</Badge>
}