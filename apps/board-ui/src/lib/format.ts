export function formatDate(v?: string | null): string {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return '-' }
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
