import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '@r/lib/utils'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import type {
  ArticleEnrichissement,
  ConditionnementDisplayRow,
  EstimationSourceDisplay,
} from '@/lib/conditionnements/types'
import { DynamicIcon } from '../ui/dynamic-icon'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Grammaire compacte reprise de la table Suivi (font-sans 10px, py serré). */
const TH_C = 'px-4 py-[6px] font-sans text-[10px] font-semibold tracking-wider'
const TD_C = 'px-4 py-[5px] align-middle'

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
    return 'bg-destructive/[0.06]'
  }
  return 'bg-planifie/[0.05]'
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

/** Placeholder « — » (valeur absente) ou « … » (enrichissement non chargé). */
function Vide({ variant = 'absent' }: { variant?: 'absent' | 'attente' }) {
  return (
    <span className="text-[11px] italic text-muted-foreground/40">
      {variant === 'attente' ? '…' : '—'}
    </span>
  )
}

/**
 * Colonnes de la table conditionnements, au format DataTable partagé. Les
 * colonnes d'enrichissement (dates, concordance) n'apparaissent qu'une fois les
 * estimations chargées — d'où le paramètre `estimationsChargees`.
 *
 * `accessorFn` sert au tri (valeur triable, nulls poussés en fin), `cell` au
 * rendu. Grammaire compacte reprise de Suivi (TH_C / TD_C).
 */
function buildColumns(estimationsChargees: boolean): ColumnDef<DisplayRow>[] {
  const cols: ColumnDef<DisplayRow>[] = [
    {
      id: 'article',
      header: 'Article',
      accessorFn: (r) => r.article,
      meta: { thClass: TH_C, tdClass: TD_C },
      cell: ({ row: { original: r } }) => (
        <div className="leading-tight">
          <div className="font-mono text-[12px] font-bold tracking-tight text-foreground">
            {r.article}
          </div>
          {r.categorie && (
            <span className="font-mono text-[9px] uppercase text-muted-foreground">
              {r.categorie}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'designation',
      header: 'Désignation',
      accessorFn: (r) => r.designation ?? '',
      meta: { thClass: TH_C, tdClass: TD_C },
      cell: ({ row: { original: r } }) => (
        <span className="text-[12px] text-secondary-foreground">{r.designation || '—'}</span>
      ),
    },
    {
      id: 'fournisseur',
      header: 'Fournisseur',
      accessorFn: (r) => r.nomFrnsr ?? '',
      meta: { thClass: TH_C, tdClass: TD_C },
      cell: ({ row: { original: r } }) =>
        !r.nomFrnsr ? (
          <Vide />
        ) : (
          <div className="leading-tight">
            <div className="truncate text-[12px] text-foreground">{r.nomFrnsr}</div>
            {r.codeFrnsr && (
              <span className="font-mono text-[9px] text-muted-foreground">{r.codeFrnsr}</span>
            )}
          </div>
        ),
    },
    {
      id: 'pcuStuCoe',
      header: 'US/UC',
      accessorFn: (r) => r.pcuStuCoe ?? -1,
      meta: { thClass: cn(TH_C, 'text-right'), tdClass: cn(TD_C, 'text-right') },
      cell: ({ row: { original: r } }) => <CoefCell value={r.pcuStuCoe} />,
    },
    {
      id: 'ucParPal',
      header: 'UC/pal',
      accessorFn: (r) => r.ucParPal ?? -1,
      meta: { thClass: cn(TH_C, 'text-right'), tdClass: cn(TD_C, 'text-right') },
      cell: ({ row: { original: r } }) => <CoefCell value={r.ucParPal} />,
    },
  ]

  if (estimationsChargees) {
    cols.push(
      {
        id: 'derniereEntree',
        header: 'Dernière entrée',
        accessorFn: (r) => r.derniereEntree ?? '',
        meta: { thClass: TH_C, tdClass: TD_C },
        cell: ({ row: { original: r } }) =>
          !r.derniereEntree ? (
            <Vide />
          ) : (
            <div className="leading-tight">
              <div className="font-mono text-[11px] tabular-nums text-foreground">
                {fmtFr(r.derniereEntree)}
              </div>
              {r.typeEntree && (
                <span className="font-mono text-[9px] text-muted-foreground">{r.typeEntree}</span>
              )}
            </div>
          ),
      },
      {
        id: 'derniereSortie',
        header: 'Dernière sortie',
        accessorFn: (r) => r.derniereSortie ?? '',
        meta: { thClass: TH_C, tdClass: TD_C },
        cell: ({ row: { original: r } }) =>
          !r.derniereSortie ? (
            <Vide />
          ) : (
            <div className="leading-tight">
              <div className="font-mono text-[11px] tabular-nums text-foreground">
                {fmtFr(r.derniereSortie)}
              </div>
              {r.typeSortie && (
                <span className="font-mono text-[9px] text-muted-foreground">{r.typeSortie}</span>
              )}
            </div>
          ),
      }
    )
  }

  cols.push(
    {
      id: 'stock',
      header: 'STOCK',
      accessorFn: (r) => r.stock?.usParPalette ?? -1,
      meta: { thClass: cn(TH_C, 'text-right'), tdClass: cn(TD_C, 'text-right') },
      cell: ({ row: { original: r } }) =>
        !estimationsChargees ? (
          <Vide variant="attente" />
        ) : (
          <SourceCell src={r.stock} tone="ferme" label="STOCK" />
        ),
    },
    {
      id: 'stojou',
      header: 'STOJOU',
      accessorFn: (r) => r.stojou?.usParPalette ?? -1,
      meta: { thClass: cn(TH_C, 'text-right'), tdClass: cn(TD_C, 'text-right') },
      cell: ({ row: { original: r } }) =>
        !estimationsChargees ? (
          <Vide variant="attente" />
        ) : (
          <SourceCell src={r.stojou} tone="planifie" label="STOJOU" />
        ),
    }
  )

  if (estimationsChargees) {
    cols.push({
      id: 'concordance',
      header: 'Concordance',
      accessorFn: (r) => r.concordance.niveau,
      meta: { thClass: cn(TH_C, 'text-center'), tdClass: cn(TD_C, 'text-center') },
      cell: ({ row: { original: r } }) => <ConcordanceBadge concordance={r.concordance} />,
    })
  }

  return cols
}

/** Tri d'une copie des lignes selon l'état de tri (une seule colonne, nulls en fin). */
function trier(
  rows: DisplayRow[],
  sorting: SortingState[],
  columns: ColumnDef<DisplayRow>[]
): DisplayRow[] {
  if (sorting.length === 0) return rows
  const s = sorting[0]!
  const col = columns.find((c) => c.id === s.id)
  if (!col?.accessorFn) return rows
  const val = col.accessorFn
  const dir = s.desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = val(a) as string | number
    const vb = val(b) as string | number
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })
}

export function ConditionnementsTable({
  rows,
  estimationsChargees,
  emptyState,
}: ConditionnementsTableProps) {
  const [sorting, setSorting] = useState<SortingState[]>([])
  const columns = useMemo(() => buildColumns(estimationsChargees), [estimationsChargees])
  const sortedRows = useMemo(() => trier(rows, sorting, columns), [rows, sorting, columns])

  // Coquille identique à la table Suivi : gouttière p-5, carte bordée + ombre,
  // header collant sur fond secondaire, lignes zébrées + teinte d'état.
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-5">
      <DataTable
        columns={columns}
        rows={sortedRows}
        sorting={sorting}
        onSortingChange={setSorting}
        getRowKey={(r) => r.article}
        getRowClass={(r) =>
          cn('border-t border-rule-soft transition-colors even:bg-foreground/[0.015]', rowClass(r))
        }
        tableClass="min-w-[880px]"
        scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
        theadRowClass="sticky top-0 z-10 bg-secondary"
        emptyState={emptyState}
      />
    </div>
  )
}
