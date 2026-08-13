/**
 * Définitions de colonnes de la vue réactive du Suivi — port React de
 * inertia/lib/suivi/reactive-columns.tsx (API ColumnDef du DataTable maison,
 * même JSX cellule que Solid).
 */
import { cn } from '@r/lib/utils'
import { Badge } from '@r/components/ui/badge'
import type { ColumnDef, DataTableIndexColumn } from '@r/components/ui/data-table'
import {
  CellDate,
  CellNumber,
  CellStack,
  CellVerdict,
  severityBarClass,
} from '@r/components/ui/table-row'
import type { SuiviDisplayRow } from '@r/lib/suivi/types'
import { BADGE_TEXT, empKey, getRelativeDateLabel } from '@r/lib/suivi/shared'
import { FlaskConical, Hourglass } from 'lucide-react'
import { X3Link } from '../../components/x3-link'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

export interface ReactiveColumnsDeps {
  expandedEmps: Set<string>
  toggleEmp: (key: string) => void
  referenceDate: string
  /**
   * Ouvre le diagnostic de la ligne. Le clic de LIGNE fait déjà ça (cible large
   * à la souris) mais un `<tr onClick>` n'est atteignable ni au clavier ni au
   * lecteur d'écran. Le numéro de commande porte donc le MÊME geste dans un vrai
   * `<button>` : pas de rôle ARIA menteur sur la rangée, et la sémantique de
   * tableau reste intacte.
   */
  onOpenRow?: (row: SuiviDisplayRow) => void
}

export function createReactiveColumns({
  expandedEmps,
  toggleEmp,
  referenceDate,
  onOpenRow,
}: ReactiveColumnsDeps): ColumnDef<SuiviDisplayRow>[] {
  return [
    {
      accessorKey: 'numCommande',
      header: 'Commande · Client',
      // Le clic de LIGNE ouvre la sheet de détail (tracking.tsx) : le numéro
      // reste le déclencheur naturel de ce drill-down, X3 prend une icône à
      // côté plutôt que de lui voler le clic (revue #118).
      cell: ({ row, getValue }) => (
        <CellStack
          code={
            <button
              type="button"
              className="rounded outline-ring hover:text-foreground/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:pointer-events-none"
              disabled={!onOpenRow}
              title={onOpenRow ? `Diagnostic de la ligne ${getValue() as string}` : undefined}
              onClick={(e) => {
                e.stopPropagation()
                onOpenRow?.(row.original)
              }}
            >
              {getValue() as string}
            </button>
          }
          action={
            <X3Link
              fonction="GESSOH"
              cle={getValue() as string}
              title={`Ouvrir la commande ${getValue() as string} dans Sage X3`}
              iconOnly
              className="align-middle text-muted-foreground hover:text-brand"
            />
          }
          label={row.original.client}
        />
      ),
      meta: {
        thClass: 'w-[150px]',
      },
    },
    {
      accessorKey: 'article',
      header: 'Article · Désignation',
      cell: ({ row, getValue }) => (
        <CellStack
          code={getValue() as string}
          label={row.original.designation}
          labelTitle={row.original.designation || undefined}
        />
      ),
      meta: {
        thClass: 'w-[200px]',
      },
    },
    {
      // Fusion Type · Poste (design V3) — les filtres restent séparés.
      accessorKey: 'type',
      header: 'Type · Poste',
      cell: ({ row, getValue }) => {
        const val = getValue() as string
        const poste = row.original.poste
        const title =
          val === 'MTS'
            ? 'Make To Stock — Fabriqué pour le stock'
            : val === 'MTO'
              ? 'Make To Order — Fabriqué à la commande client'
              : 'Normal — Ligne standard'
        return (
          <span
            className="cursor-help font-mono text-[11px] font-semibold leading-snug text-muted-foreground"
            title={
              poste && row.original.posteLabel
                ? `${title} — ${poste} (${row.original.posteLabel})`
                : title
            }
          >
            {val}
            {poste && (
              <>
                <span className="text-muted-foreground/60"> · </span>
                {poste}
              </>
            )}
          </span>
        )
      },
      meta: {
        thClass: 'w-[110px]',
      },
    },
    {
      accessorKey: 'qteRestante',
      header: 'Qté',
      cell: ({ row, getValue }) => {
        const restante = getValue() as number
        const commandee = row.original.qteCommandee
        return (
          <CellNumber
            value={
              <>
                {restante}
                <span className="ml-1 text-3xs font-medium text-muted-foreground">
                  / {commandee}
                </span>
              </>
            }
          />
        )
      },
      meta: {
        thClass: 'w-[100px] text-right!',
        tdClass: 'whitespace-nowrap text-right',
      },
    },
    {
      accessorKey: 'dateExp',
      header: 'Expé',
      cell: ({ row, getValue }) => {
        const rel = getRelativeDateLabel(row.original.dateExpIso, referenceDate)
        return (
          <CellDate
            date={getValue() as string}
            relative={rel?.label}
            tone={
              !rel
                ? null
                : rel.label.startsWith('Retard')
                  ? 'critical'
                  : rel.label === "Aujourd'hui"
                    ? 'ok'
                    : rel.label === 'Demain'
                      ? 'info'
                      : null
            }
          />
        )
      },
      meta: {
        thClass: 'w-[76px]',
        tdClass: 'whitespace-nowrap font-mono font-semibold',
      },
    },
    {
      id: 'emplacements',
      enableSorting: false,
      header: 'Emplacement',
      cell: ({ row }) => {
        const r = row.original
        const emps = r.emplacements
        if (emps.length === 0)
          return (
            <span className="font-sans text-xs font-medium leading-snug text-muted-foreground">
              —
            </span>
          )
        const key = empKey(r)
        const expanded = expandedEmps.has(key)
        // 1 pill visible par défaut ; les autres apparaissent au dépliage.
        const visible = expanded ? emps : emps.slice(0, 1)
        const hidden = emps.length - 1
        return (
          <div className="flex flex-col gap-[3px]">
            {visible.map((e, i) => (
              <span
                key={`${e.nom}-${e.hum}-${i}`}
                className={cn(
                  'flex w-full items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-mono text-2xs leading-[1.4]',
                  e.source === 'STOALL'
                    ? 'border-foreground/15 bg-secondary text-secondary-foreground'
                    : 'border-transparent bg-secondary text-secondary-foreground',
                  e.alreadyAllocated && 'line-through opacity-60'
                )}
                title={
                  e.source === 'STOALL'
                    ? 'Stock déjà alloué à cette ligne de commande (Sécurisé)'
                    : e.alreadyAllocated
                      ? 'Stock existant mais déjà réservé pour une autre commande'
                      : 'Stock libre en entrepôt, prêt à être alloué'
                }
              >
                <span className="flex min-w-[52px] shrink-0 items-center gap-1">
                  <DynamicIcon
                    name={e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                    size={13}
                    strokeWidth={1.75}
                    className={cn(
                      'leading-none',
                      e.source === 'STOALL' ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  />
                  <span className="font-semibold">{e.nom}</span>
                </span>
                <span className="flex-1" />
                {e.hum && (
                  <span
                    className="shrink-0 rounded bg-card/60 px-1.5 py-px font-mono text-3xs font-bold text-foreground"
                    title={`Numéro de palette : ${e.hum}`}
                  >
                    {e.hum.length > 8 ? `...${e.hum.slice(-6)}` : e.hum}
                  </span>
                )}
                <span className="w-[20px] shrink-0 text-right font-bold tabular-nums">
                  {e.qte > 0 ? Math.round(e.qte) : '·'}
                </span>
              </span>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded border border-rule-soft bg-secondary/50 px-2.5 py-1 font-sans text-2xs font-medium text-muted-foreground outline-ring transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                aria-expanded={expanded}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleEmp(key)
                }}
              >
                <span>
                  {expanded ? 'Réduire' : `Voir +${hidden} emplacement${hidden > 1 ? 's' : ''}`}
                </span>
                <DynamicIcon
                  name={expanded ? 'expand_less' : 'expand_more'}
                  size={14}
                  strokeWidth={1.75}
                  className="leading-none transition-transform duration-200"
                />
              </button>
            )}
          </div>
        )
      },
      meta: {
        thClass: 'w-[300px]',
      },
    },
    {
      id: 'statusKey',
      enableSorting: false,
      header: 'Statut',
      cell: ({ row }) => {
        const o = row.original
        return (
          <div className="flex flex-col items-start gap-1">
            {/* L'icône de statut existait déjà côté serveur (STATUS_DISPLAY.icon)
                sans jamais être rendue ici : le statut ne se lisait qu'à la
                COULEUR d'une pastille de 6 px. « À expédier » et « Retard » se
                distinguent maintenant par leur forme, comme sur le proactif. */}
            <CellVerdict
              marker={<DynamicIcon name={o.statusIcon} size={14} strokeWidth={1.75} />}
              label={o.statusLabel}
              tone={BADGE_TEXT[o.statusKey]}
            />
            {/* Stock sous statut Q : compté disponible, mais rien ne part tant que le
                contrôle n'est pas levé → marqueur saillant + action nommée. */}
            {o.cq && (
              <Badge
                variant="warning"
                className="gap-1"
                title={`${o.allocCq} u. de ${o.article} en statut Q (contrôle qualité).\nAction : contacter le contrôle réception pour faire libérer le stock.`}
              >
                <FlaskConical size={10} strokeWidth={2} className="leading-none" />
                CQ
              </Badge>
            )}
            {o.attenteLignes && (
              <span className="inline-flex items-center gap-1 text-3xs font-medium text-muted-foreground">
                <Hourglass size={10} strokeWidth={1.75} className="leading-none" />
                Attente
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass: 'w-[130px]',
      },
    },
    {
      id: 'cause',
      enableSorting: false,
      header: 'Cause du retard',
      cell: ({ row }) => {
        const cause = row.original.cause
        if (!cause)
          return (
            <span className="font-sans text-xs font-medium leading-snug text-muted-foreground">
              —
            </span>
          )
        return (
          <>
            <div className="text-xs leading-snug text-secondary-foreground">{cause.label}</div>
            {cause.comps.length > 0 && (
              <span className="mt-[3px] block font-mono text-2xs font-bold text-foreground">
                {cause.comps.map((c) => `${c.art} −${c.qty}`).join(' · ')}
              </span>
            )}
            {cause.reception && (
              <span className="mt-[2px] block font-mono text-2xs font-medium text-muted-foreground">
                arrive {cause.reception.eta} · {cause.reception.po}
              </span>
            )}
            {cause.retro?.composant && (
              <span className="mt-[2px] block font-mono text-2xs font-medium text-muted-foreground">
                {cause.retro.composant.art} dispo {cause.retro.composant.dispoA}
                {cause.retro.composant.cq && <> (CQ)</>}
              </span>
            )}
            {cause.retro?.affermissement && (
              <span className="mt-[1px] block font-mono text-2xs text-muted-foreground">
                OF {cause.retro.ofPegue} affermi {cause.retro.affermissement}
              </span>
            )}
          </>
        )
      },
      meta: {
        thClass: 'w-[280px]',
      },
    },
  ]
}

/** Index column partagée (N°) pour la table réactive. */
export function createReactiveIndexCol(): DataTableIndexColumn<SuiviDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass: 'w-[38px] text-left font-mono font-semibold',
    tdClass: (row: SuiviDisplayRow) =>
      cn(
        'font-sans font-bold tracking-tight tabular-nums',
        severityBarClass(row.lateSeverity === 'tolerance' ? 'warning' : row.lateSeverity)
      ),
  }
}
