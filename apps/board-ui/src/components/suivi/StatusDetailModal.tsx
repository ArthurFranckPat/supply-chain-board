import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { suiviClient, type StatusDetailResponse } from '@/api/suivi-client'

interface StatusDetailModalProps {
  noCommande: string
  article: string
  onClose: () => void
}

type Tab = 'of' | 'composants' | 'stock'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'of',
    label: 'OF',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
  {
    key: 'composants',
    label: 'Composants',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
  },
  {
    key: 'stock',
    label: 'Stock',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
]

export function StatusDetailModal({ noCommande, article, onClose }: StatusDetailModalProps) {
  const [data, setData] = useState<StatusDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('stock')
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

  const composantsCount = data?.composants.length ?? 0

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card border border-border shadow-2xl rounded-lg w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-muted/30">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-muted-foreground/70 truncate">{noCommande}</p>
            <p className="text-[14px] font-bold font-mono text-foreground truncate">{article}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-border transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map(({ key, label, icon }) => {
            const isActive = activeTab === key
            const badge = key === 'composants' && composantsCount > 0
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 text-[11px] font-medium border-b-2 transition-colors',
                  isActive
                    ? 'text-foreground border-primary -mb-px bg-card'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                )}
              >
                <span className={cn(isActive ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
                {label}
                {badge && (
                  <span className="text-[9px] font-mono bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                    {composantsCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Body — fixed height to prevent layout shift */}
        <div className="h-[320px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
              <span className="ml-2 text-[11px] text-muted-foreground">Chargement…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full">
              <span className="text-[11px] text-red-500">{error}</span>
            </div>
          )}
          {!loading && !error && data && (
            <>
              {activeTab === 'of' && <OfTab data={data} />}
              {activeTab === 'composants' && <ComposantsTab data={data} />}
              {activeTab === 'stock' && <StockTab data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── OF tab ── */
function OfTab({ data }: { data: StatusDetailResponse }) {
  if (!data.of_info) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-30">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span className="text-[11px]">Aucun OF planifié ou exécuté</span>
      </div>
    )
  }
  const of = data.of_info

  const statutConfig: Record<number, { label: string; color: string; bg: string }> = {
    1: { label: 'fermé', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200' },
    2: { label: 'planifié', color: 'text-sky-700', bg: 'bg-sky-100 border-sky-200' },
    3: { label: 'suggéré', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-200' },
  }
  const stat = statutConfig[of.statut_num] ?? { label: of.statut_texte, color: 'text-muted-foreground', bg: 'bg-muted border-border' }

  return (
    <div className="p-5 space-y-4">
      {/* Numéro OF */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Ordre de fabrication</p>
          <p className="text-[13px] font-bold font-mono text-foreground">{of.num_of}</p>
        </div>
        <span className={cn('px-2 py-0.5 text-[10px] font-semibold border rounded', stat.color, stat.bg)}>
          {stat.label}
        </span>
      </div>

      {/* Champs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Qté restante OF', of.qte_restante.toLocaleString('fr-FR'), false] as const,
          ['Date début', of.date_debut ? _formatDate(of.date_debut) : '—', false] as const,
          ['Date fin prévue', of.date_fin ? _formatDate(of.date_fin) : '—', false] as const,
          ['Article', of.article, false] as const,
        ].map(([label, value, isBad]) => (
          <div key={String(label)} className="bg-muted/40 rounded p-3">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">{label}</p>
            <p className={cn('text-[12px] font-semibold font-mono', isBad ? 'text-red-500' : 'text-foreground')}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Composants tab ── */
function ComposantsTab({ data }: { data: StatusDetailResponse }) {
  if (data.composants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-30">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <span className="text-[11px]">Aucun composant bloquant</span>
      </div>
    )
  }

  const totalManque = data.composants.reduce((s, c) => s + c.qte_manquante, 0)

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          {data.composants.length} composant{data.composants.length > 1 ? 's' : ''} en rupture
        </span>
        <span className="text-[11px] font-bold font-mono text-red-500">
          -{totalManque.toLocaleString('fr-FR')}
        </span>
      </div>

      <div className="space-y-2">
        {data.composants.map((comp) => {
          const stock = data.stock_composants[comp.article]
          return (
            <div key={comp.article} className="bg-muted/30 rounded p-3 border border-border/60">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold font-mono">{comp.article}</p>
                  {comp.designation && (
                    <p className="text-[10px] text-muted-foreground truncate">{comp.designation}</p>
                  )}
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-[13px] font-bold text-red-500 tabular-nums">
                    -{comp.qte_manquante.toLocaleString('fr-FR')}
                  </p>
                  <p className="text-[9px] text-muted-foreground">manque</p>
                </div>
              </div>
              {stock && (
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Dispo</p>
                    <p className="font-semibold tabular-nums">{stock.disponible_total.toLocaleString('fr-FR')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sous CQ</p>
                    <p className="font-semibold tabular-nums text-amber-600">{stock.stock_sous_cq.toLocaleString('fr-FR')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Proch. arrivée</p>
                    <p className="font-semibold tabular-nums text-muted-foreground/80">
                      {stock.prochain_arrive
                        ? `${stock.prochain_arrive}${stock.qte_arrive > 0 ? ` (×${stock.qte_arrive.toLocaleString('fr-FR')})` : ''}`
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Stock tab ── */
function StockTab({ data }: { data: StatusDetailResponse }) {
  const s = data.stock_detail
  const maxVal = Math.max(s.stock_physique, s.stock_sous_cq, s.stock_alloue, s.disponible_total, 1)

  const rows: { label: string; value: number; color: string; sublabel?: string }[] = [
    { label: 'Stock physique', value: s.stock_physique, color: 'bg-blue-500', sublabel: 'Disponible immédiatement' },
    { label: 'Sous contrôle qualité', value: s.stock_sous_cq, color: 'bg-amber-500', sublabel: 'En attente de libération CQ' },
    { label: 'Alloué à la commande', value: s.stock_alloue, color: 'bg-violet-500', sublabel: 'Réservé pour cette commande' },
    { label: 'Dispo totale', value: s.disponible_total, color: 'bg-emerald-500', sublabel: 'Total pouvant être alloué' },
  ]

  return (
    <div className="p-5 space-y-4">
      {/* Barre visuelle */}
      <div className="flex h-8 rounded overflow-hidden border border-border/60">
        {rows.filter(r => r.value > 0).map((r) => (
          <div
            key={r.label}
            className={cn('flex items-center justify-center text-[10px] font-semibold text-white transition-all', r.color)}
            style={{ width: `${Math.max((r.value / maxVal) * 100, r.value > 0 ? 4 : 0)}%` }}
            title={`${r.label}: ${r.value.toLocaleString('fr-FR')}`}
          >
            {r.value > 0 && <span className="truncate px-1">{r.value.toLocaleString('fr-FR')}</span>}
          </div>
        ))}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm', r.color)} />
            <span className="text-[10px] text-muted-foreground">{r.label}</span>
            <span className="text-[10px] font-bold font-mono">{r.value.toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>

      {/* Détail */}
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="bg-muted/30 rounded p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={cn('w-2 h-2 rounded-sm', r.color)} />
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{r.label}</p>
            </div>
            <p className="text-[15px] font-bold font-mono">{r.value.toLocaleString('fr-FR')}</p>
            {r.sublabel && <p className="text-[9px] text-muted-foreground mt-0.5">{r.sublabel}</p>}
          </div>
        ))}
      </div>

      {/* Prochaine réception */}
      {s.prochain_arrive && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded p-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0">
            <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8 1 3 1 8 20 8"/>
          </svg>
          <div>
            <p className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold">Prochaine arrivée fournisseur</p>
            <p className="text-[11px] font-semibold text-amber-800">
              {s.qte_arrive > 0 ? `×${s.qte_arrive.toLocaleString('fr-FR')} units` : ''} attendue le {s.prochain_arrive}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function _formatDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}
