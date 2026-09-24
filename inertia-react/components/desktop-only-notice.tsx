import { useState } from 'react'
import { Monitor, X } from 'lucide-react'

/**
 * Bandeau mobile (< md) des vues conçues pour grand écran (Gantt, séquenceur,
 * configuration…). Elles restent utilisables en défilant, mais le dire évite
 * de prendre la densité pour un bug. Fermable, sans persistance.
 */
export function DesktopOnlyNotice() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="flex flex-none items-center gap-2 border-b border-border bg-muted px-4 py-2 text-[13px] text-muted-foreground md:hidden print:hidden">
      <Monitor size={16} strokeWidth={1.75} className="flex-none" />
      <span className="flex-1">
        Vue conçue pour écran large — faites défiler ou passez sur ordinateur.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Masquer"
        className="flex size-9 flex-none items-center justify-center rounded-md hover:bg-background"
      >
        <X size={16} />
      </button>
    </div>
  )
}
