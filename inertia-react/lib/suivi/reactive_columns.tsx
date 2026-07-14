import React from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pill } from 'carbon-react'
import { cn } from '@/libs/cn'
import type { ColumnDef, DataTableIndexColumn } from '../../components/ui/data-table'
import type { SuiviDisplayRow } from '@/lib/suivi/types'
import { LATE_TONE, empKey, getRelativeDateLabel } from '@/lib/suivi/tracking-shared'
import { STATUS_PILL } from './pill_tones'

export interface ReactiveColumnsDeps {
  expandedEmps: Set<string>
  toggleEmp: (key: string) => void
  referenceDate: string
}

export function createReactiveColumns({ expandedEmps, toggleEmp, referenceDate }: ReactiveColumnsDeps): ColumnDef<SuiviDisplayRow>[] {
  const reHelper = createColumnHelper<SuiviDisplayRow>()
  
  return [
    reHelper.accessor('numCommande', {
      header: () => 'Commande · Client',
      cell: (info) => (
        <>
          <div className="font-mono text-[13px] font-bold tracking-tight text-foreground">
            {info.getValue()}
          </div>
          <div className="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.client || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }) as any,
    reHelper.accessor('article', {
      header: () => 'Article · Désignation',
      cell: (info) => (
        <>
          <div className="font-mono text-[13px] font-semibold text-brand">
            {info.getValue()}
          </div>
          <div className="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.designation || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[200px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }) as any,
    reHelper.accessor('type', {
      header: () => 'Type',
      cell: (info) => {
        const val = info.getValue()
        const title =
          val === 'MTS'
            ? 'Make To Stock — Fabriqué pour le stock'
            : val === 'MTO'
              ? 'Make To Order — Fabriqué à la commande client'
              : 'Normal — Ligne standard'
        return (
          <span
            className="rounded bg-brand-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand cursor-help"
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
    }) as any,
    reHelper.accessor('qteRestante', {
      header: () => 'Qté',
      cell: (info) => {
        const row = info.row.original
        const commandee = row.qteCommandee || 1
        const restante = info.getValue()
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              <span className="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {restante}
              </span>
              <span className="font-mono text-[10px] font-medium text-muted-foreground/60">/ {commandee}</span>
            </div>
          </div>
        )
      },
      meta: {
        thClass:
          'w-[100px] px-4 py-[8px] text-right font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[9px] text-right align-middle',
      },
      // Tri NUMÉRIQUE — sans 'basic', TanStack fallback 'alphanumeric' trie "10" avant "2".
      sortingFn: 'basic',
    }) as any,
    reHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => {
        const late = info.row.original.late
        const rel = getRelativeDateLabel(info.row.original.dateExpIso, referenceDate)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn(late ? 'font-bold text-destructive' : 'text-foreground')}>
              {info.getValue() || '—'}
            </span>
            {rel && (
              <span className={cn("rounded-[3px] px-1 py-[1px] text-[8.5px] font-sans leading-none tracking-normal font-semibold", rel.tone)}>
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
      // Tri chronologique sur l'ISO — sans ça TanStack trie sur la chaîne affichée
      // "JJ/MM" (ordre lexicographique, cassé aux frontières de mois/année).
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
    }) as any,
    reHelper.display({
      id: 'emplacements',
      enableSorting: false,
      header: () => 'Emplacement',
      cell: (info) => {
        const r = info.row.original
        const emps = r.emplacements
        if (emps.length === 0) {
          return (
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        }
        
        const key = empKey(r)
        const expanded = expandedEmps.has(key)
        const visible = expanded ? emps : emps.slice(0, 1)
        const hiddenCount = emps.length - 1
        
        return (
          <div className="flex flex-col gap-[3px]">
            {visible.map((e, idx) => (
              <span
                key={idx}
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
                  <span
                    className={cn(
                      'material-symbols-outlined text-[13px] leading-none',
                      e.source === 'STOALL' ? 'text-ferme' : 'text-muted-foreground/70'
                    )}
                  >
                    {e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
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
            
            {hiddenCount > 0 && (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded bg-secondary/50 px-2.5 py-1 font-sans text-[10px] font-bold tracking-wide text-muted-foreground hover:text-foreground transition-all hover:bg-secondary border border-rule-soft"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleEmp(key)
                }}
              >
                <span>
                  {expanded ? 'Réduire' : `Voir +${hiddenCount} emplacement${hiddenCount > 1 ? 's' : ''}`}
                </span>
                <span className="material-symbols-outlined text-[14px] leading-none transition-transform duration-200">
                  {expanded ? 'expand_less' : 'expand_more'}
                </span>
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
    }) as any,
    reHelper.display({
      id: 'statusKey',
      enableSorting: false,
      header: () => 'Statut',
      cell: (info) => {
        const o = info.row.original
        const tone = STATUS_PILL[o.statusKey]
        return (
          <div className="flex flex-col items-start gap-1">
            {/* Statut principal — Carbon Pill (colorVariant dérive du tone source). */}
            <Pill
              colorVariant={tone.colorVariant}
              fill={tone.fill}
              pillRole="status"
              title={`${o.statusLabel}${o.statusIcon ? ` — ${o.statusIcon}` : ''}`}
            >
              {o.statusLabel}
            </Pill>
            {o.cq && (
              <Pill
                colorVariant="information"
                fill={false}
                pillRole="status"
                title="Contrôle Qualité — Nécessite une validation du laboratoire de contrôle"
              >
                CQ
              </Pill>
            )}
            {o.attenteLignes && (
              <Pill
                colorVariant="warning"
                fill={false}
                pillRole="status"
                title="Commande MTO — expédition partielle non autorisée, en attente des autres lignes"
              >
                Attente lignes
              </Pill>
            )}
          </div>
        )
      },
      meta: {
        thClass:
          'w-[130px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }) as any,
    reHelper.display({
      id: 'cause',
      enableSorting: false,
      header: () => 'Cause du retard',
      cell: (info) => {
        const cause = info.row.original.cause
        if (!cause) {
          return (
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        }
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
                {cause.retro.composant.cq && ' (CQ)'}
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
    }) as any,
  ]
}

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
