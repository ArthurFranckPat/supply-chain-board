/**
 * Définitions de colonnes de la vue réactive du Suivi — port React de
 * inertia/lib/suivi/reactive-columns.tsx (API ColumnDef du DataTable maison,
 * même JSX cellule que Solid).
 */
import { cn } from '@r/lib/utils'
import type { ColumnDef, DataTableIndexColumn } from '@r/components/ui/data-table'
import type { SuiviDisplayRow } from '@/lib/suivi/types'
import { BADGE_TONE, LATE_TONE, empKey, getRelativeDateLabel } from '@/lib/suivi/tracking-shared'
import { FlaskConical, Hourglass } from 'lucide-react'
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
      cell: ({ row, getValue }) => (
        <>
          <div className="font-mono text-[13px] font-bold tracking-tight text-foreground">
            {getValue() as string}
          </div>
          <div className="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {row.original.client || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    },
    {
      accessorKey: 'article',
      header: 'Article · Désignation',
      cell: ({ row, getValue }) => (
        <>
          <div className="font-mono text-[13px] font-semibold text-brand">
            {getValue() as string}
          </div>
          <div className="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {row.original.designation || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[200px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
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
          <span
            className="cursor-help rounded bg-brand-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand"
            title={title}
          >
            {val}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[56px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    },
    {
      accessorKey: 'qteRestante',
      header: 'Qté',
      cell: ({ row, getValue }) => {
        const r = row.original
        const commandee = r.qteCommandee || 1
        const restante = getValue() as number
        const strict = r.allocStrict
        const cq = r.allocCq
        const reliquat = Math.max(0, restante - strict - cq)
        const pctStrict = Math.min(100, Math.round((strict / commandee) * 100))
        const pctCq = Math.min(100 - pctStrict, Math.round((cq / commandee) * 100))
        const pctReliquat = Math.min(
          100 - pctStrict - pctCq,
          Math.round((reliquat / commandee) * 100)
        )
        const delivered = commandee - restante
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              <span className="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {restante}
              </span>
              <span className="font-mono text-[10px] font-medium text-muted-foreground/60">
                / {commandee}
              </span>
            </div>
            <div
              className="h-[3px] w-full overflow-hidden rounded-full bg-secondary"
              title={`Commandé ${commandee} · Livré ${delivered} · Alloué ${strict}${cq > 0 ? ` + CQ ${cq}` : ''} · Reliquat ${reliquat}`}
            >
              <div className="flex h-full">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctStrict}%` }} />
                <div className="h-full bg-purple-500 transition-all" style={{ width: `${pctCq}%` }} />
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctReliquat}%` }} />
              </div>
            </div>
          </div>
        )
      },
      meta: {
        thClass:
          'w-[100px] px-4 py-[8px] text-right font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[9px] text-right align-middle',
      },
    },
    {
      accessorKey: 'dateExp',
      header: 'Expé',
      cell: ({ row, getValue }) => {
        const late = row.original.late
        const rel = getRelativeDateLabel(row.original.dateExpIso, referenceDate)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={late ? 'font-bold text-destructive' : 'text-foreground'}>
              {(getValue() as string) || '—'}
            </span>
            {rel && (
              <span
                className={cn(
                  'rounded-[3px] px-1 py-[1px] font-sans text-[8.5px] font-semibold leading-none tracking-normal',
                  rel.tone
                )}
              >
                {rel.label}
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass:
          'w-[76px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[9px] align-middle font-mono text-[12.5px] font-semibold',
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
                    ? 'border-ferme/30 bg-ferme/15 text-ferme'
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
                      e.source === 'STOALL' ? 'text-ferme' : 'text-muted-foreground/70'
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
        thClass:
          'w-[300px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
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
            <span
              className={cn(
                'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium',
                BADGE_TONE[o.statusKey]
              )}
            >
              <DynamicIcon name={o.statusIcon} size={14} strokeWidth={1.75} className="overflow-hidden leading-none" />
              {o.statusLabel}
            </span>
            {o.cq && (
              <span
                className="inline-flex cursor-help items-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand"
                title="Contrôle Qualité — Nécessite une validation du laboratoire de contrôle"
              >
                <FlaskConical size={14} strokeWidth={1.75} className="leading-none" />
                CQ
              </span>
            )}
            {o.attenteLignes && (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-suggere/15 px-2 py-0.5 text-[11px] font-medium text-suggere"
                title="Commande MTO — expédition partielle non autorisée, en attente des autres lignes"
              >
                <Hourglass size={14} strokeWidth={1.75} className="leading-none" />
                Attente lignes
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass:
          'w-[130px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
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
              <span className="mt-[3px] block font-mono text-[10px] font-bold text-destructive">
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
        thClass:
          'w-[280px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    },
  ]
}

/** Index column partagée (N°) pour la table réactive. */
export function createReactiveIndexCol(): DataTableIndexColumn<SuiviDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[8px] text-left font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground border-b border-rule',
    tdClass: (row: SuiviDisplayRow) =>
      cn(
        'px-4 py-[9px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(row.lateSeverity)
      ),
  }
}
