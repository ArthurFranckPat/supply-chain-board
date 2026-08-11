import { memo, useMemo } from 'react'

import { BarresClassement, Sparkline, type LigneClassement } from '@r/components/ui/chart'
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

/**
 * Charge en retard par poste — la forme « BarresClassement » de la vitrine,
 * avec la sélection contrôlée du filtre croisé (clic sur un poste → lignes ;
 * re-clic ou clic à côté → tout).
 */
export const ChargeBars = memo(function ChargeBars({
  postes,
  onSelectPoste,
  onClear,
  selectedPoste = null,
}: {
  postes: ChargeRow[]
  onSelectPoste?: (code: string) => void
  /** Efface le filtre croisé (re-clic sur le poste sélectionné ou clic à côté). */
  onClear?: () => void
  selectedPoste?: string | null
}) {
  const lignes: LigneClassement[] = useMemo(
    () =>
      postes.map((p) => ({
        cle: p.code,
        label: p.label ? `${p.code} · ${p.label}` : p.code,
        valeur: p.heures,
      })),
    [postes]
  )
  if (lignes.length === 0) return null

  const handleSelection = (cle: string | null) => {
    if (cle === null || cle === selectedPoste) {
      onClear?.()
    } else {
      onSelectPoste?.(cle)
    }
  }

  return (
    <BarresClassement
      lignes={lignes}
      format={fmtHeures}
      couleur={SERIE.encre}
      selection={selectedPoste}
      onSelection={handleSelection}
      ariaLabel="Charge en retard par poste de charge"
    />
  )
})

type ProfRow = { id: string; label: string; nbLignes: number; heures: number }

/**
 * Profondeur de retard — classement par ancienneté, sévérité en couleur
 * (≤ 7 j = alerte douce, au-delà = danger ; mêmes seuils que la colonne J+
 * des lignes en retard).
 */
export const ProfondeurBars = memo(function ProfondeurBars({ buckets }: { buckets: ProfRow[] }) {
  const visible = useMemo(() => buckets.filter((b) => b.nbLignes > 0 || b.heures > 0), [buckets])
  const lignes: LigneClassement[] = useMemo(
    () =>
      visible.map((b) => ({
        cle: b.id,
        label: `${b.label} · ${b.nbLignes} ligne${b.nbLignes > 1 ? 's' : ''}`,
        valeur: b.heures,
        couleur: b.id === '1-7' ? SERIE.suggere : SERIE.alerte,
      })),
    [visible]
  )
  if (lignes.length === 0) return null

  return (
    <BarresClassement
      lignes={lignes}
      format={fmtHeures}
      hauteurLigne={24}
      ariaLabel="Profondeur de retard — répartition par ancienneté"
    />
  )
})

type CatRow = { categorie: string; valeur: number; part: number }

/** Top catégories de stock — la forme « BarresClassement » de la vitrine. */
export const CategoriesBars = memo(function CategoriesBars({
  categories,
}: {
  categories: CatRow[]
}) {
  const lignes: LigneClassement[] = useMemo(
    () =>
      categories.map((c) => ({
        cle: c.categorie,
        label: `${c.categorie} · ${c.part} %`,
        valeur: c.valeur,
      })),
    [categories]
  )
  if (lignes.length === 0) return null

  return (
    <BarresClassement
      lignes={lignes}
      format={fmtEuro}
      hauteurLigne={24}
      ariaLabel="Valorisation du stock par catégorie"
    />
  )
})
