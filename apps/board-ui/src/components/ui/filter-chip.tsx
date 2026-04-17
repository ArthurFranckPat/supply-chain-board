import { X } from 'lucide-react'

interface FilterChipProps {
  label: string
  onClear: () => void
  tone?: 'default' | 'danger'
}

export function FilterChip({ label, onClear, tone = 'default' }: FilterChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full text-[11px] font-semibold ${
        tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary'
      }`}
    >
      {label}
      <button
        onClick={onClear}
        className="w-4 h-4 rounded-full bg-black/8 text-current flex items-center justify-center hover:bg-black/15 transition-colors"
      >
        <X className="h-2 w-2" />
      </button>
    </span>
  )
}
