import type { OrderRow } from '@/types/suivi-commandes'

interface ExportBarProps { rows: OrderRow[] }

export function ExportBar({ rows }: ExportBarProps) {
  function handleExport() {
    if (rows.length === 0) return
    const headers = Object.keys(rows[0])
    const csvLines = [headers.join(';'), ...rows.map(r => headers.map(h => String((r as unknown as Record<string, unknown>)[h] ?? '')).join(';'))]
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    a.href = url; a.download = `export_suivi_${ts}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleExport} disabled={rows.length === 0}
      className="h-6 px-2 text-[11px] text-muted-foreground border border-border hover:bg-muted disabled:opacity-50">
      CSV
    </button>
  )
}
