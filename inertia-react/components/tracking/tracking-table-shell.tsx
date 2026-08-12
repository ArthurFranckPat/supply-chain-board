/**
 * Cadre commun aux deux vues du Suivi (réactif / proactif).
 *
 * Les deux vues portaient le même bandeau d'erreur, le même skeleton, la même
 * Card, le même DataTable et le même état vide — à deux mots près, copiés. Deux
 * copies d'un même cadre finissent toujours par diverger (elles avaient déjà
 * divergé sur `px-7` contre `px-5`). Le cadre vit ici, chaque vue n'apporte plus
 * que ses colonnes, son tri et son vocabulaire.
 */
import type { ReactNode } from 'react'
import { TriangleAlert, CircleX, FilterX, RotateCw } from 'lucide-react'

import { SkeletonRow } from '@r/components/ui/skeleton'
import { Card } from '@r/components/ui/card'
import { Button } from '@r/components/ui/button'
import { DynamicIcon } from '../ui/dynamic-icon'
import DataTable, {
  type ColumnDef,
  type DataTableIndexColumn,
  type SortingState,
} from '@r/components/ui/data-table'
import { useIsPrinting } from '@r/lib/use-is-printing'

export interface TrackingTableShellProps<TRow> {
  /** Message d'erreur X3 remonté par le serveur (bandeau non bloquant). */
  x3Error: string | null
  /** Nom de ce qui est chargé, au génitif : « du suivi », « de la réalisabilité ». */
  sujet: string
  rows: TRow[]
  columns: ColumnDef<TRow>[]
  indexColumn: DataTableIndexColumn<TRow>
  sorting: SortingState[]
  onSortingChange: (s: SortingState[]) => void
  loading: boolean
  error: boolean
  /** Relance le chargement X3 — sans ça, un échec est un cul-de-sac. */
  onRetry?: () => void
  /**
   * Classes de la `<table>` — passées en littéral par chaque vue : une classe
   * Tailwind construite par interpolation (`min-w-[${n}px]`) n'est jamais
   * générée, le scanner ne lit que des chaînes complètes dans les sources.
   */
  tableClass: string
  /** Hauteur de ligne estimée par le virtualiseur avant mesure réelle. */
  estimateRowSize?: number
  /** Colonnes de tête figées au scroll horizontal (colonne d'index comprise). */
  stickyCols?: number
  onRowClick?: (row: TRow) => void
  selectedRowKey?: string | null
  getRowKey: (row: TRow) => string
  /** Un filtre ou une recherche est actif — change le sens de l'état vide. */
  isFiltered: boolean
  onResetFilters?: () => void
  /** La plage demandée sort de la fenêtre chargée par le serveur. */
  horsFenetre?: boolean
  /** Récapitulatif des filtres, visible à l'impression seulement. */
  printContext?: ReactNode
}

export function TrackingTableShell<TRow>(props: TrackingTableShellProps<TRow>) {
  // Une table virtualisée n'a dans le DOM que sa fenêtre visible : à
  // l'impression, elle ne sortirait qu'une vingtaine de lignes.
  const printing = useIsPrinting()

  return (
    <>
      {props.x3Error && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
          <span className="font-semibold">Erreur de chargement {props.sujet} :</span>
          <span className="truncate font-mono">{props.x3Error}</span>
          {props.onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="ml-auto shrink-0"
              onClick={props.onRetry}
            >
              <RotateCw size={12} strokeWidth={1.75} />
              Réessayer
            </Button>
          )}
        </div>
      )}

      {/* `data-print-unclip` décolle l'en-tête collant à l'impression (il se
          figerait par-dessus le contenu à chaque saut de page) ; les `print:`
          libèrent la hauteur et le débordement, sans quoi la feuille ne
          contiendrait que ce qui tenait à l'écran. */}
      <div
        data-print-unclip
        className="min-h-0 flex-1 overflow-hidden p-5 print:h-auto print:overflow-visible print:p-0"
      >
        {props.printContext && (
          <div className="hidden pb-3 print:block" data-print-keep>
            {props.printContext}
          </div>
        )}

        {/* Le cadre de la Card est posé dès le chargement : sinon il apparaît à
            l'arrivée des données et la page saute à chaque rafraîchissement. */}
        <Card
          padding="none"
          className="h-full overflow-hidden print:h-auto print:overflow-visible print:border-0"
        >
          {props.loading ? (
            <div className="p-4">
              <SkeletonRow count={6} />
            </div>
          ) : props.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
              <p className="text-cell-lg text-foreground">
                Le calcul {props.sujet} n'a pas abouti.
              </p>
              {props.onRetry && (
                <Button type="button" variant="secondary" size="sm" onClick={props.onRetry}>
                  <RotateCw size={13} strokeWidth={1.75} />
                  Réessayer
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              columns={props.columns}
              rows={props.rows}
              sorting={props.sorting}
              onSortingChange={props.onSortingChange}
              indexColumn={props.indexColumn}
              tableClass={props.tableClass}
              stickyCols={props.stickyCols}
              scrollContainerClass="h-full overflow-auto rounded-none border-0 bg-transparent shadow-none print:h-auto print:overflow-visible"
              theadRowClass="sticky top-0 z-10 bg-transparent"
              onRowClick={props.onRowClick}
              selectedRowKey={props.selectedRowKey}
              getRowKey={props.getRowKey}
              virtualize={!printing}
              estimateRowSize={props.estimateRowSize}
              emptyState={<TrackingEmptyState {...props} />}
            />
          )}
        </Card>
      </div>
    </>
  )
}

/**
 * État vide — il doit nommer LA raison, pas accuser les filtres par défaut.
 * Trois cas réellement distincts : X3 muet, plage hors de la fenêtre chargée,
 * filtres trop serrés. Le quatrième (rien à suivre du tout) est une bonne
 * nouvelle et se dit comme telle.
 */
function TrackingEmptyState<TRow>(props: TrackingTableShellProps<TRow>) {
  const cas = props.x3Error
    ? 'x3'
    : props.horsFenetre
      ? 'fenetre'
      : props.isFiltered
        ? 'filtres'
        : 'vide'

  const titre = {
    x3: 'Erreur de connexion Sage X3',
    fenetre: 'Plage hors de la fenêtre chargée',
    filtres: 'Aucun résultat',
    vide: 'Rien à suivre',
  }[cas]

  const texte = {
    x3: `Impossible de récupérer les dernières données ${props.sujet} depuis le serveur ERP Sage X3.`,
    fenetre:
      'Le serveur ne charge que les 90 derniers jours et les 30 prochains. Rapprochez la fenêtre de dates pour voir des lignes.',
    filtres: 'Aucune ligne de commande ne correspond aux filtres ou à la recherche en cours.',
    vide: 'Aucune ligne de commande ouverte sur ce périmètre.',
  }[cas]

  return (
    <div className="flex flex-1 items-center justify-center p-12 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <DynamicIcon
            name={cas === 'x3' ? 'cloud_off' : cas === 'vide' ? 'check_circle' : 'search_off'}
            size={28}
            strokeWidth={1.75}
          />
        </div>
        <h3 className="mb-1 font-sans text-cell-lg font-semibold text-foreground">{titre}</h3>
        <p className="mb-5 max-w-sm font-sans text-xs leading-normal text-muted-foreground">
          {texte}
        </p>
        {cas === 'x3' && props.onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={props.onRetry}>
            <RotateCw size={13} strokeWidth={1.75} />
            Réessayer
          </Button>
        )}
        {(cas === 'filtres' || cas === 'fenetre') && props.onResetFilters && (
          <Button type="button" variant="secondary" size="sm" onClick={props.onResetFilters}>
            <FilterX size={13} strokeWidth={1.75} />
            Réinitialiser les filtres
          </Button>
        )}
      </div>
    </div>
  )
}
