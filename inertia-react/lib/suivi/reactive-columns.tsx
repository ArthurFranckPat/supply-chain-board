/**
 * Définitions de colonnes de la vue réactive du Suivi — port React de
 * inertia/lib/suivi/reactive-columns.tsx (API ColumnDef du DataTable maison,
 * même JSX cellule que Solid).
 */
import { cn } from '@r/lib/utils'
import { Badge } from '@r/components/ui/badge'
import type { ColumnDef, DataTableIndexColumn } from '@r/components/ui/data-table'
import type { SuiviDisplayRow } from '@r/lib/suivi/types'
import {
  BADGE_TONE,
  BADGE_DOT,
  BADGE_TEXT,
  LATE_TONE,
  empKey,
  getRelativeDateLabel,
} from '@r/lib/suivi/tracking-shared'
import { FlaskConical, Hourglass } from 'lucide-react'
import { X3Link } from '../../components/x3-link'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

export interface ReactiveColumnsDeps {
  expandedEmps: Set<string>
  toggleEmp: (key: string) => void
  referenceDate: string
}

export function createReactiveColumns({
  expandedEmps,
  toggleEmp,
  referenceDate,
}: ReactiveColumnsDeps): ColumnDef<SuiviDisplayRow>[] {
  return [
    {
      accessorKey: 'numCommande',
      header: 'Commande · Client',
      // Le clic de LIGNE ouvre la sheet de détail (tracking.tsx) : le numéro
      // reste le déclencheur naturel de ce drill-down, X3 prend une icône à
      // côté plutôt que de lui voler le clic (revue #118).
      cell: ({ row, getValue }) => (
        <>
          <span className="font-mono text-[12px] font-bold tracking-tight text-foreground">
            {getValue() as string}
          </span>
          <X3Link
            fonction="GESSOH"
            cle={getValue() as string}
            title={`Ouvrir la commande ${getValue() as string} dans Sage X3`}
            iconOnly
            className="ml-1 align-middle text-muted-foreground hover:text-brand"
          />
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {row.original.client || '—'}
          </span>
        </>
      ),
      meta: {
        thClass: 'w-[150px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
      },
    },
    {
      accessorKey: 'article',
      header: 'Article · Désignation',
      cell: ({ row, getValue }) => (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-mono text-[12px] font-bold tracking-tight text-foreground">
            {getValue() as string}
          </span>
          <span className="truncate text-[10px] text-muted-foreground/70">
            {row.original.designation || '—'}
          </span>
        </div>
      ),
      meta: {
        thClass: 'w-[200px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ getValue }) => {
        const val = getValue() as string
        const title =
          val === 'MTS'
            ? 'Make To Stock — Fabriqué pour le stock'
            : val === 'MTO'
              ? 'Make To Order — Fabriqué à la commande client'
              : 'Normal — Ligne standard'
        return (
          <Badge variant="secondary" className="cursor-help font-mono" title={title}>
            {val}
          </Badge>
        )
      },
      meta: {
        thClass: 'w-[56px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
      },
    },
    {
      accessorKey: 'poste',
      header: 'Poste',
      cell: ({ row, getValue }) => {
        const code = getValue() as string
        if (!code)
          return (
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <Badge
            variant="secondary"
            className="cursor-help font-mono"
            title={row.original.posteLabel ? `${code} — ${row.original.posteLabel}` : code}
          >
            {code}
          </Badge>
        )
      },
      meta: {
        thClass: 'w-[90px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
      },
    },
    {
      accessorKey: 'qteRestante',
      header: 'Qté',
      cell: ({ row, getValue }) => {
        const restante = getValue() as number
        const commandee = row.original.qteCommandee
        return (
          <span className="font-mono text-[13px] font-bold leading-none tracking-tight text-foreground tabular-nums">
            {restante}
            <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/60">
              / {commandee}
            </span>
          </span>
        )
      },
      meta: {
        thClass: 'w-[100px] text-right! font-sans tracking-wider',
        tdClass: 'whitespace-nowrap text-right align-middle',
      },
    },
    {
      accessorKey: 'dateExp',
      header: 'Expé',
      cell: ({ row, getValue }) => {
        const rel = getRelativeDateLabel(row.original.dateExpIso, referenceDate)
        return (
          <div className="leading-tight">
            <div className="font-mono text-[11px] font-semibold text-foreground">
              {(getValue() as string) || '—'}
            </div>
            {rel && (
              <div
                className={cn(
                  'font-sans text-[9px] font-semibold',
                  rel.label.startsWith('Retard')
                    ? 'text-destructive'
                    : rel.label === "Aujourd'hui"
                      ? 'text-ferme'
                      : rel.label === 'Demain'
                        ? 'text-planifie'
                        : 'text-muted-foreground'
                )}
              >
                {rel.label}
              </div>
            )}
          </div>
        )
      },
      meta: {
        thClass: 'w-[76px] text-left font-sans tracking-wider',
        tdClass: 'whitespace-nowrap align-middle font-mono font-semibold',
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
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
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
                  'flex w-full items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10.5px] leading-[1.4]',
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
                      e.source === 'STOALL' ? 'text-foreground' : 'text-muted-foreground/70'
                    )}
                  />
                  <span className="font-semibold">{e.nom}</span>
                </span>
                <span className="flex-1" />
                {e.hum && (
                  <span
                    className="shrink-0 rounded bg-card/60 px-1.5 py-px font-mono text-[9.5px] font-bold text-foreground"
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
                className="flex w-full items-center justify-between rounded border border-rule-soft bg-secondary/50 px-2.5 py-1 font-sans text-[10px] font-bold tracking-wide text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
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
        thClass: 'w-[300px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
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
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('size-1.5 shrink-0 rounded-full', BADGE_DOT[o.statusKey])} />
              <span className={cn('text-[10px] font-semibold', BADGE_TEXT[o.statusKey])}>
                {o.statusLabel}
              </span>
            </span>
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
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-muted-foreground">
                <Hourglass size={10} strokeWidth={1.75} className="leading-none" />
                Attente
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass: 'w-[130px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
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
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <>
            <div className="text-[12px] leading-snug text-secondary-foreground">{cause.label}</div>
            {cause.comps.length > 0 && (
              <span className="mt-[3px] block font-mono text-[10px] font-bold text-foreground">
                {cause.comps.map((c) => `${c.art} −${c.qty}`).join(' · ')}
              </span>
            )}
            {cause.reception && (
              <span className="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                arrive {cause.reception.eta} · {cause.reception.po}
              </span>
            )}
            {cause.retro?.composant && (
              <span className="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                {cause.retro.composant.art} dispo {cause.retro.composant.dispoA}
                {cause.retro.composant.cq && <> (CQ)</>}
              </span>
            )}
            {cause.retro?.affermissement && (
              <span className="mt-[1px] block font-mono text-[10px] text-muted-foreground/70">
                OF {cause.retro.ofPegue} affermi {cause.retro.affermissement}
              </span>
            )}
          </>
        )
      },
      meta: {
        thClass: 'w-[280px] text-left font-sans tracking-wider',
        tdClass: 'align-middle',
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
        'align-middle font-sans font-bold tracking-tight tabular-nums',
        LATE_TONE.bar(row.lateSeverity)
      ),
  }
}
