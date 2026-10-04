// Shared formatting helpers (kept out of component files so Fast Refresh stays happy)
export function fmtTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ago(ts) {
  if (!ts) return 'never'
  const m = Math.round((Date.now() - new Date(ts)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function until(ts) {
  if (!ts) return null
  const m = Math.round((new Date(ts) - Date.now()) / 60000)
  if (m <= 0) return 'due now'
  return m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`
}

export const money = n => (n ? `$${Math.round(n / 1000)}k` : '—')
