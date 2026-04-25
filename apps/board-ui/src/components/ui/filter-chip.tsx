

interface FilterChipProps {
  label: string
  onClear: () => void
  tone?: 'default' | 'danger'
}

export function FilterChip({ label, onClear, tone = 'default' }: FilterChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 text-[10px] font-semibold border ${
        tone === 'danger'
          ? 'bg-destructive/10 text-destructive border-destructive/20'
          : 'bg-primary/10 text-primary border-primary/20'
      }`}
    >
      {label}
      <button
        onClick={onClear}
        className="w-3.5 h-3.5 bg-black/5 text-current flex items-center justify-center hover:bg-black/15 transition-colors"
      >
        ×
      </button>
    </span>
  )
}
