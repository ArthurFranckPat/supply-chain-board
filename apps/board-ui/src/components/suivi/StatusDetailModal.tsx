import { useState, useEffect, useRef } from 'react'
import { suiviClient, type StatusDetailResponse } from '@/api/suivi-client'

interface StatusDetailModalProps {
  noCommande: string
  article: string
  onClose: () => void
}

type Tab = 'of' | 'composants' | 'stock'

export function StatusDetailModal({ noCommande, article, onClose }: StatusDetailModalProps) {
  const [data, setData] = useState<StatusDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('of')
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-card border border-border shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-muted-foreground truncate">{noCommande}</p>
            <p className="text-[12px] font-semibold font-mono truncate">{article}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 text-[16px] text-muted-foreground hover:text-foreground leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['of', 'composants', 'stock'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 h-8 text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'of' ? 'OF' : tab === 'composants' ? 'Composants' : 'Stock'}
              {tab === 'composants' && data && data.composants.length > 0 && (
                <span className="ml-1 text-[10px] text-red-500">({data.composants.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-[11px] text-muted-foreground text-center py-4">Chargement…</p>}
          {error && <p className="text-[11px] text-red-500 text-center py-4">{error}</p>}
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
      <div className="text-[11px] text-muted-foreground text-center py-4">
        Aucun OF planifié pour cette ligne.
      </div>
    )
  }
  const of = data.of_info
  const statutColor = of.statut_num === 1 ? 'text-emerald-600' : of.statut_num === 2 ? 'text-sky-600' : 'text-amber-600'

  const rows: [string, string][] = [
    ['N° OF', of.num_of],
    ['Article', of.article],
    ['Statut', of.statut_texte],
    ['Qté restante', of.qte_restante.toLocaleString('fr-FR')],
    ['Date début', of.date_debut ? formatDate(of.date_debut) : '—'],
    ['Date fin', of.date_fin ? formatDate(of.date_fin) : '—'],
  ]

  return (
    <table className="w-full text-[11px]">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-border/40 last:border-0">
            <td className="py-1.5 pr-3 text-muted-foreground w-[100px] shrink-0">{label}</td>
            <td className={`py-1.5 font-medium ${label === 'Statut' ? statutColor : ''}`}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Composants tab ── */
function ComposantsTab({ data }: { data: StatusDetailResponse }) {
  if (data.composants.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-4">
        Aucun composant bloquant.
      </div>
    )
  }
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-1 text-muted-foreground font-semibold">Article</th>
          <th className="text-right py-1 text-muted-foreground font-semibold">Manque</th>
          <th className="text-right py-1 text-muted-foreground font-semibold">Dispo</th>
          <th className="text-right py-1 text-muted-foreground font-semibold">Proch. arrivée</th>
        </tr>
      </thead>
      <tbody>
        {data.composants.map((comp) => {
          const stock = data.stock_composants[comp.article]
          return (
            <tr key={comp.article} className="border-b border-border/40 last:border-0">
              <td className="py-1.5">
                <span className="font-mono font-medium">{comp.article}</span>
                <span className="ml-1 text-muted-foreground truncate">{comp.designation}</span>
              </td>
              <td className="py-1.5 text-right text-red-500 font-semibold tabular-nums">
                {comp.qte_manquante.toLocaleString('fr-FR')}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {stock ? stock.disponible_total.toLocaleString('fr-FR') : '—'}
              </td>
              <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                {stock?.prochain_arrive
                  ? `${stock.prochain_arrive} (${stock.qte_arrive > 0 ? '×' + stock.qte_arrive.toLocaleString('fr-FR') : '?'})`
                  : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ── Stock tab ── */
function StockTab({ data }: { data: StatusDetailResponse }) {
  const s = data.stock_detail
  const rows: [string, string | number][] = [
    ['Physique disponible', s.disponible_strict],
    ['Sous contrôle qualité', s.stock_sous_cq],
    ['Alloué', s.stock_alloue],
    ['Dispo totale', s.disponible_total],
    ['Proch. arrivée', s.prochain_arrive || '—'],
  ]
  return (
    <table className="w-full text-[11px]">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={String(label)} className="border-b border-border/40 last:border-0">
            <td className="py-1.5 pr-3 text-muted-foreground w-[160px]">{label}</td>
            <td className="py-1.5 font-medium tabular-nums text-right">
              {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}
