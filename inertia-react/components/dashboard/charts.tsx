import { memo, useMemo } from 'react'

import { Jauge, Sparkline } from '@r/components/ui/chart'
import { SERIE, fmtEuro, fmtEuroCompact, fmtHeures } from '@r/lib/charts/theme'

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

/** Rangée de la vitrine : libellé + valeur, puis Jauge au domaine partagé. */
function Rangée({
  label,
  valeur,
  libellé,
  max,
  couleur,
  ariaLabel,
  ariaDescription,
}: {
  label: string
  /** Valeur numérique de la jauge. */
  valeur: number
  /** Libellé de valeur affiché à droite (déjà formaté). */
  libellé: string
  /** Borne haute de la jauge — partagée par toutes les rangées de la liste. */
  max: number
  /** Couleur forcée (facultative) — absente : palier par défaut de la Jauge. */
  couleur?: string
  ariaLabel: string
  ariaDescription: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] text-foreground" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{libellé}</span>
      </div>
      <Jauge
        valeur={valeur}
        max={max}
        couleur={couleur}
        ariaLabel={ariaLabel}
        ariaDescription={ariaDescription}
      />
    </div>
  )
}

/**
 * Charge en retard par poste — le motif « Jauge » de la vitrine, branché sur
 * les données du KPI. Couleurs du palier par défaut (comme la démo de la
 * section Graphiques) : la jauge se teinte selon son taux face à la borne.
 */
export const ChargeBars = memo(function ChargeBars({ postes }: { postes: ChargeRow[] }) {
  const max = useMemo(() => Math.max(1, ...postes.map((p) => p.heures)), [postes])
  if (postes.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {postes.map((p) => (
        <Rangée
          key={p.code}
          label={p.label ? `${p.code} · ${p.label}` : p.code}
          valeur={p.heures}
          libellé={fmtHeures(p.heures)}
          max={max}
          ariaLabel={`Charge en retard du poste ${p.code}`}
          ariaDescription={`${fmtHeures(p.heures)} sur ${fmtHeures(max)}`}
        />
      ))}
    </div>
  )
})

type ProfRow = { id: string; label: string; nbLignes: number; heures: number }

/**
 * Profondeur de retard — jauges par ancienneté, sévérité en couleur (≤ 7 j =
 * alerte douce, au-delà = danger ; mêmes seuils que la colonne J+ des lignes).
 */
export const ProfondeurBars = memo(function ProfondeurBars({ buckets }: { buckets: ProfRow[] }) {
  const visible = useMemo(() => buckets.filter((b) => b.nbLignes > 0 || b.heures > 0), [buckets])
  const max = useMemo(() => Math.max(1, ...visible.map((b) => b.heures)), [visible])
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {visible.map((b) => (
        <Rangée
          key={b.id}
          label={`${b.label} · ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`}
          valeur={b.heures}
          libellé={fmtHeures(b.heures)}
          max={max}
          couleur={b.id === '1-7' ? SERIE.suggere : SERIE.alerte}
          ariaLabel={`Profondeur de retard — ${b.label}`}
          ariaDescription={`${fmtHeures(b.heures)} sur ${fmtHeures(max)}, ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`}
        />
      ))}
    </div>
  )
})

type CatRow = { categorie: string; valeur: number; part: number }

/** Top catégories de stock — jauges aux couleurs du palier, comme la démo. */
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
        <Rangée
          key={c.categorie}
          label={c.categorie}
          valeur={c.valeur}
          libellé={`${fmtEuro(c.valeur)} · ${c.part} %`}
          max={max}
          ariaLabel={`Valorisation de la catégorie ${c.categorie}`}
          ariaDescription={`${fmtEuro(c.valeur)}, ${c.part} % du stock`}
        />
      ))}
    </div>
  )
})
