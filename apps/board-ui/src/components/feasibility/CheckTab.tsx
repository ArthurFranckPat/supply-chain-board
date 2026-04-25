import { useState, useCallback } from 'react'
import { apiClient } from '@/api/client'
import type { ArticleSearchResult } from '@/types/feasibility'

export interface CheckTabProps {
  loading: boolean
  depthMode: 'full' | 'level1'
  useReceptions: boolean
  onDepthModeChange: (mode: 'full' | 'level1') => void
  onUseReceptionsChange: (value: boolean) => void
  onCheck: (params: { article: string; quantity: number; desired_date: string; depth_mode: 'full' | 'level1'; use_receptions: boolean }) => void
}

export function CheckTab({
  loading,
  depthMode,
  useReceptions,
  onDepthModeChange,
  onUseReceptionsChange,
  onCheck,
}: CheckTabProps) {
  const [checkArticle, setCheckArticle] = useState('')
  const [checkQty, setCheckQty] = useState(10)
  const [checkDate, setCheckDate] = useState('')

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

  const handleCheck = () => {
    if (!checkArticle || !checkDate) return
    onCheck({
      article: checkArticle,
      quantity: checkQty,
      desired_date: checkDate,
      depth_mode: depthMode,
      use_receptions: useReceptions,
    })
  }

  return (
    <div className="bg-card border border-border rounded-sm p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Article</label>
          <input
            type="text"
            value={checkArticle}
            onChange={(e) => { setCheckArticle(e.target.value); handleArticleSearch(e.target.value) }}
            onFocus={() => checkArticle.length >= 2 && handleArticleSearch(checkArticle)}
            placeholder="Code article..."
            className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-sm shadow-lg max-h-48 overflow-auto">
              {suggestions.map((s) => (
                <button key={s.code} onClick={() => { setCheckArticle(s.code); setShowSuggestions(false) }}
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
          <input type="number" value={checkQty} onChange={(e) => setCheckQty(Number(e.target.value))} min={1}
            className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background" />
        </div>
        <div className="w-40">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Date souhaitee</label>
          <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background" />
        </div>
        <button onClick={handleCheck} disabled={loading || !checkArticle || !checkDate}
          className="bg-primary text-white px-4 py-2 rounded-sm text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
          Vérifier
        </button>
        <select value={depthMode} onChange={(e) => onDepthModeChange(e.target.value as 'full' | 'level1')}
          className="px-2 py-2 border border-border rounded-sm text-[11px] bg-background text-muted-foreground">
          <option value="full">Nomenclature complete</option>
          <option value="level1">Niveau 1 uniquement</option>
        </select>
        <button
          type="button"
          onClick={() => onUseReceptionsChange(!useReceptions)}
          className={`px-2.5 py-2 rounded-sm text-[11px] font-semibold border transition-colors ${
            useReceptions
              ? 'bg-primary/10 border-primary/20 text-primary'
              : 'bg-background border-border text-muted-foreground'
          }`}
          title={useReceptions ? 'Stock + receptions prevues avant la date' : 'Stock disponible uniquement'}
        >
          {useReceptions ? 'Stock + receptions' : 'Stock immediat'}
        </button>
      </div>
    </div>
  )
}
