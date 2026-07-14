import React from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Pill } from 'carbon-react'
import { cn } from '@/libs/cn'
import type { ColumnDef, DataTableIndexColumn } from '../../components/ui/data-table'
import type { ProactiveDisplayRow } from '@/lib/suivi/types'
import { OF_STATUT, LATE_TONE, getRelativeDateLabel } from '@/lib/suivi/tracking-shared'
import { VERDICT_PILL, OF_STATUT_PILL } from './pill_tones'

export interface ProactiveColumnsDeps {
  referenceDate: string
}

export function createProactiveColumns({ referenceDate }: ProactiveColumnsDeps): ColumnDef<ProactiveDisplayRow>[] {
  const proHelper = createColumnHelper<ProactiveDisplayRow>()
  
  return [
    proHelper.accessor('numCommande', {
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
    proHelper.accessor('article', {
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
    proHelper.accessor('type', {
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
    proHelper.accessor('qteRestante', {
      header: () => 'Qté',
      cell: (info) => {
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              <span className="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {info.getValue()}
              </span>
              <span className="font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
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
    proHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => {
        const late = info.row.original.joursRetard > 0
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
          'whitespace-nowrap px-4 py-[9px] align-middle font-mono text-[12.5px] font-semibold text-foreground',
      },
      // Tri chronologique sur l'ISO — sans ça TanStack trie sur la chaîne affichée
      // "JJ/MM" (ordre lexicographique, cassé aux frontières de mois/année).
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
    }) as any,
    proHelper.accessor('couverture', {
      header: () => 'Couverture',
      cell: (info) => {
        const v = info.getValue()
        const ofs = info.row.original.ofs
        
        if (ofs.length > 0) {
          return (
            <div className="flex flex-col gap-1">
              {ofs.map((of) => {
                const st = OF_STATUT[of.statutNum]
                const ofTone = OF_STATUT_PILL[of.statutNum] ?? { colorVariant: 'neutral' as const, fill: false }
                return (
                  <div key={of.numOf} className="flex flex-col gap-px">
                    <div className="relative flex items-center gap-1.5">
                      {of.estDebuté && (
                        <span
                          className="absolute -right-1.5 -top-1.5 flex size-1.5"
                          title={
                            of.piecesFaites != null && of.piecesTotalOf
                              ? `OF démarré — ${of.piecesFaites}/${of.piecesTotalOf} pièces réalisées`
                              : 'OF démarré — pointage atelier en cours'
                          }
                        >
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                        </span>
                      )}
                      <span className="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
                        {of.numOf}
                      </span>
                      {st && (
                        <Pill
                          size="S"
                          colorVariant={ofTone.colorVariant}
                          fill={ofTone.fill}
                          pillRole="status"
                          title={
                            st.tag === 'WOF'
                              ? 'Work Order Firm (OF Ferme) — Validé et verrouillé'
                              : st.tag === 'WOP'
                                ? 'Work Order Planned (OF Planifié) — Planifié en production'
                                : 'Work Order Suggested (OF Suggéré) — Proposition du calcul des besoins'
                          }
                        >
                          {st.tag}
                        </Pill>
                      )}
                    </div>
                    {of.estDebuté && of.piecesFaites != null && of.piecesTotalOf && (
                      <span
                        className="font-mono text-[9px] font-semibold tabular-nums leading-none text-emerald-600 cursor-help"
                        title="Pièces réalisées / total OF (poste le plus avancé pointé)"
                      >
                        {of.piecesFaites}/{of.piecesTotalOf} pièces
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        }
        
        const isGood = v === 'Stock' || v === 'Achat'
        return isGood ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-transparent bg-ferme/15 px-2 py-0.5 font-mono text-[11px] font-bold text-ferme cursor-help"
            title={v === 'Stock' ? 'Couvert par le stock disponible' : "Couvert par une commande d'achat fournisseur"}
          >
            {v}
          </span>
        ) : (
          <span className="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
            {v}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }) as any,
    proHelper.display({
      id: 'verdictKey',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info) => {
        const o = info.row.original
        const tone = VERDICT_PILL[o.verdictKey]
        return (
          <Pill
            colorVariant={tone.colorVariant}
            fill={tone.fill}
            pillRole="status"
            title={o.verdictLabel}
          >
            {o.verdictLabel}
          </Pill>
        )
      },
      meta: {
        thClass:
          'w-[120px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }) as any,
    proHelper.display({
      id: 'chargeHeures',
      enableSorting: false,
      header: () => 'Charge',
      cell: (info) => {
        const known = info.row.original.ofs.filter((of) => of.chargeHeures !== null)
        if (known.length === 0) return <>—</>
        const total = known.reduce((sum, of) => sum + (of.chargeHeures ?? 0), 0)
        return <>{Math.round(total * 10) / 10}h</>
      },
      meta: {
        thClass:
          'w-[70px] px-4 py-[8px] text-right font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[9px] text-right align-middle font-mono text-[12.5px] font-semibold text-secondary-foreground',
      },
    }) as any,
    proHelper.display({
      id: 'composants',
      enableSorting: false,
      header: () => 'Goulots',
      cell: (info) => {
        const comps = info.row.original.composants
        if (comps.length === 0) {
          return (
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        }
        
        return (
          <div className="flex flex-col gap-1">
            {comps.slice(0, 4).map((c, idx) => (
              <div key={idx} className="flex flex-col gap-px">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[10.5px] font-bold text-destructive">
                    {c.art}
                  </span>
                  {c.desc && (
                    <span
                      className="truncate font-sans text-[10px] leading-tight text-muted-foreground"
                      title={c.desc}
                    >
                      {c.desc}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 rounded bg-destructive/10 px-1 font-mono text-[10px] font-bold tabular-nums text-destructive">
                    −{c.qty}
                  </span>
                </div>
                
                {c.descente ? (
                  c.descente.statut === 'bloque' ? (
                    <div className="flex flex-col gap-px pl-2 mt-0.5 border-l border-rule-soft">
                      {c.descente.par.slice(0, 3).map((p, pidx) => (
                        <div
                          key={pidx}
                          className="flex flex-col gap-px font-mono text-[9px] leading-snug text-muted-foreground"
                          title={p.desc}
                        >
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px] leading-none text-muted-foreground/60">subdirectory_arrow_right</span>
                            <span>Bloqué par <span className="font-bold text-destructive">{p.art}</span> <span className="font-bold text-destructive">−{p.manque}</span></span>
                          </div>
                          {p.reception ? (
                            <div
                              className={cn(
                                "pl-3.5 flex items-center gap-0.5 text-[8.5px] font-medium",
                                p.reception.overdue ? 'text-destructive font-bold' : 'text-muted-foreground/80'
                              )}
                              title={p.reception.supplier}
                            >
                              <span className="material-symbols-outlined text-[10px] leading-none opacity-80">
                                {p.reception.overdue ? 'warning' : 'local_shipping'}
                              </span>
                              <span>
                                {p.reception.overdue
                                  ? `En retard +${p.reception.retardJ} j (${p.reception.eta})`
                                  : `Arrivée ${p.reception.eta} · ${p.reception.po}`}
                              </span>
                            </div>
                          ) : (
                            <div className="pl-3.5 flex items-center gap-0.5 text-[8.5px] text-destructive/60 font-medium">
                              <span className="material-symbols-outlined text-[10px] leading-none text-destructive/50">event_busy</span>
                              Aucune couverture prévue
                            </div>
                          )}
                        </div>
                      ))}
                      {c.descente.par.length > 3 && (
                        <div className="pl-3.5 font-mono text-[8.5px] font-medium text-muted-foreground/70">
                          +{c.descente.par.length - 3} autre(s)
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-semibold text-emerald-700 leading-none">
                      <span className="material-symbols-outlined text-[11px] leading-none text-emerald-600">subdirectory_arrow_right</span>
                      ↳ SE à lancer (composants dispo)
                    </div>
                  )
                ) : c.reception ? (
                  <div
                    className={cn(
                      "mt-0.5 flex items-center gap-1 font-mono text-[9px] leading-none",
                      c.reception.overdue ? 'font-bold text-destructive' : 'font-medium text-muted-foreground'
                    )}
                    title={`Fournisseur: ${c.reception.supplier}`}
                  >
                    <span className="material-symbols-outlined text-[11px] leading-none opacity-80">
                      {c.reception.overdue ? 'warning' : 'local_shipping'}
                    </span>
                    <span>
                      {c.reception.overdue
                        ? `En retard +${c.reception.retardJ} j (${c.reception.eta})`
                        : `Arrivée ${c.reception.eta} · ${c.reception.po}`}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-medium text-destructive/60">
                    <span className="material-symbols-outlined text-[11px] leading-none text-destructive/50">event_busy</span>
                    Aucune couverture prévue
                  </div>
                )}
              </div>
            ))}
            {comps.length > 4 && (
              <span className="font-mono text-[10px] font-medium text-muted-foreground/70">
                +{comps.length - 4} autre(s)
              </span>
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
  ]
}

export function createProactiveIndexCol(): DataTableIndexColumn<ProactiveDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
    tdClass: (row: ProactiveDisplayRow, virtualIndex: number) => {
      const s =
        row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
          ? ('critical' as const)
          : row.lateSeverity
      return cn(
        'px-4 py-[9px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(s)
      )
    },
  }
}
