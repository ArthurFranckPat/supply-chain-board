import { memo, useMemo } from 'react'

import { Jauge, Sparkline } from '@r/components/ui/chart'
import { SERIE, fmtEuro, fmtEuroCompact, fmtHeures } from '@r/lib/charts/theme'
import { cn } from '@r/lib/utils'

// Type local (évite import circulaire depuis dashboard.tsx)
export type StockPoint = { periode: string; label: string; valeur: number; qte: number }

const periodDated = (p: StockPoint) =>
  p.periode.includes('-W') ? `S${p.periode.slice(-2)} ${p.periode.slice(0, 4)}` : p.label

// ── Sparkline Valorisation : colonnes vertes, dernière pleine
export const StockSparklineChart = memo(function StockSparklineChart({
  series,
}: {
  series: StockPoint[]
}) {
  const points = useMemo(
    () => series.map((pt) => ({ cle: pt.periode, label: periodDated(pt), valeur: pt.valeur })),
    [series]
  )

  if (series.length === 0) return null

  return (
    <div className="mt-4">
      <Sparkline
        points={points}
        format={fmtEuroCompact}
        ariaLabel="Valorisation du stock — évolution par période"
      />
      <div className="mt-1 flex justify-between text-[10px] font-normal tabular-nums text-muted-foreground">
        <span>{series[0] ? periodDated(series[0]) : null}</span>
        <span>{series[series.length - 1] ? periodDated(series[series.length - 1]) : null}</span>
      </div>
    </div>
  )
})

type ChargeRow = { code: string; label: string; heures: number }
type ProfRow = { id: string; label: string; nbLignes: number; heures: number }
type CatRow = { categorie: string; valeur: number; part: number }

export const ChargeBars = memo(function ChargeBars({
  postes,
  onSelectPoste,
  selectedPoste = null,
}: {
  postes: ChargeRow[]
  onSelectPoste?: (code: string) => void
  selectedPoste?: string | null
}) {
  const max = useMemo(() => Math.max(1, ...postes.map((p) => p.heures)), [postes])
  if (postes.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {postes.map((p) => {
        const selected = selectedPoste === p.code
        const rowLabel = `${p.code}${p.label ? ` · ${p.label}` : ''}`
        const inner = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className="min-w-0 truncate text-xs font-medium text-foreground"
                title={p.label || p.code}
              >
                {rowLabel}
              </span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {fmtHeures(p.heures)}
              </span>
            </div>
            {/* `max` est partagé par toutes les rangées : c'est lui qui rend le
                classement lisible d'un coup d'œil, et non la largeur du rendu. */}
            <Jauge
              valeur={p.heures}
              max={max}
              couleur={SERIE.encre}
              epaisseur={4}
              ariaLabel={`Charge en retard du poste ${rowLabel}`}
              ariaDescription={`${fmtHeures(p.heures)} sur ${fmtHeures(max)}`}
            />
          </>
        )
        if (!onSelectPoste) {
          return <div key={p.code}>{inner}</div>
        }
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onSelectPoste(p.code)}
            className={cn(
              'w-full min-h-9 rounded-lg px-1.5 py-1.5 text-left transition-colors',
              'hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
              selected && 'bg-foreground/[0.04] ring-1 ring-foreground/10'
            )}
            aria-pressed={selected}
            aria-label={`Voir les lignes en retard du poste ${p.code}`}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
})

export const ProfondeurBars = memo(function ProfondeurBars({ buckets }: { buckets: ProfRow[] }) {
  const visible = useMemo(() => buckets.filter((b) => b.nbLignes > 0 || b.heures > 0), [buckets])
  const max = useMemo(() => Math.max(1, ...visible.map((b) => b.heures)), [visible])
  if (visible.length === 0) return null
  // Sévérité ordinale : la profondeur est le seul KPI du dashboard où les
  // lignes ne sont pas du même statut. ≤ 7 j = alerte douce (mêmes seuils
  // que la colonne J+ des lignes en retard) ; au-delà = danger.
  const couleur = (id: string) => (id === '1-7' ? SERIE.suggere : SERIE.alerte)
  return (
    <div className="flex flex-col gap-2">
      {visible.map((b) => (
        <div key={b.id}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {b.label}
              <span className="ml-1.5 font-normal text-muted-foreground">
                · {b.nbLignes} ligne{b.nbLignes > 1 ? 's' : ''}
              </span>
            </span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {fmtHeures(b.heures)}
            </span>
          </div>
          <Jauge
            valeur={b.heures}
            max={max}
            couleur={couleur(b.id)}
            epaisseur={4}
            ariaLabel={`Profondeur de retard — ${b.label}`}
            ariaDescription={`${fmtHeures(b.heures)} sur ${fmtHeures(max)}, ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`}
          />
        </div>
      ))}
    </div>
  )
})

export const CategoriesBars = memo(function CategoriesBars({
  categories,
}: {
  categories: CatRow[]
}) {
  const max = useMemo(() => Math.max(1, ...categories.map((c) => c.valeur)), [categories])
  if (categories.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {categories.map((c) => (
        <div key={c.categorie}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {c.categorie}
            </span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
              {fmtEuro(c.valeur)}
              <span className="ml-1 text-[10px] text-muted-foreground">{c.part}%</span>
            </span>
          </div>
          <Jauge
            valeur={c.valeur}
            max={max}
            couleur={SERIE.encre}
            epaisseur={4}
            ariaLabel={`Valorisation de la catégorie ${c.categorie}`}
            ariaDescription={`${fmtEuro(c.valeur)}, ${c.part} % du stock`}
          />
        </div>
      ))}
    </div>
  )
})
