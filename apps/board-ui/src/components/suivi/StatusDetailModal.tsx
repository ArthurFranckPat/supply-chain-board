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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card border border-border shadow-2xl rounded-lg w-[580px] max-h-[85vh] flex flex-col overflow-hidden">
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
              <span className="ml-2 text-[11px] text-muted-foreground">Chargement…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-12">
              <span className="text-[11px] text-red-500">{error}</span>
            </div>
          )}
          {!loading && !error && data && (
            <>
              <OfSection data={data} />
              <ComposantsSection data={data} />
              <StockSection data={data} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── OF section ── */
function OfSection({ data }: { data: StatusDetailResponse }) {
  return (
    <div className="space-y-2">
      <SectionTitle icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      } label="Ordre de fabrication" />

      {!data.of_info ? (
        <p className="text-[11px] text-muted-foreground italic px-1">Aucun OF planifié ou exécuté</p>
      ) : (
        <div className="space-y-2">
          {data.of_info.poste_charge && (
            <div className="bg-muted/40 rounded px-3 py-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Poste de charge</p>
              <p className="text-[12px] font-semibold font-mono">{data.of_info.poste_charge}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['N° OF', data.of_info.num_of],
              ['Statut', data.of_info.statut_texte, data.of_info.statut_num] as const,
              ['Qté restante', data.of_info.qte_restante > 0 ? data.of_info.qte_restante.toLocaleString('fr-FR') : '0'],
              ['Date fin', data.of_info.date_fin ? _formatDate(data.of_info.date_fin) : '—'],
            ].map(([label, value, extra]) => (
              <div key={String(label)} className="bg-muted/40 rounded px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">{label}</p>
                <p className={cn(
                  'text-[12px] font-semibold font-mono truncate',
                  extra === 1 ? 'text-emerald-600' : extra === 2 ? 'text-sky-600' : extra === 3 ? 'text-amber-600' : 'text-foreground'
                )}>
                  {String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Composants section ── */
function ComposantsSection({ data }: { data: StatusDetailResponse }) {
  if (data.composants.length === 0) {
    return (
      <div className="space-y-2">
        <SectionTitle icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        } label="Composants bloquants" badge={0} />
        <p className="text-[11px] text-emerald-600 italic px-1">✓ Aucun composant bloquant</p>
      </div>
    )
  }

  const totalManque = data.composants.reduce((s, c) => s + c.qte_manquante, 0)

  return (
    <div className="space-y-2">
      <SectionTitle icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      } label="Composants bloquants" badge={data.composants.length} />

      <div className="bg-red-50 border border-red-200 rounded px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-red-700 font-semibold">
          {data.composants.length} article{data.composants.length > 1 ? 's' : ''} en rupture
        </span>
        <span className="text-[11px] font-bold font-mono text-red-600">−{totalManque.toLocaleString('fr-FR')}</span>
      </div>

      <div className="space-y-1.5">
        {data.composants.map((comp) => {
          const stock = data.stock_composants[comp.article]
          return (
            <div key={comp.article} className="flex items-center gap-3 bg-muted/30 rounded px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold font-mono">{comp.article}</p>
                {comp.designation && (
                  <p className="text-[10px] text-muted-foreground truncate">{comp.designation}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] font-bold font-mono text-red-500">−{comp.qte_manquante.toLocaleString('fr-FR')}</p>
                <p className="text-[9px] text-muted-foreground">
                  dispo {stock ? stock.disponible_total.toLocaleString('fr-FR') : '—'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
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
    { label: 'Dispo', value: s.disponible_total, color: 'bg-emerald-500' },
  ]

  return (
    <div className="space-y-2">
      <SectionTitle icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      } label="Stock article" />

      {/* Barre visuelle */}
      <div className="flex h-7 rounded overflow-hidden border border-border/60">
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

      {/* Légende compacte */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-sm', r.color)} />
            <span className="text-[10px] text-muted-foreground">{r.label}</span>
            <span className="text-[10px] font-bold font-mono">{r.value.toLocaleString('fr-FR')}</span>
          </div>
        ))}
      </div>

      {/* Prochaine arrivée */}
      {s.prochain_arrive && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0">
            <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8 1 3 1 8 20 8"/>
          </svg>
          <p className="text-[10px] text-amber-800">
            {s.qte_arrive > 0 ? `×${s.qte_arrive.toLocaleString('fr-FR')} unités` : ''} attendue le {s.prochain_arrive}
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Section title ── */
function SectionTitle({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-mono bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
          {badge}
        </span>
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
