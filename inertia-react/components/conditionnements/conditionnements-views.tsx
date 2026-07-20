import type { ReactNode } from 'react'
import { cn } from '@r/lib/utils'
import type {
  ArticleEnrichissement,
  ConditionnementDisplayRow,
  EstimationSourceDisplay,
} from '@/lib/conditionnements/types'
import { DynamicIcon } from '../ui/dynamic-icon'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & Constants
// ─────────────────────────────────────────────────────────────────────────────

const TH =
  'px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
const TD = 'px-4 py-[11px] align-middle border-r border-rule-soft'

/** Valeur distincte d'une facette avec son compte. */
export interface Facette {
  cle: string
  label: string
  count: number
}

/** Labels des états de conditionnement (pour facette). */
export const ETAT_LABELS: Record<string, string> = {
  complet: 'Complet',
  manquant_0: 'US/UC manquant',
  manquant_1: 'UC/pal manquant',
  manquant_les_deux: 'Les deux manquants',
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell Components
// ─────────────────────────────────────────────────────────────────────────────

/** Cellule de coef : valeur si présente, « ? » rouge si manquant. */
export function CoefCell({ value }: { value: number | null }) {
  if (!value || value <= 0) {
    return <span className="font-mono text-[13px] font-bold text-destructive">?</span>
  }
  return (
    <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">
      {value}
    </span>
  )
}

/** Cellule d'une source d'estimation. */
export function SourceCell({
  src,
  tone,
  label,
}: {
  src: EstimationSourceDisplay | null
  tone: 'ferme' | 'planifie'
  label: string
}) {
  if (!src) {
    return <span className="font-sans text-[11px] italic text-muted-foreground/40">—</span>
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${label} — ${src.observations} observation(s) — confiance ${src.confiance}`}
    >
      <span
        className={cn(
          'font-fraunces text-[14px] font-bold tabular-nums',
          tone === 'ferme' ? 'text-ferme' : 'text-planifie'
        )}
      >
        {src.usParPalette}
      </span>
      <span className="font-mono text-[9px] text-muted-foreground">US/pal</span>
      {src.confiance === 'faible' && (
        <span className="text-suggere" title="Confiance faible (< 3 observations)">
          ⚠
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge Components
// ─────────────────────────────────────────────────────────────────────────────

/** Badge de concordance entre les 3 sources (UC/pal, STOCK, STOJOU). */
export function ConcordanceBadge({
  concordance,
}: {
  concordance: { niveau: 0 | 1 | 2 | 3; nbSources: number; nbConcordantes: number }
}) {
  // Pas de source → gris. 1 source isolée → ambre. 2 concordantes → bleu. 3 → vert.
  const badgeClass = (() => {
    if (concordance.nbSources === 0) return 'bg-muted text-muted-foreground'
    if (concordance.niveau >= 3) return 'bg-ferme/15 text-ferme'
    if (concordance.niveau >= 2) return 'bg-planifie/15 text-planifie'
    if (concordance.niveau === 1) return 'bg-suggere/15 text-suggere'
    return 'bg-destructive/15 text-destructive'
  })()

  const label = (() => {
    if (concordance.nbSources === 0) return '—'
    // Affiche nbConcordantes/nbSources (ex : "3/3", "2/3", "1/2").
    return `${concordance.nbConcordantes}/${(concordance.nbSources * (concordance.nbSources - 1)) / 2}`
  })()

  const points = '●'.repeat(concordance.niveau) + '○'.repeat(Math.max(0, 3 - concordance.niveau))

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
        badgeClass
      )}
      title={`${concordance.nbConcordantes} paire(s) concordante(s) sur ${concordance.nbSources} source(s) disponible(s)`}
    >
      {points}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filtre à facettes : un bouton qui ouvre un panneau de cases à cocher.
 */
export function FacetteDropdown({
  label,
  facettes,
  selection,
  open,
  onToggleOpen,
  onToggle,
  onClear,
}: {
  label: string
  facettes: Facette[]
  selection: Set<string>
  open: boolean
  onToggleOpen: () => void
  onToggle: (cle: string) => void
  onClear: () => void
}) {
  const nbSelectionnees = selection.size

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
          nbSelectionnees > 0
            ? 'border-brand/40 bg-brand/10 text-brand'
            : 'border-rule bg-card text-muted-foreground hover:text-foreground'
        )}
      >
        {label}
        {nbSelectionnees > 0 && (
          <span className="rounded bg-brand/20 px-1 text-[9px] tabular-nums">
            {nbSelectionnees}
          </span>
        )}
        <DynamicIcon name={open ? 'expand_less' : 'expand_more'} size={12} strokeWidth={1.75} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={onToggleOpen}
          />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-[320px] w-[240px] overflow-auto rounded-md border border-rule bg-card shadow-lg">
            <div className="sticky top-0 flex items-center justify-between border-b border-rule-soft bg-card px-2 py-1">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {label} ({facettes.length})
              </span>
              {nbSelectionnees > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="font-mono text-[9px] font-bold uppercase tracking-wider text-brand hover:underline"
                >
                  Effacer
                </button>
              )}
            </div>
            {facettes.map((f) => (
              <label
                key={f.cle}
                className="flex cursor-pointer items-center gap-2 border-b border-rule-soft px-2 py-1.5 last:border-b-0 hover:bg-secondary/40"
              >
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={selection.has(f.cle)}
                  onChange={() => onToggle(f.cle)}
                />
                <span className="flex-1 truncate text-[11px] text-foreground">{f.label}</span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {f.count}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Helper
// ─────────────────────────────────────────────────────────────────────────────

/** Ligne de base + enrichissement fusionné (pour l'affichage). */
export type DisplayRow = ConditionnementDisplayRow & ArticleEnrichissement

/** Classe de ligne selon l'état du conditionnement. */
export function rowClass(r: { etatCoef: string; stock: unknown; stojou: unknown }): string {
  if (r.etatCoef === 'complet') return ''
  const estime = r.stock || r.stojou
  if (!estime) {
    return 'bg-destructive/[0.03] [box-shadow:inset_3px_0_var(--color-destructive)]'
  }
  return 'bg-planifie/[0.03] [box-shadow:inset_3px_0_var(--color-planifie)]'
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConditionnementsTableProps {
  rows: DisplayRow[]
  estimationsChargees: boolean
  emptyState?: ReactNode
}

/** Formatteur ISO (YYYY-MM-DD) → JJ/MM/AA. */
const fmtFr = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]!.slice(2)}`
}

export function ConditionnementsTable({
  rows,
  estimationsChargees,
  emptyState,
}: ConditionnementsTableProps) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className={TH}>Article</th>
            <th className={TH}>Désignation</th>
            <th className={TH}>Fournisseur</th>
            <th className={cn(TH, 'text-right')}>US/UC</th>
            <th className={cn(TH, 'text-right')}>UC/pal</th>
            {estimationsChargees && (
              <>
                <th className={TH}>Dernière entrée</th>
                <th className={TH}>Dernière sortie</th>
              </>
            )}
            <th className={cn(TH, 'text-right')}>STOCK</th>
            <th className={cn(TH, 'text-right')}>STOJOU</th>
            {estimationsChargees && <th className={cn(TH, 'text-center')}>Concordance</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.article}
              className={cn(
                'border-t border-rule-soft hover:bg-foreground/[0.04]',
                rowClass(r)
              )}
            >
              <td className={TD}>
                <div className="font-mono text-[13px] font-bold tracking-tight text-foreground">
                  {r.article}
                </div>
                {r.categorie && (
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    {r.categorie}
                  </span>
                )}
              </td>
              <td className={TD}>
                <span className="truncate text-[12px] text-secondary-foreground">
                  {r.designation || '—'}
                </span>
              </td>
              <td className={TD}>
                {!r.nomFrnsr ? (
                  <span className="text-[11px] italic text-muted-foreground/40">—</span>
                ) : (
                  <>
                    <div className="truncate text-[12px] text-foreground">{r.nomFrnsr}</div>
                    {r.codeFrnsr && (
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {r.codeFrnsr}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className={cn(TD, 'text-right')}>
                <CoefCell value={r.pcuStuCoe} />
              </td>
              <td className={cn(TD, 'text-right')}>
                <CoefCell value={r.ucParPal} />
              </td>
              {estimationsChargees && (
                <>
                  <td className={TD}>
                    {!r.derniereEntree ? (
                      <span className="text-[11px] italic text-muted-foreground/40">—</span>
                    ) : (
                      <>
                        <div className="font-mono text-[11px] tabular-nums text-foreground">
                          {fmtFr(r.derniereEntree)}
                        </div>
                        {r.typeEntree && (
                          <span className="font-mono text-[9px] text-muted-foreground">
                            {r.typeEntree}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className={TD}>
                    {!r.derniereSortie ? (
                      <span className="text-[11px] italic text-muted-foreground/40">—</span>
                    ) : (
                      <>
                        <div className="font-mono text-[11px] tabular-nums text-foreground">
                          {fmtFr(r.derniereSortie)}
                        </div>
                        {r.typeSortie && (
                          <span className="font-mono text-[9px] text-muted-foreground">
                            {r.typeSortie}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </>
              )}
              <td className={cn(TD, 'text-right')}>
                {!estimationsChargees ? (
                  <span className="text-[11px] italic text-muted-foreground/40">…</span>
                ) : (
                  <SourceCell src={r.stock} tone="ferme" label="STOCK" />
                )}
              </td>
              <td className={cn(TD, 'text-right')}>
                {!estimationsChargees ? (
                  <span className="text-[11px] italic text-muted-foreground/40">…</span>
                ) : (
                  <SourceCell src={r.stojou} tone="planifie" label="STOJOU" />
                )}
              </td>
              {estimationsChargees && (
                <td className={cn(TD, 'text-center')}>
                  <ConcordanceBadge concordance={r.concordance} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
