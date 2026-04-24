import { useState, useCallback } from 'react'
import { apiClient } from '@/api/client'
import type { ArticleSearchResult } from '@/types/feasibility'

export interface PromiseTabProps {
  loading: boolean
  onPromise: (params: { article: string; quantity: number }) => void
}

export function PromiseTab({ loading, onPromise }: PromiseTabProps) {
  const [promiseArticle, setPromiseArticle] = useState('')
  const [promiseQty, setPromiseQty] = useState(10)

  // Autocomplete
  const [suggestions, setSuggestions] = useState<ArticleSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleArticleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const res = await apiClient.searchArticles(query, 8)
      setSuggestions(res.articles)
      setShowSuggestions(true)
    } catch {
      setSuggestions([])
    }
  }, [])

  const handlePromise = () => {
    if (!promiseArticle) return
    onPromise({ article: promiseArticle, quantity: promiseQty })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Article</label>
          <input
            type="text"
            value={promiseArticle}
            onChange={(e) => { setPromiseArticle(e.target.value); handleArticleSearch(e.target.value) }}
            onFocus={() => promiseArticle.length >= 2 && handleArticleSearch(promiseArticle)}
            placeholder="Code article..."
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-auto">
              {suggestions.map((s) => (
                <button key={s.code} onClick={() => { setPromiseArticle(s.code); setShowSuggestions(false) }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                  <span className="font-mono font-semibold">{s.code}</span>
                  <span className="text-muted-foreground ml-2">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-24">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Quantite</label>
          <input type="number" value={promiseQty} onChange={(e) => setPromiseQty(Number(e.target.value))} min={1}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
        </div>
        <button onClick={handlePromise} disabled={loading || !promiseArticle}
          className="bg-primary text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
          Trouver date
        </button>
      </div>
    </div>
  )
}
