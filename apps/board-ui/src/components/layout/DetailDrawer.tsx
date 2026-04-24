import { Button } from '@/components/ui/button'
import type { DetailItem } from '@/types/api'

interface DetailDrawerProps {
  item: DetailItem | null
  onClose: () => void
}

export function DetailDrawer({ item, onClose }: DetailDrawerProps) {
  if (!item) return null

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card overflow-auto">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono uppercase">Detail</p>
          <h3 className="text-sm font-semibold">{item.title}</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
      </div>
      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[70vh] font-mono">
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      </div>
    </aside>
  )
}
