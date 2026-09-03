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
import { CalendarX, CornerDownRight, FlaskConical } from 'lucide-react'
import { DynamicIcon } from '../../components/ui/dynamic-icon'

/** Séparateur décimal français : la virgule, pas le point (entier = inchangé). */
const fr = (n: number) => n.toString().replace('.', ',')

/** Vocabulaire de la bannière CQ du détail OF (of-detail-sheet) — une seule formulation. */
const CQ_ACTION_TITLE =
  'Ces quantités sont comptées disponibles mais restent bloquées en statut Q. ' +
  'Action : contacter le contrôle réception pour faire lever le contrôle.'

/**
 * Dépendance au contrôle qualité d'un composant (issue #185).
 *
 * Ambre et EN TÊTE des sous-lignes : quand une part du manque est tenue par du stock statut Q,
 * le levier n'est pas le fournisseur — la matière est déjà sur site, il faut faire lever le
 * contrôle réception, action faisable le jour même. Reléguée en dernière sous-ligne discrète,
 * elle laissait lire « commande en retard à cause du fournisseur » (AR2604014 / 11016938 :
 * 779 pièces en Q pour 108 réellement manquantes, arrivée annoncée APRÈS l'expédition).
 */
function CqLine({ qty }: { qty: number }) {
  return (
    <div
      className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-semibold leading-snug text-warning"
      title={CQ_ACTION_TITLE}
    >
      <FlaskConical size={10} strokeWidth={1.75} className="shrink-0 leading-none" />
      <span>
        <span className="font-bold">{fr(qty)}</span> en statut Q — lever le contrôle réception
      </span>
    </div>
  )
}

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
          <span className="font-mono text-[12px] font-bold tracking-tight text-foreground">
            {getValue() as string}
          </span>
          {row.original.client && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">{row.original.client}</span>
          )}
        </>
      ),
      meta: {
        thClass:
          'w-[150px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
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
          {row.original.designation && (
            <span className="truncate text-[10px] text-muted-foreground/70">
              {row.original.designation}
            </span>
          )}
        </div>
      ),
      meta: {
        thClass:
          'w-[200px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
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
            className="cursor-help rounded bg-secondary px-[7px] py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
            title={title}
          >
            {val}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[56px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      accessorKey: 'poste',
      header: 'Poste',
      cell: ({ row, getValue }) => {
        const code = getValue() as string
        if (!code) return null
        return (
          <span
            className="cursor-help whitespace-nowrap rounded bg-secondary px-[7px] py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
            title={row.original.posteLabel ? `${code} — ${row.original.posteLabel}` : code}
          >
            {code}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[90px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      accessorKey: 'qteRestante',
      header: 'Qté',
      cell: ({ getValue }) => (
        <span className="font-mono text-[13px] font-bold leading-none tracking-tight text-foreground tabular-nums">
          {getValue() as number}
          <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/60">u</span>
        </span>
      ),
      meta: {
        thClass:
          'w-[100px] px-4 py-[7px] text-right font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
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
            <div className="font-mono text-[11px] font-semibold text-foreground">
              {getValue() as string}
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
        thClass:
          'w-[76px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[7px] align-middle font-mono text-[12.5px] font-semibold text-foreground',
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
                        'truncate font-mono text-[10px] font-semibold leading-none',
                        onSelectOf
                          ? 'text-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-foreground/70'
                          : 'text-secondary-foreground'
                      )}
                      disabled={!onSelectOf}
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
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ferme opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-ferme" />
                      </span>
                    )}
                    {st && (
                      <span
                        className={cn(
                          'shrink-0 cursor-help rounded px-1 py-px font-mono text-[8px] font-bold leading-none',
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
                        className="shrink-0 cursor-help font-mono text-[8px] font-semibold leading-none text-ferme tabular-nums"
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
            className="inline-flex cursor-help items-center gap-1 rounded-md border border-transparent bg-secondary px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground"
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
          'w-[150px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
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
          <div className="flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('size-1.5 shrink-0 rounded-full', VERDICT_DOT[o.verdictKey])} />
              <span className={cn('text-[10px] font-semibold', VERDICT_TEXT[o.verdictKey])}>
                {o.verdictLabel}
              </span>
            </span>
            {/* Pilotage CQ (issue #185) : un blocage derrière une levée de contrôle s'adresse au
                service réception — matière déjà sur site — pas au fournisseur. Le verdict de
                livraison reste dit tel quel (un retard ne se laisse pas repeindre en « CQ ») ;
                `seul` = plus aucun manque résiduel, la levée SUFFIT → pastille ambre pleine. */}
            {o.cq && (
              <span
                className={cn(
                  'inline-flex cursor-help items-center gap-1 whitespace-nowrap font-mono leading-none',
                  o.cq.seul
                    ? 'rounded bg-warning/15 px-1 py-0.5 text-[8.5px] font-bold text-warning'
                    : 'text-[8.5px] font-semibold text-muted-foreground'
                )}
                title={
                  `${o.cq.qty} u en statut Q sur ${o.cq.articles} article${o.cq.articles > 1 ? 's' : ''}. ` +
                  (o.cq.seul
                    ? 'Aucun autre manque : faire lever le contrôle réception suffit à débloquer la ligne.'
                    : "Un manque subsiste par ailleurs — la levée du contrôle n'y suffira pas seule.") +
                  ` ${CQ_ACTION_TITLE}`
                }
              >
                <FlaskConical size={9} strokeWidth={2} className="shrink-0 leading-none" />
                {o.cq.seul ? 'Dépend du CQ' : `CQ ${fr(o.cq.qty)}`}
              </span>
            )}
          </div>
        )
      },
      meta: {
        thClass:
          'w-[120px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[7px] align-middle',
      },
    },
    {
      id: 'chargeHeures',
      enableSorting: false,
      header: 'Charge',
      cell: ({ row }) => {
        // Charge réelle gamme (Σ qteRestante/cadence) des OF de couverture — indépendante
        // du jalonnement CBN. Vide si couverte par stock/achat (pas d'OF) ou gamme inconnue.
        const known = row.original.ofs.filter((of) => of.chargeHeures !== null)
        if (known.length === 0) return null
        const total = known.reduce((sum, of) => sum + (of.chargeHeures ?? 0), 0)
        const h = fr(Math.round(total * 10) / 10)
        return <>{h}h</>
      },
      meta: {
        thClass:
          'w-[70px] px-4 py-[7px] text-right font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[7px] text-right align-middle font-mono text-[12.5px] font-semibold text-secondary-foreground',
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
        if (comps.length === 0) return null
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
                      'shrink-0 font-mono text-[10.5px] font-bold',
                      c.cqSeul
                        ? 'text-warning'
                        : c.descente || c.couvertParOf
                          ? 'text-planifie'
                          : 'text-foreground'
                    )}
                    title={
                      c.cqSeul
                        ? 'Immobilisé au contrôle réception (statut Q) — pas une rupture'
                        : c.descente || c.couvertParOf
                          ? 'Sous-ensemble fabriqué'
                          : undefined
                    }
                  >
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
                  {/* Ni un SE couvert par production ni une pièce immobilisée en statut Q ne
                      sont en manque : pas de signe « − », qui se lirait comme une rupture. */}
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded px-1 font-mono text-[10px] font-semibold tabular-nums',
                      c.cqSeul ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {c.couvertParOf || c.cqSeul ? fr(c.qty) : `−${fr(c.qty)}`}
                  </span>
                </div>
                {/* Descente BOM d'un SE manquant : soit « OF à lancer » (composants dispo),
                    soit les feuilles réellement bloquantes avec leur réception. La lentille
                    réception directe ne s'affiche que pour les composants SANS descente
                    (achetés) — pour un SE elle serait du bruit (pas d'achat sur un fabriqué). */}
                {/* Issue #185 — hiérarchie : quand une part du manque est tenue par le statut Q,
                    l'action « lever le contrôle réception » passe DEVANT la réception
                    fournisseur. `cqSeul` = le Q couvre tout : plus rien d'autre à dire, et
                    surtout aucune arrivée à mettre en avant (elle ne débloquerait rien). */}
                {c.cqSeul ? (
                  <CqLine qty={c.qc} />
                ) : (
                  <>
                    {!c.couvertParOf && c.qc > 0 && <CqLine qty={c.qc} />}
                    {c.couvertParOf ? (
                      <div className="mt-0.5 flex flex-col gap-px font-mono text-[9px] leading-snug text-muted-foreground">
                        {/* Part couverte par du stock sous contrôle qualité — à débloquer par le
                        contrôle réception, pas par la production. */}
                        {c.qc > 0 && <CqLine qty={c.qc} />}
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
                                    {fr(c.couvertParOf.parOf)}
                                  </span>{' '}
                                  sans OF producteur
                                </span>
                              </div>
                            )
                          : /* `of.qty` = part prise sur CET OF, jamais `parOf` (le total) : le
                           dernier OF de la liste n'est presque jamais consommé en entier, et
                           répéter le total faisait dire à un OF d'1 pièce qu'il en fournit 849. */
                            c.couvertParOf.ofs.map((of) => (
                              <div key={of.numOf} className="flex items-center gap-1">
                                <CornerDownRight
                                  size={10}
                                  strokeWidth={1.75}
                                  className="leading-none text-muted-foreground/60"
                                />
                                <span>
                                  <span className="font-bold text-foreground">{fr(of.qty)}</span>{' '}
                                  par <span className="font-bold text-foreground">{of.numOf}</span>
                                  {of.dateFin && (
                                    <span className="text-muted-foreground">
                                      {' '}
                                      (fin {of.dateFin})
                                    </span>
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
                              className="flex flex-col gap-px font-mono text-[9px] leading-snug text-muted-foreground"
                              title={p.desc}
                            >
                              <div className="flex items-center gap-1">
                                <CornerDownRight
                                  size={10}
                                  strokeWidth={1.75}
                                  className="leading-none text-muted-foreground/60"
                                />
                                <span>
                                  Bloqué par{' '}
                                  <span className="font-bold text-foreground">{p.art}</span>{' '}
                                  <span className="font-bold text-muted-foreground">
                                    −{fr(p.manque)}
                                  </span>
                                </span>
                              </div>
                              {p.reception ? (
                                <div
                                  className={cn(
                                    'flex items-center gap-0.5 pl-3.5 text-[8.5px] font-medium',
                                    // Même règle que la lentille composant : rouge = après l'expé.
                                    p.reception.apresExpedition
                                      ? 'font-bold text-destructive'
                                      : p.reception.overdue
                                        ? 'font-bold text-foreground'
                                        : 'text-muted-foreground/80'
                                  )}
                                  title={
                                    (p.reception.apresExpedition
                                      ? `Arrive après l'expédition de la commande (${row.original.dateExp}) — `
                                      : '') + p.reception.supplier
                                  }
                                >
                                  <DynamicIcon
                                    name={
                                      p.reception.apresExpedition || p.reception.overdue
                                        ? 'warning'
                                        : 'local_shipping'
                                    }
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
                                <div className="flex items-center gap-0.5 pl-3.5 text-[8.5px] font-medium text-muted-foreground/60">
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
                            <div className="pl-3.5 font-mono text-[8.5px] font-medium text-muted-foreground/70">
                              +{c.descente.par.length - 3} autre(s)
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-semibold leading-none text-muted-foreground">
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
                          'mt-0.5 flex items-center gap-1 font-mono text-[9px] leading-none',
                          // Rouge = la pièce arrive APRÈS la date d'expé de la commande :
                          // même « à l'heure » fournisseur, elle ne la servira pas à temps.
                          c.reception.apresExpedition
                            ? 'font-bold text-destructive'
                            : c.reception.overdue
                              ? 'font-bold text-foreground'
                              : 'font-medium text-muted-foreground'
                        )}
                        title={
                          (c.reception.apresExpedition
                            ? `Arrive après l'expédition de la commande (${row.original.dateExp}) — `
                            : '') + `Fournisseur: ${c.reception.supplier}`
                        }
                      >
                        <DynamicIcon
                          name={
                            c.reception.apresExpedition || c.reception.overdue
                              ? 'warning'
                              : 'local_shipping'
                          }
                          size={11}
                          strokeWidth={1.75}
                          className="leading-none opacity-80"
                        />
                        {/* Couverture partagée (issue #185) : la réception ne tient que le manque
                        RÉSIDUEL, celui que le statut Q ne couvre pas. On l'annonce avec sa
                        quantité pour que les deux parts se lisent d'un coup d'œil — « 779 en
                        statut Q » au-dessus, « 108 par l'arrivée CG2601882 » ici. */}
                        <span>
                          {c.qc > 0 && (
                            <span className="font-bold">{fr(c.qty)} par l&apos;arrivée </span>
                          )}
                          {c.reception.overdue
                            ? `${c.qc > 0 ? `${c.reception.po} — en retard` : 'En retard'} +${c.reception.retardJ} j (${c.reception.eta})`
                            : c.qc > 0
                              ? `${c.reception.po} (${c.reception.eta})`
                              : `Arrivée ${c.reception.eta} · ${c.reception.po}`}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-medium text-muted-foreground/60">
                        <CalendarX
                          size={11}
                          strokeWidth={1.75}
                          className="leading-none text-muted-foreground/50"
                        />
                        Aucune couverture prévue
                      </div>
                    )}
                  </>
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
          'w-[300px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
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
      'w-[38px] px-4 py-[7px] text-left font-sans text-[10px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
    tdClass: (row: ProactiveDisplayRow) => {
      // blocked / uncov : pas un retard calendaire mais un vrai problème → rouge foncé.
      // late : utilise la gravité (tolerance/critical).
      const s =
        row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
          ? ('critical' as const)
          : row.lateSeverity
      return cn(
        'px-4 py-[7px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(s)
      )
    },
  }
}

/**
 * Contrat de diff de la vue proactive (issue #186) — déclaratif, co-localisé
 * avec les colonnes qu'il décrit : ajouter une colonne sans lui donner ici son
 * extracteur, c'est simplement ne jamais la voir flasher.
 *
 * Les identifiants sont ceux des `ColumnDef` ci-dessus (`id ?? accessorKey`) :
 * c'est ce qui permet au DataTable de poser le flash sur la BONNE cellule sans
 * table de correspondance. Chaque extracteur rend ce que la cellule MONTRE —
 * pas la ligne entière : comparer l'objet complet ferait flasher les 10
 * colonnes dès qu'un champ invisible bouge.
 */
export const PROACTIVE_DIFF_FIELDS: Record<string, (row: ProactiveDisplayRow) => unknown> = {
  numCommande: (r) => `${r.numCommande}|${r.client}|${r.refCommandeClient ?? ''}`,
  article: (r) => `${r.article}|${r.designation}|${r.refArticleClient ?? ''}`,
  type: (r) => r.type,
  poste: (r) => `${r.poste}|${r.posteLabel}`,
  qteRestante: (r) => r.qteRestante,
  dateExp: (r) => r.dateExpIso ?? r.dateExp,
  // Couverture : le n° et le statut X3 de chaque OF + la quantité qu'il porte.
  // Les pièces déjà faites sont volontairement HORS comparaison — elles bougent
  // à chaque pointage d'atelier et feraient clignoter la colonne en permanence.
  couverture: (r) =>
    `${r.couverture}#${r.ofs.map((o) => `${o.numOf}:${o.statutNum}:${o.qteAllouee}:${o.feasible}`).join(',')}`,
  verdictKey: (r) => `${r.verdictKey}|${r.cq ? `${r.cq.qty}:${r.cq.articles}:${r.cq.seul}` : ''}`,
  chargeHeures: (r) => r.ofs.reduce((sum, o) => sum + (o.chargeHeures ?? 0), 0),
  // Composants en rupture : article + manque + ETA de la réception couvrante.
  // Le détail de la descente BOM n'entre pas dans la comparaison (il dérive des
  // mêmes manques et gonflerait la sérialisation sans rien ajouter au signal).
  composants: (r) =>
    r.composants
      .map((c) => `${c.art}:${c.qty}:${c.qc}:${c.cqSeul}:${c.reception?.eta ?? ''}`)
      .join(','),
}
