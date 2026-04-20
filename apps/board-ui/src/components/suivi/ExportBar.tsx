import { Download } from 'lucide-react'
import type { OrderRow } from '@/types/suivi-commandes'

interface ExportBarProps {
  rows: OrderRow[]
}

export function ExportBar({ rows }: ExportBarProps) {
  function handleExport() {
    if (rows.length === 0) return

    const headers = Object.keys(rows[0])
    const csvLines = [
      headers.join(';'),
      ...rows.map((r) => headers.map((h) => String((r as unknown as Record<string, unknown>)[h] ?? '')).join(';')),
    ]
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const now = new Date()
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    a.href = url
    a.download = `export_suivi_${ts}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  )
}
