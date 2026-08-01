/**
 * Définitions de colonnes de la vue proactive du Suivi — port React de
 * inertia/lib/suivi/proactive-columns.tsx (API ColumnDef du DataTable maison,
 * même JSX cellule que Solid).
 */
import { cn } from '@r/lib/utils'
import type { ColumnDef, DataTableIndexColumn } from '@r/components/ui/data-table'
import type { ProactiveDisplayRow } from '@r/lib/suivi/types'
import {
  OF_STATUT,
  VERDICT_TONE,
  VERDICT_DOT,
  VERDICT_TEXT,
  LATE_TONE,
  getRelativeDateLabel,
} from '@r/lib/suivi/tracking-shared'
import { CalendarX, CornerDownRight } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

export interface ProactiveColumnsDeps {
  referenceDate: string
  /** Clic sur un n° d'OF (colonne Couverture) → ouvre le détail (faisabilité), comme /programme. */
  onSelectOf?: (numOf: string) => void
  /**
   * Inclure les sous-ensembles (semi-finis) en rupture dans la colonne « Composants
   * en rupture ». Défaut `false` : seuls les composants achetés (`descente === null`)
   * sont affichés. Les SE fabriqués sont identifiés par `descente !== null`.
   */
  showSubAssemblies?: boolean
}

export function createProactiveColumns({
  referenceDate,
  onSelectOf,
  showSubAssemblies = false,
}: ProactiveColumnsDeps): ColumnDef<ProactiveDisplayRow>[] {
  return [
    {
      accessorKey: 'numCommande',
      header: 'Commande · Client',
      cell: ({ row, getValue }) => (
        <>
          <span className="font-mono text-xs font-bold tracking-tight text-foreground">
            {getValue() as string}
          </span>
          <span className="ml-1.5 text-2xs text-muted-foreground">
            {row.original.client || '—'}
          </span>
        </>
      ),
      meta: {
        thClass:
          'w-[150px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      accessorKey: 'article',
      header: 'Article · Désignation',
      cell: ({ row, getValue }) => (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-mono text-xs font-bold tracking-tight text-foreground">
            {getValue() as string}
          </span>
          <span className="truncate text-2xs text-muted-foreground/70">
            {row.original.designation || '—'}
          </span>
        </div>
      ),
      meta: {
        thClass:
          'w-[200px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
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
            className="cursor-help rounded bg-secondary px-[7px] py-0.5 font-mono text-2xs font-semibold text-muted-foreground"
            title={title}
          >
            {val}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[56px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      accessorKey: 'poste',
      header: 'Poste',
      cell: ({ row, getValue }) => {
        const code = getValue() as string
        if (!code)
          return (
            <span className="font-sans text-xs font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <span
            className="cursor-help whitespace-nowrap rounded bg-secondary px-[7px] py-0.5 font-mono text-2xs font-semibold text-muted-foreground"
            title={row.original.posteLabel ? `${code} — ${row.original.posteLabel}` : code}
          >
            {code}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[90px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      accessorKey: 'qteRestante',
      header: 'Qté',
      cell: ({ getValue }) => (
        <span className="font-mono text-cell-lg font-bold leading-none tracking-tight text-foreground tabular-nums">
          {getValue() as number}
          <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
        </span>
      ),
      meta: {
        thClass:
          'w-[100px] px-4 py-[7px] text-right font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[7px] text-right align-middle',
      },
    },
    {
      accessorKey: 'dateExp',
      header: 'Expé',
      cell: ({ row, getValue }) => {
        const rel = getRelativeDateLabel(row.original.dateExpIso, referenceDate)
        return (
          <div className="leading-tight">
            <div className="font-mono text-1.5xs font-semibold text-foreground">
              {(getValue() as string) || '—'}
            </div>
            {rel && (
              <div
                className={cn(
                  'font-sans text-3xs font-semibold',
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
        thClass:
          'w-[76px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[7px] align-middle font-mono text-cell-lg font-semibold text-foreground',
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
            <div className="flex flex-col gap-0.5">
              {ofs.map((of) => {
                const st = OF_STATUT[of.statutNum]
                return (
                  <div key={of.numOf} className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      className={cn(
                        'truncate rounded font-mono text-2xs font-semibold leading-none outline-ring',
                        onSelectOf
                          ? 'text-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-foreground/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1'
                          : 'text-secondary-foreground'
                      )}
                      disabled={!onSelectOf}
                      aria-label={onSelectOf ? `Détail OF ${of.numOf} (faisabilité)` : of.numOf}
                      title={onSelectOf ? `Détail OF ${of.numOf} (faisabilité)` : of.numOf}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectOf?.(of.numOf)
                      }}
                    >
                      {of.numOf}
                    </button>
                    {/* `relative` OBLIGATOIRE sur le conteneur du halo : `animate-ping` est en
                        `absolute` et se cale sur le premier ancêtre positionné. Sans lui il
                        s'échappait de la cellule et se peignait par-dessus des lignes sans
                        rapport — d'où des « OF en cours » fantômes dans un tableau virtualisé. */}
                    {of.estDebuté && (
                      <span
                        className="relative flex size-1.5 shrink-0"
                        title={
                          of.piecesFaites != null && of.piecesTotalOf
                            ? `OF démarré — ${of.piecesFaites}/${of.piecesTotalOf} pièces réalisées`
                            : 'OF démarré — pointage atelier en cours'
                        }
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ferme opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-ferme" />
                      </span>
                    )}
                    {st && (
                      <span
                        className={cn(
                          'shrink-0 cursor-help rounded px-1 py-px font-mono text-4xs font-bold leading-none',
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
                    {of.estDebuté && of.piecesFaites != null && of.piecesTotalOf && (
                      <span
                        className="shrink-0 cursor-help font-mono text-4xs font-semibold leading-none text-ferme tabular-nums"
                        title="Pièces réalisées / total OF (poste le plus avancé pointé)"
                      >
                        {of.piecesFaites}/{of.piecesTotalOf}
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
            className="inline-flex cursor-help items-center gap-1 rounded-md border border-transparent bg-secondary px-2 py-0.5 font-mono text-1.5xs font-semibold text-muted-foreground"
            title={
              v === 'Stock'
                ? 'Couvert par le stock disponible'
                : "Couvert par une commande d'achat fournisseur"
            }
          >
            {v}
          </span>
        ) : (
          <span className="break-all font-mono text-1.5xs font-semibold leading-snug text-secondary-foreground">
            {v}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[150px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      id: 'verdictKey',
      enableSorting: false,
      header: 'Verdict',
      cell: ({ row }) => {
        const o = row.original
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('size-1.5 shrink-0 rounded-full', VERDICT_DOT[o.verdictKey])} />
            <span className={cn('text-2xs font-semibold', VERDICT_TEXT[o.verdictKey])}>
              {o.verdictLabel}
            </span>
          </span>
        )
      },
      meta: {
        thClass:
          'w-[120px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
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
          'w-[70px] px-4 py-[7px] text-right font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[7px] text-right align-middle font-mono text-cell-lg font-semibold text-secondary-foreground',
      },
    },
    {
      id: 'composants',
      enableSorting: false,
      header: 'Composants en rupture',
      cell: ({ row }) => {
        // Par défaut, seuls les composants ACHETÉS sont affichés. Un sous-ensemble fabriqué
        // se reconnaît soit à sa descente BOM (SE réellement manquant), soit à `couvertParOf`
        // (SE dont la couverture ne tient que grâce à un OF producteur).
        const all = row.original.composants
        const comps = showSubAssemblies ? all : all.filter((c) => !c.descente && !c.couvertParOf)
        if (comps.length === 0)
          return (
            <span className="font-sans text-xs font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <div className="flex flex-col gap-1">
            {comps.slice(0, 4).map((c) => (
              <div key={c.art} className="flex flex-col gap-px">
                <div className="flex items-center gap-1.5">
                  {/* Sous-ensemble fabriqué (descente BOM ou couvert par production) en teal :
                      il se traite à l'atelier, pas aux achats — la distinction doit sauter aux
                      yeux dans une colonne qui mélange les deux. */}
                  <span
                    className={cn(
                      'shrink-0 font-mono text-2xs font-bold',
                      c.descente || c.couvertParOf ? 'text-planifie' : 'text-foreground'
                    )}
                    title={c.descente || c.couvertParOf ? 'Sous-ensemble fabriqué' : undefined}
                  >
                    {c.art}
                  </span>
                  {c.desc && (
                    <span
                      className="truncate font-sans text-2xs leading-tight text-muted-foreground"
                      title={c.desc}
                    >
                      {c.desc}
                    </span>
                  )}
                  {/* Un SE couvert par production n'est PAS en manque : pas de signe « − »,
                      qui se lirait comme une rupture. */}
                  <span className="ml-auto shrink-0 rounded bg-secondary px-1 font-mono text-2xs font-semibold text-muted-foreground tabular-nums">
                    {c.couvertParOf ? c.qty : `−${c.qty}`}
                  </span>
                </div>
                {/* Descente BOM d'un SE manquant : soit « OF à lancer » (composants dispo),
                    soit les feuilles réellement bloquantes avec leur réception. La lentille
                    réception directe ne s'affiche que pour les composants SANS descente
                    (achetés) — pour un SE elle serait du bruit (pas d'achat sur un fabriqué). */}
                {c.couvertParOf ? (
                  <div className="mt-0.5 flex flex-col gap-px font-mono text-3xs leading-snug text-muted-foreground">
                    {/* Part couverte par du stock sous contrôle qualité — à débloquer par le
                        contrôle réception, pas par la production. */}
                    {c.qc > 0 && (
                      <div className="flex items-center gap-1">
                        <CornerDownRight
                          size={10}
                          strokeWidth={1.75}
                          className="leading-none text-muted-foreground/60"
                        />
                        <span>
                          <span className="font-bold text-foreground">{c.qc}</span> en statut Q
                          (contrôle réception)
                        </span>
                      </div>
                    )}
                    {c.couvertParOf.ofs.length === 0
                      ? c.couvertParOf.parOf > 0 && (
                          <div className="flex items-center gap-1">
                            <CornerDownRight
                              size={10}
                              strokeWidth={1.75}
                              className="leading-none text-muted-foreground/60"
                            />
                            <span>
                              <span className="font-bold text-foreground">
                                {c.couvertParOf.parOf}
                              </span>{' '}
                              sans OF producteur
                            </span>
                          </div>
                        )
                      : c.couvertParOf.ofs.map((of) => (
                          <div key={of.numOf} className="flex items-center gap-1">
                            <CornerDownRight
                              size={10}
                              strokeWidth={1.75}
                              className="leading-none text-muted-foreground/60"
                            />
                            <span>
                              <span className="font-bold text-foreground">
                                {c.couvertParOf!.parOf}
                              </span>{' '}
                              par <span className="font-bold text-foreground">{of.numOf}</span>
                              {of.dateFin && (
                                <span className="text-muted-foreground"> (fin {of.dateFin})</span>
                              )}
                            </span>
                          </div>
                        ))}
                  </div>
                ) : c.descente ? (
                  c.descente.statut === 'bloque' ? (
                    <div className="mt-0.5 flex flex-col gap-px border-l border-rule-soft pl-2">
                      {c.descente.par.slice(0, 3).map((p) => (
                        <div
                          key={p.art}
                          className="flex flex-col gap-px font-mono text-3xs leading-snug text-muted-foreground"
                          title={p.desc}
                        >
                          <div className="flex items-center gap-1">
                            <CornerDownRight
                              size={10}
                              strokeWidth={1.75}
                              className="leading-none text-muted-foreground/60"
                            />
                            <span>
                              Bloqué par <span className="font-bold text-foreground">{p.art}</span>{' '}
                              <span className="font-bold text-muted-foreground">−{p.manque}</span>
                            </span>
                          </div>
                          {p.reception ? (
                            <div
                              className={cn(
                                'flex items-center gap-0.5 pl-3.5 text-3xs font-medium',
                                p.reception.overdue
                                  ? 'font-bold text-foreground'
                                  : 'text-muted-foreground/80'
                              )}
                              title={p.reception.supplier}
                            >
                              <DynamicIcon
                                name={p.reception.overdue ? 'warning' : 'local_shipping'}
                                size={10}
                                strokeWidth={1.75}
                                className="leading-none opacity-80"
                              />
                              <span>
                                {p.reception.overdue
                                  ? `En retard +${p.reception.retardJ} j (${p.reception.eta})`
                                  : `Arrivée ${p.reception.eta} · ${p.reception.po}`}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 pl-3.5 text-3xs font-medium text-muted-foreground/60">
                              <CalendarX
                                size={10}
                                strokeWidth={1.75}
                                className="leading-none text-muted-foreground/50"
                              />
                              Aucune couverture prévue
                            </div>
                          )}
                        </div>
                      ))}
                      {c.descente.par.length > 3 && (
                        <div className="pl-3.5 font-mono text-3xs font-medium text-muted-foreground/70">
                          +{c.descente.par.length - 3} autre(s)
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-3xs font-semibold leading-none text-muted-foreground">
                      <CornerDownRight
                        size={11}
                        strokeWidth={1.75}
                        className="leading-none text-muted-foreground"
                      />
                      ↳ SE à lancer (composants dispo)
                    </div>
                  )
                ) : c.reception ? (
                  <div
                    className={cn(
                      'mt-0.5 flex items-center gap-1 font-mono text-3xs leading-none',
                      c.reception.overdue
                        ? 'font-bold text-foreground'
                        : 'font-medium text-muted-foreground'
                    )}
                    title={`Fournisseur: ${c.reception.supplier}`}
                  >
                    <DynamicIcon
                      name={c.reception.overdue ? 'warning' : 'local_shipping'}
                      size={11}
                      strokeWidth={1.75}
                      className="leading-none opacity-80"
                    />
                    <span>
                      {c.reception.overdue
                        ? `En retard +${c.reception.retardJ} j (${c.reception.eta})`
                        : `Arrivée ${c.reception.eta} · ${c.reception.po}`}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-3xs font-medium text-muted-foreground/60">
                    <CalendarX
                      size={11}
                      strokeWidth={1.75}
                      className="leading-none text-muted-foreground/50"
                    />
                    Aucune couverture prévue
                  </div>
                )}
                {/* Dette envers le contrôle qualité sur un composant acheté — la ligne SE
                    porte déjà la sienne dans son bloc `couvertParOf`. */}
                {!c.couvertParOf && c.qc > 0 && (
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-3xs font-medium text-muted-foreground">
                    <CornerDownRight
                      size={10}
                      strokeWidth={1.75}
                      className="leading-none text-muted-foreground/60"
                    />
                    <span>
                      dont <span className="font-bold text-foreground">{c.qc}</span> en statut Q
                      (contrôle réception)
                    </span>
                  </div>
                )}
              </div>
            ))}
            {comps.length > 4 && (
              <span className="font-mono text-2xs font-medium text-muted-foreground/70">
                +{comps.length - 4} autre(s)
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass:
          'w-[300px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
  ]
}

/** Index column partagée (N°) pour la table proactive. */
export function createProactiveIndexCol(): DataTableIndexColumn<ProactiveDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[7px] text-left font-sans text-2xs font-semibold tracking-wider text-muted-foreground border-b border-rule',
    tdClass: (row: ProactiveDisplayRow) => {
      // blocked / uncov : pas un retard calendaire mais un vrai problème → rouge foncé.
      // late : utilise la gravité (tolerance/critical).
      const s =
        row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
          ? ('critical' as const)
          : row.lateSeverity
      return cn(
        'px-4 py-[7px] align-middle font-sans text-xs font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(s)
      )
    },
  }
}
