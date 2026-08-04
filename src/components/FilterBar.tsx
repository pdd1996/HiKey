import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useKeys } from '@/providers/KeysProvider'
import { KNOWN_PROVIDERS } from '@shared/providers'
import { providerLabel, statusBadge, STATUS_ORDER } from '@/lib/status'

export function FilterBar() {
  const { providerFilter, setProviderFilter, statusFilter, setStatusFilter } = useKeys()

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <Select
        value={providerFilter}
        onValueChange={(v) => setProviderFilter(v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="供应商" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部供应商</SelectItem>
          {KNOWN_PROVIDERS.map((p) => (
            <SelectItem key={p} value={p}>{providerLabel(p)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          {STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>{statusBadge(s).label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}