export function formatDate(v?: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return '-' }
}

export function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch {
    return iso
  }
}

export function formatDateShort(v?: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return v }
}

export function formatDateLabel(v?: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) } catch { return v }
}

export function isOverdue(d: string | null): boolean {
  if (!d) return false
  return new Date(d) < new Date(new Date().toDateString())
}

export function isSoon(d: string | null): boolean {
  if (!d) return false
  const diff = (new Date(d).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
  return diff >= 0 && diff <= 2
}

export function fmtNumber(n: number, decimals = 1): string {
  if (n < 0) return '∞'
  return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtEuros(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k€`
  return `${n.toFixed(0)}€`
}
