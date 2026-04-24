import { Search, Loader2 } from 'lucide-react'

interface RuptureSearchBarProps {
  query: string
  onQueryChange: (value: string) => void
  onAnalyze: () => void
  isPending: boolean
}

export function RuptureSearchBar({ query, onQueryChange, onAnalyze, isPending }: RuptureSearchBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
          placeholder="Code composant (ex: E7368)"
          className="w-full h-9 pl-10 pr-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <button
        onClick={() => onAnalyze()}
        disabled={isPending || !query.trim()}
        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        Analyser
      </button>
    </div>
  )
}
