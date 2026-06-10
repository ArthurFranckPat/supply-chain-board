import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, FlaskConical, Loader2, CheckCircle2, AlertTriangle, ShoppingCart } from 'lucide-react'
import { planningBoardApi } from '@/api/repositories/planningBoard'
import { toIso } from '@/hooks/usePlanningBoard'
import type { WhatIfResponse } from '@/types/planningBoard'

interface WhatIfPanelProps {
  windowFrom: string
  windowTo: string
  onClose: () => void
}

function MissingList({ components }: { components: Record<string, number> }) {
  const entries = Object.entries(components)
  if (!entries.length) return null
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map(([code, qty]) => (
        <li key={code} className="flex justify-between font-mono text-[10px] text-destructive">
          <span>{code}</span>
          <span>manque {qty}</span>
        </li>
      ))}
    </ul>
  )
}

function Verdict({ result }: { result: WhatIfResponse }) {
  const ok = result.nouvelle.faisable
  const hasImpact = result.degraded.length > 0
  return (
    <div className="flex flex-col gap-3">
      {/* Faisabilité de la demande */}
      <div
        className={`flex items-start gap-2 rounded-xl border p-3 ${
          ok ? 'border-green/40 bg-green/5' : 'border-destructive/40 bg-destructive/5'
        }`}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        )}
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-foreground">
            {ok ? 'Demande faisable' : 'Demande non faisable'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {result.demande.quantite} × {result.demande.article} pour le {result.demande.date_besoin}
          </div>
          {!ok && <MissingList components={result.nouvelle.missing_components} />}
        </div>
      </div>

      {/* Impact sur l'existant */}
      <div
        className={`rounded-xl border p-3 ${
          hasImpact ? 'border-orange/50 bg-orange/5' : 'border-green/40 bg-green/5'
        }`}
      >
        <div className="text-[12px] font-bold text-foreground">
          {hasImpact
            ? `⚠ ${result.degraded.length} OF existant(s) deviendraient infaisables`
            : 'Aucun impact sur les OF existants'}
        </div>
        {result.stats.nb_commandes_touchees > 0 && (
          <div className="mt-0.5 text-[10px] font-semibold text-destructive">
            {result.stats.nb_commandes_touchees} commande(s) client touchée(s)
          </div>
        )}
        <div className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {result.degraded.map((d) => (
            <div key={d.num_of} className="rounded-lg border border-border/70 bg-card p-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold">{d.num_of}</span>
                <span className="text-[9px] text-muted-foreground">besoin {d.date_besoin}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">{d.article}</div>
              <MissingList components={d.composants_perdus} />
              {d.commandes.map((c) => (
                <div
                  key={c.num_commande}
                  className="mt-1 flex items-center gap-1.5 rounded bg-destructive/10 px-1.5 py-1 text-[9px] font-semibold text-destructive"
                >
                  <ShoppingCart className="h-3 w-3 shrink-0" />
                  {c.num_commande} · {c.client} · {c.qte_restante} pcs · exp. {c.date_expedition ?? '?'}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {result.stats.nb_of_evalues} OF évalués dans la fenêtre.
      </div>
    </div>
  )
}

export function WhatIfPanel({ windowFrom, windowTo, onClose }: WhatIfPanelProps) {
  const [articleQuery, setArticleQuery] = useState('')
  const [article, setArticle] = useState<string | null>(null)
  const [quantite, setQuantite] = useState(100)
  const [dateBesoin, setDateBesoin] = useState(() => toIso(new Date()))
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(articleQuery), 250)
    return () => clearTimeout(debounceRef.current)
  }, [articleQuery])

  const suggestions = useQuery({
    queryKey: ['pb-article-search', debouncedQuery],
    queryFn: () => planningBoardApi.searchArticles(debouncedQuery),
    enabled: debouncedQuery.length >= 2 && showSuggestions,
  })

  const simulation = useMutation({
    mutationFn: () =>
      planningBoardApi.whatIf({
        article: article ?? articleQuery.trim(),
        quantite,
        date_besoin: dateBesoin,
        from: windowFrom,
        to: windowTo,
      }),
  })

  const inputCls =
    'rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-4 rounded-2xl border border-border bg-card/90 p-4 shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <div>
            <div className="text-[13px] font-black tracking-tight text-foreground">Simuler une commande</div>
            <div className="text-[10px] text-muted-foreground">
              Impact avant enregistrement — rien n'est modifié
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Article</span>
          <input
            value={articleQuery}
            onChange={(e) => {
              setArticleQuery(e.target.value)
              setArticle(null)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Code ou désignation…"
            className={inputCls}
          />
          {showSuggestions && (suggestions.data?.articles?.length ?? 0) > 0 && (
            <div className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
              {suggestions.data!.articles.map((a) => (
                <button
                  key={a.code}
                  onClick={() => {
                    setArticle(a.code)
                    setArticleQuery(a.code)
                    setShowSuggestions(false)
                  }}
                  className="flex w-full flex-col px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="font-mono text-[11px] font-bold text-foreground">{a.code}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{a.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantité</span>
            <input
              type="number"
              min={1}
              value={quantite}
              onChange={(e) => setQuantite(Math.max(1, Number(e.target.value)))}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date besoin</span>
            <input
              type="date"
              value={dateBesoin}
              onChange={(e) => setDateBesoin(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <button
          onClick={() => simulation.mutate()}
          disabled={simulation.isPending || !(article ?? articleQuery.trim())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {simulation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          Évaluer l'impact
        </button>

        {simulation.error != null && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] font-semibold text-destructive">
            {simulation.error instanceof Error ? simulation.error.message : 'Erreur de simulation'}
          </div>
        )}
      </div>

      {simulation.data && <Verdict result={simulation.data} />}
    </aside>
  )
}
