import { type ReactNode, useMemo, useState } from 'react'
import { Badge } from '@r/components/ui/badge'
import { Card } from '@r/components/ui/card'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  CellDate,
  CellNumber,
  CellStack,
  rowToneClass,
  type RowTone,
} from '@r/components/ui/table-row'
import type {
  ArticleEnrichissement,
  ConditionnementDisplayRow,
  EstimationSourceDisplay,
} from '@r/lib/conditionnements/types'

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

const ETAT_BADGE: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  complet: { label: 'Complet', variant: 'success' },
  manquant_0: { label: 'US/UC', variant: 'warning' },
  manquant_1: { label: 'UC/pal', variant: 'warning' },
  manquant_les_deux: { label: 'Les deux', variant: 'destructive' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell Components
// ─────────────────────────────────────────────────────────────────────────────

/** Cellule de coef : valeur si présente, « ? » si manquant. */
export function CoefCell({ value }: { value: number | null }) {
  if (!value || value <= 0) {
    return <CellNumber tone="critical" value="?" title="Coefficient manquant" />
  }
  return <CellNumber value={value} />
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
    return <Vide />
  }
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`${label} — ${src.observations} observation(s) — confiance ${src.confiance}`}
    >
      <CellNumber value={src.usParPalette} tone={tone === 'ferme' ? 'ok' : 'info'} />
      <span className="font-mono text-3xs text-muted-foreground">US/pal</span>
      {src.confiance === 'faible' && (
        <span className="text-suggere" title="Confiance faible (< 3 observations)">
          ⚠
        </span>
      )}
    </span>
  )
}

/** Badge de concordance entre les 3 sources (UC/pal, STOCK, STOJOU). */
export function ConcordanceBadge({
  concordance,
}: {
  concordance: { niveau: 0 | 1 | 2 | 3; nbSources: number; nbConcordantes: number }
}) {
  const variant = ((): 'outline' | 'success' | 'default' | 'warning' | 'destructive' => {
    if (concordance.nbSources === 0) return 'outline'
    if (concordance.niveau >= 3) return 'success'
    if (concordance.niveau >= 2) return 'default'
    if (concordance.niveau === 1) return 'warning'
    return 'destructive'
  })()

  const points = '●'.repeat(concordance.niveau) + '○'.repeat(Math.max(0, 3 - concordance.niveau))

  return (
    <Badge
      variant={variant}
      title={`${concordance.nbConcordantes} paire(s) concordante(s) sur ${concordance.nbSources} source(s) disponible(s)`}
    >
      {points}
    </Badge>
  )
}

function EtatBadge({ etat }: { etat: string }) {
  const spec = ETAT_BADGE[etat]
  if (!spec || etat === 'complet') return null
  return <Badge variant={spec.variant}>{spec.label}</Badge>
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Helper
// ─────────────────────────────────────────────────────────────────────────────

/** Ligne de base + enrichissement fusionné (pour l'affichage). */
export type DisplayRow = ConditionnementDisplayRow & ArticleEnrichissement

/**
 * Gravité d'une ligne selon l'état du conditionnement. Rendue en barre de bord
 * (standard TableRow), plus en fond de ligne : un coefficient estimé et un
 * coefficient absent se distinguaient par deux teintes de fond à 5 et 6 %
 * d'opacité — un écart que le survol effaçait.
 */
export function rowTone(r: { etatCoef: string; stock: unknown; stojou: unknown }): RowTone {
  if (r.etatCoef === 'complet') return null
  return r.stock || r.stojou ? 'info' : 'critical'
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConditionnementsTableProps {
  rows: DisplayRow[]
  estimationsChargees: boolean
  emptyState?: ReactNode
}

/** Formatteur ISO (YYYY-MM-DD) → jj/mm/aaaa. */
const fmtFr = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Placeholder « — » (valeur absente) ou « … » (enrichissement non chargé). */
function Vide({ variant = 'absent' }: { variant?: 'absent' | 'attente' }) {
  return <span className="text-xs text-muted-foreground">{variant === 'attente' ? '…' : '—'}</span>
}

/**
 * Colonnes de la table conditionnements, au format DataTable partagé. Les
 * colonnes d'enrichissement (dates, concordance) n'apparaissent qu'une fois les
 * estimations chargées — d'où le paramètre `estimationsChargees`.
 *
 * `accessorFn` sert au tri (valeur triable, nulls poussés en fin), `cell` au
 * rendu. Cellules canoniques : CellStack / CellNumber / CellDate / Badge.
 */
function buildColumns(estimationsChargees: boolean): ColumnDef<DisplayRow>[] {
  const cols: ColumnDef<DisplayRow>[] = [
    {
      id: 'article',
      header: 'Article',
      accessorFn: (r) => r.article,
      meta: { thClass: 'text-left', tdClass: 'align-top' },
      cell: ({ row: { original: r } }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <CellStack
            code={r.article}
            label={r.designation || '—'}
            labelTitle={r.designation || undefined}
            action={<EtatBadge etat={r.etatCoef} />}
          />
          {r.categorie ? (
            <span className="font-mono text-3xs uppercase text-muted-foreground">
              {r.categorie}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'designation',
      header: 'Désignation',
      accessorFn: (r) => r.designation ?? '',
      meta: {},
      cell: ({ row: { original: r } }) => (
        <span className="text-2xs text-muted-foreground">{r.designation || '—'}</span>
      ),
    },
    {
      id: 'fournisseur',
      header: 'Fournisseur',
      accessorFn: (r) => r.nomFrnsr ?? '',
      meta: {},
      cell: ({ row: { original: r } }) =>
        !r.nomFrnsr ? (
          <Vide />
        ) : (
          <CellStack
            code={r.nomFrnsr}
            label={r.codeFrnsr ?? undefined}
            labelTitle={r.codeFrnsr ?? undefined}
          />
        ),
    },
    {
      id: 'pcuStuCoe',
      header: 'US/UC',
      accessorFn: (r) => r.pcuStuCoe ?? -1,
      meta: { thClass: 'text-right!', tdClass: 'text-right' },
      cell: ({ row: { original: r } }) => <CoefCell value={r.pcuStuCoe} />,
    },
    {
      id: 'ucParPal',
      header: 'UC/pal',
      accessorFn: (r) => r.ucParPal ?? -1,
      meta: { thClass: 'text-right!', tdClass: 'text-right' },
      cell: ({ row: { original: r } }) => <CoefCell value={r.ucParPal} />,
    },
  ]

  if (estimationsChargees) {
    cols.push(
      {
        id: 'derniereEntree',
        header: 'Dernière entrée',
        accessorFn: (r) => r.derniereEntree ?? '',
        meta: {},
        cell: ({ row: { original: r } }) =>
          !r.derniereEntree ? (
            <Vide />
          ) : (
            <CellDate date={fmtFr(r.derniereEntree)} relative={r.typeEntree} />
          ),
      },
      {
        id: 'derniereSortie',
        header: 'Dernière sortie',
        accessorFn: (r) => r.derniereSortie ?? '',
        meta: {},
        cell: ({ row: { original: r } }) =>
          !r.derniereSortie ? (
            <Vide />
          ) : (
            <CellDate date={fmtFr(r.derniereSortie)} relative={r.typeSortie} />
          ),
      }
    )
  }

  cols.push(
    {
      id: 'stock',
      header: 'STOCK',
      accessorFn: (r) => r.stock?.usParPalette ?? -1,
      meta: { thClass: 'text-right!', tdClass: 'text-right' },
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
      meta: { thClass: 'text-right!', tdClass: 'text-right' },
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
      meta: { thClass: 'text-center!', tdClass: 'text-center' },
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

  return (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      <Card padding="none" className="min-h-0 flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          rows={sortedRows}
          sorting={sorting}
          onSortingChange={setSorting}
          getRowKey={(r) => r.article}
          getRowClass={(r) => rowToneClass(rowTone(r))}
          tableClass="min-w-[880px]"
          scrollContainerClass="h-full overflow-auto rounded-none border-0 bg-transparent shadow-none"
          theadRowClass="sticky top-0 z-10 bg-transparent"
          emptyState={emptyState}
        />
      </Card>
    </div>
  )
}
