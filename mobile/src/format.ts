// Same output as the web app's src/app/lib/format.ts, so a value reads
// identically on both.

export function money(value: number, currency = 'USD', compact = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? (value < 1000 ? 0 : 1) : value < 20 ? 2 : 0,
  }).format(value)
}

export function moneyRange(low: number, high: number, currency = 'USD', compact = false): string {
  if (!low && !high) return '—'
  if (low === high) return money(low, currency, compact)
  return `${money(low, currency, compact)} – ${money(high, currency, compact)}`
}

export function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function untilLabel(ts: number, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((ts - now) / 60_000))
  if (minutes < 60) return `in ${minutes}m`
  return `in ${Math.round(minutes / 60)}h`
}
