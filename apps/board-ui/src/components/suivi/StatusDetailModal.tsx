import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { suiviClient, type StatusDetailResponse } from '@/api/suivi-client'

interface StatusDetailModalProps {
  noCommande: string
  article: string
  onClose: () => void
}

export function StatusDetailModal({ noCommande, article, onClose }: StatusDetailModalProps) {
  const [data, setData] = useState<StatusDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    suiviClient.getStatusDetail(noCommande, article)
      .then(setData)
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [noCommande, article])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card border border-border shadow-2xl rounded-xl w-[680px] max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0 bg-muted/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground/70">{noCommande}</p>
                <p className="text-[15px] font-bold font-mono text-foreground leading-tight">{article}</p>
              </div>
              {data && (
                <div className="h-8 w-px bg-border mx-1"/>
              )}
              {data && data.of_info && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <span className="font-semibold">{data.of_info.num_of}</span>
                  <span className="text-border">·</span>
                  <StatutBadge num={data.of_info.statut_num} label={data.of_info.statut_texte} />
                  {data.of_info.poste_charge && (
                    <>
                      <span className="text-border">·</span>
                      <span>{data.of_info.poste_charge}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-border/60 transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading && (
            <div className="flex items-center justify-center flex-1 py-16">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
              <span className="ml-2 text-[11px] text-muted-foreground">Chargement…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center flex-1 py-16">
              <span className="text-[11px] text-red-500">{error}</span>
            </div>
          )}
          {!loading && !error && data && (
            <div className="flex flex-col divide-y divide-border/60 overflow-y-auto">
              <ComposantsSection data={data} />
              <StockSection data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Statut badge ── */
function StatutBadge({ num, label }: { num: number; label: string }) {
  const cfg = num === 1
    ? { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' }
    : num === 2
    ? { color: 'text-sky-600 bg-sky-50 border-sky-200', dot: 'bg-sky-500' }
    : { color: 'text-amber-600 bg-amber-50 border-amber-200', dot: 'bg-amber-500' }
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-semibold', cfg.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {label}
    </span>
  )
}

/* ── Composants section ── */
function ComposantsSection({ data }: { data: StatusDetailResponse }) {
  const comps = data.composants
  const totalManque = comps.reduce((s, c) => s + c.qte_manquante, 0)

  return (
    <div className="px-5 py-4">
      {/* Titre */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Composants bloquants</span>
        </div>
        {comps.length > 0 ? (
          <span className="text-[11px] font-bold font-mono text-red-500">−{totalManque.toLocaleString('fr-FR')}</span>
        ) : (
          <span className="text-[11px] text-emerald-600 font-semibold">✓ aucun</span>
        )}
      </div>

      {comps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Aucun composant en rupture.</p>
      ) : (
        <div className="border border-red-200 rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-red-50 border-b border-red-200">
                <th className="text-left py-1.5 px-3 text-red-700 font-semibold">Article</th>
                <th className="text-right py-1.5 px-3 text-red-700 font-semibold">Rupture</th>
                <th className="text-right py-1.5 px-3 text-red-700 font-semibold">Dispo</th>
                <th className="text-right py-1.5 px-3 text-red-700 font-semibold">Proch. arrivée</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((comp) => {
                const st = data.stock_composants[comp.article]
                return (
                  <tr key={comp.article} className="border-b border-red-100 last:border-0 hover:bg-red-50/50 transition-colors">
                    <td className="py-2 px-3">
                      <p className="font-bold font-mono">{comp.article}</p>
                      {comp.designation && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{comp.designation}</p>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold font-mono text-red-500 tabular-nums">
                      −{comp.qte_manquante.toLocaleString('fr-FR')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      {st ? st.disponible_total.toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground font-mono tabular-nums text-[10px]">
                      {st?.prochain_arrive
                        ? `${st.prochain_arrive}${st.qte_arrive > 0 ? ` (×${st.qte_arrive.toLocaleString('fr-FR')})` : ''}`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Stock section ── */
function StockSection({ data }: { data: StatusDetailResponse }) {
  const s = data.stock_detail
  const maxVal = Math.max(s.stock_physique, s.stock_sous_cq, s.stock_alloue, s.disponible_total, 1)

  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Physique', value: s.stock_physique, color: 'bg-blue-500' },
    { label: 'Sous CQ', value: s.stock_sous_cq, color: 'bg-amber-500' },
    { label: 'Alloué', value: s.stock_alloue, color: 'bg-violet-500' },
    { label: 'Dispo totale', value: s.disponible_total, color: 'bg-emerald-500' },
  ]

  return (
    <div className="px-5 py-4">
      {/* Titre */}
      <div className="flex items-center gap-2 mb-3">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Stock article</span>
      </div>

      <div className="flex gap-4">
        {/* Numéros */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          {rows.map((r) => (
            <div key={r.label} className="bg-muted/30 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={cn('w-2 h-2 rounded-sm shrink-0', r.color)} />
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold leading-none">{r.label}</span>
              </div>
              <p className="text-[15px] font-bold font-mono leading-none">{r.value.toLocaleString('fr-FR')}</p>
            </div>
          ))}
        </div>

        {/* Barre visuelle */}
        <div className="w-[120px] shrink-0 flex flex-col justify-between">
          <div className="flex h-7 rounded overflow-hidden border border-border/60 mb-1">
            {rows.filter(r => r.value > 0).map((r) => (
              <div
                key={r.label}
                className={cn('flex items-center justify-center text-[9px] font-semibold text-white transition-all', r.color)}
                style={{ width: `${Math.max((r.value / maxVal) * 100, r.value > 0 ? 4 : 0)}%` }}
              >
                {r.value > 0 && <span className="truncate px-0.5">{r.value.toLocaleString('fr-FR')}</span>}
              </div>
            ))}
          </div>
          {s.prochain_arrive && (
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-500 shrink-0 mt-0.5">
                <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8 1 3 1 8 20 8"/>
              </svg>
              <p className="text-[9px] text-amber-700 leading-snug">
                {s.qte_arrive > 0 ? `×${s.qte_arrive.toLocaleString('fr-FR')}` : ''} {s.prochain_arrive}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
