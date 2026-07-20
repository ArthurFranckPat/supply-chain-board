/**
 * Définitions de colonnes de la vue proactive du Suivi — port React de
 * inertia/lib/suivi/proactive-columns.tsx (API ColumnDef du DataTable maison,
 * même JSX cellule que Solid).
 */
import { cn } from '@r/lib/utils'
import type { ColumnDef, DataTableIndexColumn } from '@r/components/ui/data-table'
import type { ProactiveDisplayRow } from '@/lib/suivi/types'
import {
  OF_STATUT,
  VERDICT_TONE,
  LATE_TONE,
  getRelativeDateLabel,
} from '@/lib/suivi/tracking-shared'
import { CalendarX, CornerDownRight } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

export interface ProactiveColumnsDeps {
  referenceDate: string
  /** Clic sur un n° d'OF (colonne Couverture) → ouvre le détail (faisabilité), comme /programme. */
  onSelectOf?: (numOf: string) => void
}

export function createProactiveColumns({
  referenceDate,
  onSelectOf,
}: ProactiveColumnsDeps): ColumnDef<ProactiveDisplayRow>[] {
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
        const restante = (getValue() as number) || 1
        const alloc = r.qteAllouee
        const reliquat = r.reliquat
        const pctAlloc = Math.min(100, Math.round((alloc / restante) * 100))
        const pctReliquat = Math.min(100 - pctAlloc, Math.round((reliquat / restante) * 100))
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              <span className="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {getValue() as number}
              </span>
              <span className="font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
            </div>
            <div
              className="h-[3px] w-full overflow-hidden rounded-full bg-secondary"
              title={`Restant ${restante} · Alloué ${alloc} · Reliquat ${reliquat}`}
            >
              <div className="flex h-full">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctAlloc}%` }} />
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
        // Pas de champ `late` sur les lignes proactives (payload serveur) — le
        // Solid lisait undefined (falsy). Parité : jamais de rouge ici.
        const rel = getRelativeDateLabel(row.original.dateExpIso, referenceDate)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-foreground">{(getValue() as string) || '—'}</span>
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
          'whitespace-nowrap px-4 py-[9px] align-middle font-mono text-[12.5px] font-semibold text-foreground',
      },
    },
    {
      accessorKey: 'couverture',
      header: 'Couverture',
      cell: ({ row, getValue }) => {
        const v = getValue() as string
        const ofs = row.original.ofs
        // Couverture par OF : un n° + son statut X3 (WOF/WOP/WOS) par ordre.
        if (ofs.length > 0) {
          return (
            <div className="flex flex-col gap-1">
              {ofs.map((of) => {
                const st = OF_STATUT[of.statutNum]
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
                      <button
                        type="button"
                        className={cn(
                          'break-all font-mono text-[11px] font-semibold leading-snug',
                          onSelectOf
                            ? 'text-brand underline decoration-dotted underline-offset-2 hover:text-brand/80'
                            : 'text-secondary-foreground'
                        )}
                        disabled={!onSelectOf}
                        title={onSelectOf ? `Détail OF ${of.numOf} (faisabilité)` : undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectOf?.(of.numOf)
                        }}
                      >
                        {of.numOf}
                      </button>
                      {st && (
                        <span
                          className={cn(
                            'shrink-0 cursor-help rounded px-1 py-px font-mono text-[9px] font-bold leading-none',
                            st.tone
                          )}
                          title={
                            st.tag === 'WOF'
                              ? 'Work Order Firm (OF Ferme) — Validé et verrouillé'
                              : st.tag === 'WOP'
                                ? 'Work Order Planned (OF Planifié) — Planifié en production'
                                : 'Work Order Suggested (OF Suggéré) — Proposition du calcul des besoins'
                          }
                        >
                          {st.tag}
                        </span>
                      )}
                    </div>
                    {of.estDebuté && of.piecesFaites != null && of.piecesTotalOf && (
                      <span
                        className="cursor-help font-mono text-[9px] font-semibold leading-none text-emerald-600 tabular-nums"
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
            className="inline-flex cursor-help items-center gap-1 rounded-md border border-transparent bg-ferme/15 px-2 py-0.5 font-mono text-[11px] font-bold text-ferme"
            title={
              v === 'Stock'
                ? 'Couvert par le stock disponible'
                : "Couvert par une commande d'achat fournisseur"
            }
          >
            {v}
          </span>
        ) : (
          <span className="break-all font-mono text-[11px] font-semibold leading-snug text-secondary-foreground">
            {v}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    },
    {
      id: 'verdictKey',
      enableSorting: false,
      header: 'Verdict',
      cell: ({ row }) => {
        const o = row.original
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium',
              VERDICT_TONE[o.verdictKey]
            )}
          >
            {o.verdictLabel}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[120px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    },
    {
      id: 'chargeHeures',
      enableSorting: false,
      header: 'Charge',
      cell: ({ row }) => {
        // Charge réelle gamme (Σ qteRestante/cadence) des OF de couverture — indépendante
        // du jalonnement CBN. '—' si couverte par stock/achat (pas d'OF) ou gamme inconnue.
        const known = row.original.ofs.filter((of) => of.chargeHeures !== null)
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
    },
    {
      id: 'composants',
      enableSorting: false,
      header: 'Goulots',
      cell: ({ row }) => {
        const comps = row.original.composants
        if (comps.length === 0)
          return (
            <span className="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <div className="flex flex-col gap-1">
            {comps.slice(0, 4).map((c) => (
              <div key={c.art} className="flex flex-col gap-px">
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
                  <span className="ml-auto shrink-0 rounded bg-destructive/10 px-1 font-mono text-[10px] font-bold text-destructive tabular-nums">
                    −{c.qty}
                  </span>
                </div>
                {/* Descente BOM d'un SE manquant : soit « OF à lancer » (composants dispo),
                    soit les feuilles réellement bloquantes avec leur réception. La lentille
                    réception directe ne s'affiche que pour les composants SANS descente
                    (achetés) — pour un SE elle serait du bruit (pas d'achat sur un fabriqué). */}
                {c.descente ? (
                  c.descente.statut === 'bloque' ? (
                    <div className="mt-0.5 flex flex-col gap-px border-l border-rule-soft pl-2">
                      {c.descente.par.slice(0, 3).map((p) => (
                        <div
                          key={p.art}
                          className="flex flex-col gap-px font-mono text-[9px] leading-snug text-muted-foreground"
                          title={p.desc}
                        >
                          <div className="flex items-center gap-1">
                            <CornerDownRight size={10} strokeWidth={1.75} className="leading-none text-muted-foreground/60" />
                            <span>
                              Bloqué par <span className="font-bold text-destructive">{p.art}</span>{' '}
                              <span className="font-bold text-destructive">−{p.manque}</span>
                            </span>
                          </div>
                          {p.reception ? (
                            <div
                              className={cn(
                                'flex items-center gap-0.5 pl-3.5 text-[8.5px] font-medium',
                                p.reception.overdue
                                  ? 'font-bold text-destructive'
                                  : 'text-muted-foreground/80'
                              )}
                              title={p.reception.supplier}
                            >
                              <DynamicIcon name={p.reception.overdue ? 'warning' : 'local_shipping'} size={10} strokeWidth={1.75} className="leading-none opacity-80" />
                              <span>
                                {p.reception.overdue
                                  ? `En retard +${p.reception.retardJ} j (${p.reception.eta})`
                                  : `Arrivée ${p.reception.eta} · ${p.reception.po}`}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 pl-3.5 text-[8.5px] font-medium text-destructive/60">
                              <CalendarX size={10} strokeWidth={1.75} className="leading-none text-destructive/50" />
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
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-semibold leading-none text-emerald-700">
                      <CornerDownRight size={11} strokeWidth={1.75} className="leading-none text-emerald-600" />
                      ↳ SE à lancer (composants dispo)
                    </div>
                  )
                ) : c.reception ? (
                  <div
                    className={cn(
                      'mt-0.5 flex items-center gap-1 font-mono text-[9px] leading-none',
                      c.reception.overdue
                        ? 'font-bold text-destructive'
                        : 'font-medium text-muted-foreground'
                    )}
                    title={`Fournisseur: ${c.reception.supplier}`}
                  >
                    <DynamicIcon name={c.reception.overdue ? 'warning' : 'local_shipping'} size={11} strokeWidth={1.75} className="leading-none opacity-80" />
                    <span>
                      {c.reception.overdue
                        ? `En retard +${c.reception.retardJ} j (${c.reception.eta})`
                        : `Arrivée ${c.reception.eta} · ${c.reception.po}`}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-medium text-destructive/60">
                    <CalendarX size={11} strokeWidth={1.75} className="leading-none text-destructive/50" />
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
    },
  ]
}

/** Index column partagée (N°) pour la table proactive. */
export function createProactiveIndexCol(): DataTableIndexColumn<ProactiveDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
    tdClass: (row: ProactiveDisplayRow) => {
      // blocked / uncov : pas un retard calendaire mais un vrai problème → rouge foncé.
      // late : utilise la gravité (tolerance/critical).
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
