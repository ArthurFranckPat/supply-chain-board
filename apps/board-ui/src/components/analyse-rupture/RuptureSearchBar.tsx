interface RuptureSearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  onAnalyze: () => void
  isPending: boolean
}

export function RuptureSearchBar({ query, onQueryChange, onAnalyze, isPending }: RuptureSearchBarProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
        placeholder="Code composant (ex: E7368)"
        className="flex-1 h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground"
      />
      <button
        onClick={() => onAnalyze()}
        disabled={isPending || !query.trim()}
        className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? '...' : 'Analyser'}
      </button>
    </div>
  )
}
