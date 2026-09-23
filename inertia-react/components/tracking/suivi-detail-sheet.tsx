/**
 * Diagnostic de ligne (drawer latéral) — Fiche opérationnelle épurée
 * centrée sur la traçabilité commande, les ruptures composants / approvisionnements,
 * le statut qualité et les OFs de couverture.
 */
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarX,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Factory,
  FlaskConical,
  Package,
  Truck,
  MapPin,
} from 'lucide-react'
import { BADGE_TONE, VERDICT_TONE, OF_STATUT } from '@r/lib/suivi/tracking-shared'
import type { SuiviDisplayRow, ProactiveDisplayRow, EntreeCq } from '@r/lib/suivi/types'

export interface SuiviDetailSheetProps {
  type: 'reactif' | 'proactif'
  row: SuiviDisplayRow | ProactiveDisplayRow
  onSelectOf?: (numOf: string) => void
  onSelectPoste?: (posteCode: string) => void
}

type EntreesCqState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; articles: Record<string, EntreeCq[]> }

/**
 * Stock statut Q des composants, daté de son entrée — chargé à l'ouverture du détail
 * proactif (quelques articles, requête X3 ciblée). Clé = liste d'articles triée.
 */
function useEntreesCq(articles: string[]): EntreesCqState | null {
  const key = [...articles].sort().join(',')
  const [state, setState] = useState<EntreesCqState | null>(null)
  useEffect(() => {
    if (!key) {
      setState(null)
      return
    }
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    fetch(`${route('status.entrees_cq')}?articles=${encodeURIComponent(key)}`, {
      signal: ctrl.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { articles: Record<string, EntreeCq[]> }) =>
        setState({ status: 'ok', articles: data.articles })
      )
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: 'error' })
      })
    return () => ctrl.abort()
  }, [key])
  return state
}

/** Entrées en stock statut Q d'un composant : depuis quand la matière attend le CQ. */
function EntreesCqList({ state, article }: { state: EntreesCqState | null; article: string }) {
  if (!state) return null
  if (state.status === 'loading') {
    return <div className="px-2.5 text-3xs text-muted-foreground">Dates d'entrée en stock…</div>
  }
  if (state.status === 'error') {
    return (
      <div className="px-2.5 text-3xs text-muted-foreground">
        Dates d'entrée en stock indisponibles (X3).
      </div>
    )
  }
  const entrees = state.articles[article] ?? []
  if (entrees.length === 0) return null
  return (
    <div className="rounded border border-warning/30 bg-warning/5 p-2 space-y-1">
      <div className="text-3xs font-extrabold uppercase tracking-wider text-warning">
        En attente CQ depuis
      </div>
      {entrees.map((e, idx) => (
        <div
          key={`${e.emplacement}-${e.hum ?? ''}-${idx}`}
          className="flex items-center justify-between gap-2 text-2xs"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span className="font-mono font-bold text-foreground">
              {e.dateEntree ?? 'date inconnue'}
            </span>
            {e.ageJours !== null && (
              <span className="font-mono font-bold text-warning">({e.ageJours} j)</span>
            )}
            <span className="truncate">
              {e.origine
                ? e.origine.type === 'reception'
                  ? `Réception ${e.origine.piece}${e.origine.tiers ? ` · fourn. ${e.origine.tiers}` : ''}`
                  : `Production ${e.origine.piece}`
                : e.emplacement}
            </span>
          </span>
          <span className="shrink-0 font-mono font-semibold text-foreground">
            {e.qte} u{e.origine ? ` · ${e.emplacement}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function SuiviDetailSheet({ type, row, onSelectOf, onSelectPoste }: SuiviDetailSheetProps) {
  const isReactif = type === 'reactif'
  const reactiveRow = row as SuiviDisplayRow
  const proactiveRow = row as ProactiveDisplayRow

  const articlesCq = useMemo(
    () =>
      isReactif
        ? []
        : proactiveRow.composants.filter((c) => c.qc > 0 || c.cqSeul).map((c) => c.art),
    [isReactif, proactiveRow.composants]
  )
  const entreesCq = useEntreesCq(articlesCq)

  const late = isReactif ? reactiveRow.late : proactiveRow.joursRetard > 0
  const lateDays = isReactif ? reactiveRow.lateDays : proactiveRow.joursRetard

  // Quantités :
  // En vue proactive, qteRestante correspond au reste à fabriquer / couvrir (après
  // déduction de l'allocation stock ERP qteAllouee). Le total de la commande est donc
  // qteAllouee + qteRestante.
  const alloueStock = isReactif ? reactiveRow.allocStrict : (proactiveRow.qteAllouee ?? 0)
  const allocCq = isReactif ? reactiveRow.allocCq : 0
  const resteAFabriquer = isReactif
    ? Math.max(0, reactiveRow.qteRestante - alloueStock - allocCq)
    : proactiveRow.qteRestante
  const reliquatNonCouvert = isReactif ? resteAFabriquer : proactiveRow.reliquat
  const couvertOf = isReactif ? 0 : Math.max(0, proactiveRow.qteRestante - proactiveRow.reliquat)

  const totalLigne = isReactif
    ? reactiveRow.qteRestante || 1
    : Math.max(1, alloueStock + proactiveRow.qteRestante)

  const pctAlloue = Math.min(100, Math.round((alloueStock / totalLigne) * 100))
  const pctCq = Math.min(100 - pctAlloue, Math.round((allocCq / totalLigne) * 100))
  const pctCouvertOf = Math.min(100 - pctAlloue - pctCq, Math.round((couvertOf / totalLigne) * 100))
  const pctReliquat = Math.max(0, 100 - pctAlloue - pctCq - pctCouvertOf)

  return (
    <div className="flex flex-col gap-5 pb-8 pt-2 text-sans">
      {/* ═══ 1. Fiche Commande & Contexte Synthétique ═══ */}
      <div className="rounded-lg border border-rule bg-card p-4 space-y-3.5">
        {/* Ligne 1 : Badges d'identité */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-rule bg-secondary/50 px-2.5 py-1 font-mono text-xs font-bold text-foreground">
              {row.numCommande}
            </span>
            <span className="rounded-full border border-brand/20 bg-brand-soft px-2 py-0.5 font-mono text-3xs font-extrabold uppercase text-brand">
              {row.type}
            </span>
            {row.refCommandeClient && (
              <span className="font-mono text-2xs text-muted-foreground">
                Réf ext :{' '}
                <span className="font-semibold text-foreground">{row.refCommandeClient}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isReactif ? (
              <span
                className={cn(
                  'rounded px-2 py-0.5 font-mono text-2xs font-extrabold uppercase',
                  BADGE_TONE[reactiveRow.statusKey]
                )}
              >
                {reactiveRow.statusLabel}
              </span>
            ) : (
              <span
                className={cn(
                  'rounded px-2 py-0.5 font-mono text-2xs font-extrabold uppercase',
                  VERDICT_TONE[proactiveRow.verdictKey]
                )}
              >
                {proactiveRow.verdictLabel}
              </span>
            )}
            {late && (
              <span className="flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-3xs font-bold text-destructive">
                <Clock size={11} />+{lateDays}j
              </span>
            )}
          </div>
        </div>

        {/* Ligne 2 : Client & Atelier / Poste */}
        <div className="grid grid-cols-2 gap-3 border-t border-rule-soft pt-3 text-xs">
          <div>
            <span className="block text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Client
            </span>
            <span className="font-semibold text-foreground">{row.client}</span>
          </div>
          <div>
            <span className="block text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Atelier & Poste
            </span>
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <span>{row.atelierLabel || row.atelier || '—'}</span>
              {row.poste && (
                <>
                  <span className="text-muted-foreground">·</span>
                  {onSelectPoste ? (
                    <button
                      type="button"
                      onClick={() => onSelectPoste(row.poste)}
                      className="font-mono text-2xs font-bold text-brand hover:underline"
                      title="Voir la charge du poste"
                    >
                      {row.poste}
                    </button>
                  ) : (
                    <span className="font-mono text-2xs font-bold text-muted-foreground">
                      {row.poste}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Ligne 3 : Article & Désignation */}
        <div className="border-t border-rule-soft pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
              Article
            </span>
            {row.dateExp && (
              <span className="text-2xs text-muted-foreground">
                Expédition promise :{' '}
                <span className="font-mono font-bold text-foreground">{row.dateExp}</span>
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-xs font-bold text-brand">{row.article}</span>
            {row.refArticleClient && row.refArticleClient !== row.article && (
              <span className="rounded bg-secondary/60 px-1.5 py-px font-mono text-3xs text-muted-foreground">
                Réf client : {row.refArticleClient}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-secondary-foreground leading-relaxed">
            {row.designation || '—'}
          </div>
        </div>

        {/* Ligne 4 : Barre d'allocation compacte */}
        <div className="border-t border-rule-soft pt-3 space-y-1.5">
          <div className="flex items-center justify-between text-2xs">
            <span className="font-semibold text-foreground">
              Quantités : <span className="font-mono">{alloueStock}</span> /{' '}
              <span className="font-mono">{totalLigne}</span> u allouées ({pctAlloue}%)
            </span>
            <span className="font-mono text-muted-foreground">
              {!isReactif ? (
                resteAFabriquer > 0 ? (
                  reliquatNonCouvert > 0 ? (
                    <span className="text-destructive font-semibold">
                      Reliquat : {reliquatNonCouvert} u
                    </span>
                  ) : (
                    <span>Reste à fabriquer : {resteAFabriquer} u</span>
                  )
                ) : (
                  <span className="text-ferme font-semibold">Entièrement allouée</span>
                )
              ) : (
                <span>Reste à livrer : {reliquatNonCouvert} u</span>
              )}
            </span>
          </div>
          <div className="relative flex h-2 w-full overflow-hidden rounded-full border border-rule-soft bg-secondary">
            {pctAlloue > 0 && (
              <div
                className="h-full bg-ferme transition-all duration-300"
                style={{ width: `${pctAlloue}%` }}
                title={`Alloué en stock : ${alloueStock} u`}
              />
            )}
            {pctCq > 0 && (
              <div
                className="h-full bg-warning transition-all duration-300"
                style={{ width: `${pctCq}%` }}
                title={`Sous contrôle qualité : ${allocCq} u`}
              />
            )}
            {pctCouvertOf > 0 && (
              <div
                className="h-full bg-planifie transition-all duration-300"
                style={{ width: `${pctCouvertOf}%` }}
                title={`Couvert par OF : ${couvertOf} u`}
              />
            )}
            {pctReliquat > 0 && (
              <div
                className="h-full bg-secondary transition-all duration-300"
                style={{ width: `${pctReliquat}%` }}
                title={`Reliquat non couvert : ${reliquatNonCouvert} u`}
              />
            )}
          </div>
        </div>
      </div>

      {/* ═══ 2. Alerte Contrôle Qualité (si applicable) ═══ */}
      {!isReactif && proactiveRow.cq && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-warning">
            <FlaskConical size={16} strokeWidth={1.75} />
            <span>
              {proactiveRow.cq.articles} composant{proactiveRow.cq.articles > 1 ? 's' : ''} sous
              contrôle qualité ({proactiveRow.cq.qty} u)
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {proactiveRow.cq.seul
              ? 'La matière est physiquement sur site. Lever le contrôle réception suffit à débloquer entièrement la commande (aucun retard fournisseur).'
              : 'Ces quantités sont présentes sur site mais immobilisées en statut Q. Un manque résiduel subsiste par ailleurs.'}
          </p>
          <div className="text-2xs font-bold text-warning">
            Action : contacter le contrôle réception pour libérer le lot.
          </div>
        </div>
      )}

      {/* ═══ 3. Ruptures de Composants & Approvisionnements (Vue proactive) ═══ */}
      {!isReactif && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
              <Truck size={14} className="text-muted-foreground" />
              Composants goulots ({proactiveRow.composants.length})
            </h4>
            <span className="text-3xs text-muted-foreground">Impact sur la faisabilité</span>
          </div>

          {proactiveRow.composants.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-rule bg-secondary/15 px-3.5 py-3 text-xs text-muted-foreground">
              <CheckCircle2 size={15} className="text-ferme shrink-0" />
              <span>Aucun composant en rupture identifié pour cette commande.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {proactiveRow.composants.map((c) => (
                <div
                  key={c.art}
                  className="rounded-lg border border-rule bg-card p-3 space-y-2.5 shadow-sm"
                >
                  {/* Entête du composant */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'font-mono text-xs font-bold',
                            c.cqSeul ? 'text-warning' : 'text-destructive'
                          )}
                        >
                          {c.art}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-3xs font-bold',
                            c.cqSeul
                              ? 'bg-warning/15 text-warning'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {c.cqSeul ? `${c.qty} u sous CQ` : `−${c.qty} u manquant`}
                        </span>
                      </div>
                      <div className="mt-0.5 text-2xs text-muted-foreground">{c.desc}</div>
                    </div>
                  </div>

                  {/* Statut Q partiel */}
                  {c.qc > 0 && !c.cqSeul && (
                    <div className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/5 px-2.5 py-1 text-2xs font-medium text-warning">
                      <FlaskConical size={12} />
                      <span>{c.qc} u présentes sur site mais immobilisées en statut Q</span>
                    </div>
                  )}

                  {/* Date d'entrée du stock statut Q — pour challenger le contrôle réception */}
                  {(c.qc > 0 || c.cqSeul) && <EntreesCqList state={entreesCq} article={c.art} />}

                  {/* Acheminement / Commande d'achat fournisseur */}
                  {c.reception ? (
                    <div className="rounded border border-rule bg-secondary/30 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Package size={13} className="text-muted-foreground" />
                          Commande fournisseur :{' '}
                          <span className="font-mono font-bold text-brand">{c.reception.po}</span>
                        </span>
                        {c.reception.overdue ? (
                          <span className="flex items-center gap-1 font-mono text-3xs font-bold text-destructive">
                            <AlertTriangle size={12} />
                            Retard (+{c.reception.retardJ}j)
                          </span>
                        ) : (
                          <span className="text-3xs text-muted-foreground">En acheminement</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 border-t border-rule-soft pt-1.5 text-2xs text-muted-foreground">
                        <div>
                          Fournisseur :{' '}
                          <span className="font-medium text-foreground">
                            {c.reception.supplier}
                          </span>
                        </div>
                        <div className="text-right">
                          Arrivée prévue :{' '}
                          <span className="font-mono font-bold text-foreground">
                            {c.reception.eta}
                          </span>
                        </div>
                      </div>

                      {c.reception.apresExpedition && (
                        <div className="flex items-center gap-1 rounded bg-destructive/5 px-2 py-0.5 text-3xs font-semibold text-destructive">
                          <AlertCircle size={11} />
                          L'ETA arrive après l'expédition promise de la commande.
                        </div>
                      )}
                    </div>
                  ) : !c.descente && !c.cqSeul ? (
                    <div className="flex items-center gap-1.5 rounded border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-2xs text-destructive">
                      <CalendarX size={13} />
                      <span>Aucune commande d'achat de couverture identifiée dans l'ERP.</span>
                    </div>
                  ) : null}

                  {/* Décomposition de sous-ensemble */}
                  {c.descente && (
                    <div className="rounded border border-rule bg-secondary/20 p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <CornerDownRight size={13} />
                          Sous-ensemble
                        </span>
                        {c.descente.statut === 'se_a_lancer' ? (
                          <span className="flex items-center gap-1 text-3xs font-bold text-ferme">
                            <CheckCircle2 size={12} />
                            Composants prêts · Prêt à lancer
                          </span>
                        ) : (
                          <span className="text-3xs font-bold text-destructive">
                            Bloqué en cascade
                          </span>
                        )}
                      </div>

                      {c.descente.statut === 'bloque' && (
                        <div className="space-y-2 border-l border-rule pl-2.5">
                          {c.descente.par.map((p) => (
                            <div key={p.art} className="space-y-0.5 text-2xs text-muted-foreground">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-destructive">
                                  {p.art}
                                </span>
                                <span className="font-mono font-bold text-destructive">
                                  −{p.manque} u
                                </span>
                              </div>
                              <div className="text-3xs">{p.desc}</div>
                              {p.reception ? (
                                <div className="font-mono text-3xs text-foreground/80">
                                  PO : {p.reception.po} · ETA : {p.reception.eta}{' '}
                                  {p.reception.overdue && `(+${p.reception.retardJ}j)`}
                                </div>
                              ) : (
                                <div className="text-3xs text-destructive">Pas d'achat prévu</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ 4. Couverture & Ordres de Fabrication ═══ */}
      {!isReactif && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
              <Factory size={14} className="text-muted-foreground" />
              Couverture de fabrication ({proactiveRow.ofs.length})
            </h4>
            <span className="text-3xs text-muted-foreground">Mode : {proactiveRow.couverture}</span>
          </div>

          {proactiveRow.ofs.length === 0 ? (
            <div className="rounded-lg border border-rule bg-secondary/15 p-3 text-xs text-muted-foreground">
              Couverture assurée par :{' '}
              <span className="font-semibold text-foreground">{proactiveRow.couverture}</span>
            </div>
          ) : (
            <div className="space-y-2">
              {proactiveRow.ofs.map((of) => {
                const st = OF_STATUT[of.statutNum]
                return (
                  <div
                    key={of.numOf}
                    className="rounded-lg border border-rule bg-card p-3 space-y-2 transition-colors hover:border-brand/40 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {of.numOf}
                        </span>
                        {of.estDebuté && (
                          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-3xs font-extrabold uppercase text-brand">
                            En cours
                          </span>
                        )}
                        {st && (
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 font-mono text-3xs font-bold uppercase',
                              st.tone
                            )}
                          >
                            {st.tag}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {of.feasible !== null && (
                          <span
                            className={cn(
                              'text-2xs font-bold',
                              of.feasible ? 'text-ferme' : 'text-destructive'
                            )}
                          >
                            {of.feasible ? 'Faisable' : 'Rupture'}
                          </span>
                        )}
                        {onSelectOf && (
                          <button
                            type="button"
                            onClick={() => onSelectOf(of.numOf)}
                            className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-2xs font-semibold text-foreground transition-colors hover:bg-brand-soft hover:text-brand cursor-pointer"
                            title="Ouvrir le diagnostic complet et l'affermissement de l'OF"
                          >
                            <span>Détail OF</span>
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-rule-soft pt-2 text-2xs text-muted-foreground">
                      <div>
                        <span className="block text-3xs uppercase">Article</span>
                        <span className="font-mono font-medium text-foreground">{of.article}</span>
                      </div>
                      <div>
                        <span className="block text-3xs uppercase">Fin prévue</span>
                        <span className="font-mono font-medium text-foreground">
                          {of.dateFin || '—'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-3xs uppercase">Quantité allouée</span>
                        <span className="font-mono font-medium text-foreground">
                          {of.qteAllouee} u
                        </span>
                      </div>
                    </div>

                    {/* Avancement si pointages existants */}
                    {of.piecesFaites !== null &&
                      of.piecesTotalOf !== null &&
                      of.piecesTotalOf > 0 && (
                        <div className="flex items-center justify-between border-t border-rule-soft pt-1.5 text-3xs text-muted-foreground">
                          <span>Avancement fabrication</span>
                          <span className="font-mono font-semibold text-foreground">
                            {of.piecesFaites} / {of.piecesTotalOf} u (
                            {Math.round((of.piecesFaites / of.piecesTotalOf) * 100)}%)
                          </span>
                        </div>
                      )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ 5. Mode Réactif — Cause & Emplacements ═══ */}
      {isReactif && (
        <>
          {reactiveRow.cause && (
            <div className="rounded-lg border border-rule bg-card p-3.5 space-y-1">
              <div className="text-3xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Cause identifiée
              </div>
              <div className="text-xs font-bold text-foreground">{reactiveRow.cause.label}</div>
            </div>
          )}

          {reactiveRow.emplacements.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                <MapPin size={14} className="text-muted-foreground" />
                Emplacements physiques ({reactiveRow.emplacements.length})
              </h4>
              <div className="space-y-1.5">
                {reactiveRow.emplacements.map((emp, idx) => (
                  <div
                    key={`${emp.nom}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-rule bg-card p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground">{emp.nom}</span>
                      {emp.enZoneExpe && (
                        <span className="rounded bg-suggere/15 px-1.5 py-0.5 text-3xs font-bold text-suggere">
                          Zone Expé
                        </span>
                      )}
                      {emp.hum && (
                        <span className="font-mono text-3xs text-muted-foreground">
                          Pal : {emp.hum}
                        </span>
                      )}
                      {emp.dateMiseEnStock && (
                        <span
                          className="font-mono text-3xs text-muted-foreground"
                          title={
                            emp.hum
                              ? "Date d'entrée en stock de la palette"
                              : "Sans HUM, X3 regroupe les entrées successives sur une même ligne : c'est la date de la plus récente"
                          }
                        >
                          {emp.hum ? 'Entrée' : 'Dern. entrée'} : {emp.dateMiseEnStock}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-foreground">{emp.qte} u</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SuiviDetailSheet
