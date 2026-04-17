interface SegmentedOption {
  value: string
  label: string
}

interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
