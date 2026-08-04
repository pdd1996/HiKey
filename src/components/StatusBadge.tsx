import { Badge } from '@/components/ui/badge'
import { statusBadge } from '@/lib/status'

export function StatusBadge({ status }: { status?: string }) {
  const { label, className } = statusBadge(status)
  return <Badge variant="outline" className={className}>{label}</Badge>
}