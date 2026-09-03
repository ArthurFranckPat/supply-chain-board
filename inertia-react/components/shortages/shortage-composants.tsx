/**
 * Vue R2 « Par composant » du suivi des ruptures (port React) : agrégation
 * « quel composant fait le plus de dégâts ? » (nb OFs bloqués, qté totale,
 * commande la plus urgente).
 *
 * L'agrégation (groupByComponent) est une dérivation pure (lib/shortages/
 * shortage-math.ts) ; cette vue se contente du rendu table agrégée.
 *
 * Rendu aligné sur la table du Suivi proactif (components/tracking/proactive-view
 * + lib/suivi/proactive-columns) : même DataTable maison, même carte
 * (border-rule / rounded-lg / shadow-float), même en-tête collant `bg-secondary`,
 * mêmes filets de colonnes, même zébrure, même colonne N° à barre latérale
 * pilotée par la gravité, même grammaire typographique (mono pour les codes et
 * les quantités, sans pour les libellés). Les deux tables doivent se lire comme
 * une seule — toute divergence de style ici est une régression.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import type { ShortageDisplayRow } from '@r/lib/shortages/types'
import { cn } from '@r/lib/utils'
import { LATE_TONE } from '@r/lib/suivi/tracking-shared'
import {
  VERDICT_MARK,
  groupByComponent,
  verdictSeverity,
  type ComponentGroup,
} from '@r/lib/shortages/shortage-math'

// ---------------------------------------------------------------------------
// Grammaire de cellule du Suivi proactif — reprise à l'identique.
// Les largeurs sont écrites en clair au point d'appel (Tailwind ne scanne pas
// les classes construites dynamiquement).
// ---------------------------------------------------------------------------

const TH_BASE =
  'px-4 py-[7px] font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule'
const th = (w: string) => `${w} text-left ${TH_BASE}`
const thR = (w: string) => `${w} text-right ${TH_BASE}`
const TD_CELL = 'px-4 py-[7px] align-middle'
const TD_NUM = 'whitespace-nowrap px-4 py-[7px] text-right align-middle'

/** Séparateur décimal français : la virgule, pas le point (entier = inchangé). */
const fr = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',')

/**
 * Tri contrôlé des groupes — le DataTable ne trie rien lui-même, exactement
 * comme `sortRows` le fait pour la vue proactive.
 */
function sortGroups(groups: ComponentGroup[], sorting: SortingState[]): ComponentGroup[] {
  if (sorting.length === 0) return groups
  const { id, desc } = sorting[0]
  const dir = desc ? -1 : 1
  const sorted = [...groups]
  sorted.sort((a, b) => {
    switch (id) {
      case 'component':
        return dir * a.component.localeCompare(b.component, 'fr')
      case 'totalManquant':
        return dir * (a.totalManquant - b.totalManquant)
      case 'nbOfs':
        // Départage sur la qté totale : c'est l'ordre « dégâts » de groupByComponent.
        return dir * (a.lines.length - b.lines.length) || dir * (a.totalManquant - b.totalManquant)
      case 'urgent': {
        // Groupes orphelins (aucune commande) toujours en dernier, quel que soit le sens :
        // les remonter en tête d'un tri par date reviendrait à dire qu'ils sont urgents.
        const va = a.urgent?.dateExpeditionIso ?? null
        const vb = b.urgent?.dateExpeditionIso ?? null
        if (!va && !vb) return 0
        if (!va) return 1
        if (!vb) return -1
        return dir * va.localeCompare(vb)
      }
      default:
        return 0
    }
  })
  return sorted
}

export function ShortageComposants({
  rows,
  onSelectOf,
  emptyState,
}: {
  rows: ShortageDisplayRow[]
  onSelectOf: (numOf: string) => void
  emptyState: ReactNode
}) {
  // Tri par défaut : l'ordre « dégâts » de groupByComponent (nb d'OF bloqués desc,
  // puis qté totale desc) — rendu explicite pour que l'en-tête l'affiche.
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'nbOfs', desc: true }])

  const groups = useMemo(() => groupByComponent(rows), [rows])
  const sorted = useMemo(() => sortGroups(groups, sorting), [groups, sorting])

  const columns: ColumnDef<ComponentGroup>[] = [
    {
      id: 'component',
      header: 'Composant · Désignation',
      cell: ({ row: { original: g } }) => (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-[12px] font-bold tracking-tight text-foreground">
            {g.component}
          </span>
          {g.componentDesc && (
            <span className="truncate text-[10px] text-muted-foreground/70" title={g.componentDesc}>
              {g.componentDesc}
            </span>
          )}
        </div>
      ),
      meta: { thClass: th('w-[260px]'), tdClass: TD_CELL },
    },
    {
      id: 'totalManquant',
      header: 'Qté manq.',
      cell: ({ row: { original: g } }) => (
        <span
          className={cn(
            'font-mono text-[13px] font-bold leading-none tracking-tight tabular-nums',
            verdictSeverity(g.worstVerdict) === 'critical' ? 'text-destructive' : 'text-foreground'
          )}
        >
          {fr(g.totalManquant)}
          <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/60">u</span>
        </span>
      ),
      meta: { thClass: thR('w-[110px]'), tdClass: TD_NUM },
    },
    {
      id: 'nbOfs',
      header: 'OFs bloqués',
      cell: ({ row: { original: g } }) => g.lines.length,
      meta: {
        thClass: thR('w-[100px]'),
        tdClass: `${TD_NUM} font-mono text-[12.5px] font-semibold text-secondary-foreground tabular-nums`,
      },
    },
    {
      id: 'ofs',
      enableSorting: false,
      header: 'OFs',
      // Enroulement (et non pile verticale comme la colonne Couverture du proactif) :
      // un composant bloquant 40 OF est le cas NORMAL de cette vue — empilés, ils
      // feraient une ligne haute de 40 lignes.
      cell: ({ row: { original: g } }) => (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {g.lines.map((l) => (
            <button
              key={l.numOf}
              type="button"
              onClick={() => onSelectOf(l.numOf)}
              title={`Détail OF ${l.numOf} (faisabilité) — ${l.articleParent} · ${l.articleParentDesc}, manque ${l.qteManquante} u`}
              className={cn(
                'font-mono text-[10px] font-semibold leading-none underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground/70',
                l.verdictKey === 'sans_couverture' ? 'text-destructive' : 'text-foreground'
              )}
            >
              {l.numOf}
            </button>
          ))}
        </div>
      ),
      meta: { thClass: th(''), tdClass: TD_CELL },
    },
    {
      id: 'urgent',
      header: 'Commande la plus urgente',
      cell: ({ row: { original: g } }) => {
        if (!g.urgent) {
          return (
            <span className="font-sans text-[10px] italic text-muted-foreground/50">
              — orphelins
            </span>
          )
        }
        const late = verdictSeverity(g.worstVerdict) === 'critical'
        return (
          <div className="leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[12px] font-bold tracking-tight text-foreground">
                {g.urgent.numCommande}
              </span>
              {g.urgent.dateExpedition && (
                <span
                  className={cn(
                    'font-mono text-[11px] font-semibold',
                    late ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  title={`Expé : ${g.urgent.dateExpeditionIso ?? ''}`}
                >
                  {g.urgent.dateExpedition}
                </span>
              )}
            </div>
            {g.urgent.client && (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                {g.urgent.client}
              </div>
            )}
          </div>
        )
      },
      meta: { thClass: th('w-[210px]'), tdClass: TD_CELL },
    },
    {
      id: 'couverture',
      enableSorting: false,
      header: 'Couverture',
      cell: ({ row: { original: g } }) => {
        // Un groupe qui compte des lignes sans couverture le dit en chiffres : c'est
        // plus actionnable que le libellé du pire verdict, qui le sous-entend seulement.
        const mark = VERDICT_MARK[g.worstVerdict]
        const sansCouv = g.nbSansCouverture > 0
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                sansCouv ? VERDICT_MARK.sans_couverture.dot : mark.dot
              )}
            />
            <span
              className={cn(
                'text-[10px] font-semibold',
                sansCouv ? VERDICT_MARK.sans_couverture.text : mark.text
              )}
            >
              {sansCouv ? `${g.nbSansCouverture}/${g.lines.length} sans couv.` : mark.label}
            </span>
          </span>
        )
      },
      meta: { thClass: th('w-[150px]'), tdClass: TD_CELL },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: th('w-[38px]'),
    tdClass: (g: ComponentGroup) =>
      cn(
        'px-4 py-[7px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(verdictSeverity(g.worstVerdict))
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[1080px] table-fixed"
      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      columnDividers
      getRowKey={(g) => g.component}
      getRowClass={(g) =>
        cn(
          'border-t border-rule-soft transition-colors even:bg-foreground/[0.015]',
          LATE_TONE.bg(verdictSeverity(g.worstVerdict))
        )
      }
      emptyState={emptyState}
    />
  )
}

export default ShortageComposants
