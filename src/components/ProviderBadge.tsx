import { Badge } from '@/components/ui/badge'
import { providerBadgeClass, providerLabel } from '@/lib/status'
import type { Provider } from '@shared/providers'

export function ProviderBadge({ provider }: { provider: Provider }) {
  return <Badge variant="outline" className={providerBadgeClass(provider)}>{providerLabel(provider)}</Badge>
}