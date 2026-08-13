import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { cn } from '@r/lib/utils'
import { X3Link } from '@r/components/x3-link'
import type { PlanDiff, DiffSens } from '@r/lib/scenario/types'

/**
 * Constat d'impact d'un scénario (issue #57, moteur étage 2). Quatre axes signés :
 * client (promesses) / appro (couvertures + verdicts de calage) / allocation
 * (re-matching) / charge (poste × semaine).
 *
 * Principe acté (vision §5) : CONSTAT, pas prescription — on liste, l'humain décide.
 *
 * Redesign 2026-07-26 (validé sur design/showcase/scenario-redesign.html, onglet
 * « Étude d'impact ») : lecture verdict-d'abord —
 * • bande bilan en tête (deux grands chiffres tabulaires, aucun éditorial inventé) ;
 * • hypothèse testée + réponse CTP marquées neutres, hors bilan (flux ADV :
 *   c'est la question posée, pas un impact) ;
 * • sections pleines dépliées, sections vides repliées en une ligne de pied —
 *   le constat se concentre sur ce qui bouge.
 */

const sensClass = (s: DiffSens) => (s === 'degradation' ? 'text-destructive' : 'text-ferme')

const fmtDelta = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

/** jj/mm/aaaa — jamais d'ISO brut à l'écran. */
const fmtJour = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR')
}

interface ScenarioDiffSheetProps {
  diff: PlanDiff | null
  open: boolean
  onOpenChange: (v: boolean) => void
  loading: boolean
  evaluatedAt: string | null
  dataAt: string | null
}

export function ScenarioDiffSheet({
  diff,
  open,
  onOpenChange,
  loading,
  evaluatedAt,
  dataAt,
}: ScenarioDiffSheetProps) {
  const fmtStamp = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  // Titres des axes vides, pour la ligne repliée en pied de constat.
  const emptyAxes = diff
    ? (
        [
          ['Client — promesses', diff.client.length],
          ['Appro — couvertures composants', diff.appro.length],
          ['Appro — verdicts de calage', diff.approVerdicts?.length ?? 0],
          ['Allocation — re-matching', diff.allocation.length],
          ['Charge — poste × semaine', diff.charge.length],
        ] as const
      )
        .filter(([, n]) => n === 0)
        .map(([t]) => t)
    : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto bg-background text-foreground sm:max-w-2xl">
        <SheetTitle className="font-fraunces text-[18px] font-extrabold tracking-tight">
          Étude d'impact
        </SheetTitle>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Évalué le {fmtStamp(evaluatedAt)} · sur données du {fmtStamp(dataAt)}
        </p>

        {loading ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">Évaluation…</div>
        ) : !diff ? (
          <div className="py-10 text-center text-[13px] italic text-muted-foreground">
            Aucun impact calculé.
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Bande bilan — les nombres d'abord, dérivés de diff.stats, aucun
                éditorial inventé. */}
            <div className="flex items-center gap-7 rounded-[14px] bg-muted px-5 py-3.5">
              <div>
                <div className="text-[28px] font-extrabold leading-none tabular-nums text-destructive">
                  {diff.stats.degradations}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Dégradation{diff.stats.degradations > 1 ? 's' : ''}
                </div>
              </div>
              <div>
                <div className="text-[28px] font-extrabold leading-none tabular-nums text-ferme">
                  {diff.stats.ameliorations}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Amélioration{diff.stats.ameliorations > 1 ? 's' : ''}
                </div>
              </div>
              <span className="ml-auto whitespace-nowrap rounded-full border border-rule bg-background px-3 py-1 text-[11px] font-bold tabular-nums text-muted-foreground">
                5 axes évalués
              </span>
            </div>

            {/* Sujet de l'étude : hypothèse(s) injectée(s) + réponse CTP. Constat
                neutre, hors bilan (flux ADV : c'est la question posée, pas un impact). */}
            {diff.sujet && diff.sujet.length > 0 && (
              <div className="space-y-1 rounded-[10px] border border-dashed border-input bg-muted/40 px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Hypothèse testée · réponse CTP (hors bilan)
                </p>
                {diff.sujet.map((s, i) => (
                  <div key={`sujet-${i}`} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-mono text-[11px] font-bold tabular-nums">
                      {s.numCommande}
                      {s.ligne ? `#${s.ligne}` : ''}
                    </span>
                    <span className="text-muted-foreground">
                      {s.article}
                      {s.client ? ` · ${s.client}` : ''}
                      {s.quantite != null ? ` · ${s.quantite} u` : ''}
                      {s.date ? ` · besoin ${fmtJour(s.date)}` : ''}
                    </span>
                    <span className="ml-auto font-extrabold text-foreground">
                      → {s.statut}
                      {s.joursRetard > 0 ? ` (+${s.joursRetard} j)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Réaction d'offre (#58) : l'ordre que la demande testée déclencherait. C'est
                LUI qui consomme la nomenclature — donc lui qui alimente les axes ci-dessous.
                Même statut neutre que l'hypothèse : ce n'est pas un impact, c'est sa cause. */}
            {diff.offreVirtuelle && diff.offreVirtuelle.length > 0 && (
              <div className="space-y-2.5 rounded-[10px] border border-dashed border-input bg-muted/40 px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ordre déclenché · consomme la nomenclature
                </p>
                {diff.offreVirtuelle.map((o) => (
                  <div key={o.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {o.type === 'of' ? 'OF' : 'Achat'}
                      </span>
                      <span className="font-mono text-[11px] font-bold tabular-nums">{o.id}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {o.article} · {o.quantite} u ·{' '}
                        {o.type === 'of' ? 'lancer le' : 'commander le'} {fmtJour(o.dateDebut)} →{' '}
                        dispo {fmtJour(o.dateFin)} ({o.delai} j)
                        {o.poste ? ` · ${o.poste}` : ''}
                        {o.heures ? ` · ${o.heures} h` : ''}
                      </span>
                      {o.lancementDepasse && (
                        <span className="ml-auto rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-destructive">
                          Lancement dépassé
                        </span>
                      )}
                    </div>
                    {o.composants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {o.composants.map((c) => (
                          <span
                            key={`${o.id}-${c.article}`}
                            className={cn(
                              'rounded-[6px] border bg-background px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                              c.manquant > 0
                                ? 'border-destructive/40 font-bold text-destructive'
                                : 'border-rule text-muted-foreground'
                            )}
                          >
                            {c.article} · {c.besoin} u
                            {c.manquant > 0 ? ` · manque ${c.manquant}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Axe client — promesses */}
            {diff.client.length > 0 && (
              <Section title="Client — promesses" count={diff.client.length}>
                {diff.client.map((e, i) => (
                  <Row key={`client-${i}`} sens={e.sens}>
                    <X3Link
                      fonction="GESSOH"
                      cle={e.numCommande}
                      title={`Ouvrir la commande ${e.numCommande} dans Sage X3`}
                      className="font-mono text-[11px] font-bold tabular-nums"
                    >
                      {e.numCommande}
                      {e.ligne ? `#${e.ligne}` : ''}
                    </X3Link>
                    <span className="text-muted-foreground">
                      {e.article} · {e.client}
                    </span>
                    <span className={cn('ml-auto font-extrabold tabular-nums', sensClass(e.sens))}>
                      {e.disparue && <>hors plan · </>}
                      {e.statutAvant ?? '—'} → {e.statutApres ?? '—'}
                      {e.deltaJours !== 0 && <> ({fmtDelta(e.deltaJours, ' j')})</>}
                    </span>
                  </Row>
                ))}
              </Section>
            )}

            {/* Axe appro — couvertures composants */}
            {diff.appro.length > 0 && (
              <Section title="Appro — couvertures composants" count={diff.appro.length}>
                {diff.appro.map((e, i) => (
                  <Row key={`appro-${i}`} sens={e.sens}>
                    <span className="font-mono text-[11px] font-bold tabular-nums">
                      {e.composant}
                    </span>
                    <span className="text-muted-foreground">{e.ofs.length} OF</span>
                    <span className={cn('ml-auto font-extrabold tabular-nums', sensClass(e.sens))}>
                      manquant {e.manquantAvant} → {e.manquantApres} ({fmtDelta(e.delta, '')})
                    </span>
                  </Row>
                ))}
              </Section>
            )}

            {/* Axe appro — verdicts de calage (cartes enrichies : badge + 2 lignes) */}
            {(diff.approVerdicts?.length ?? 0) > 0 && (
              <Section title="Appro — verdicts de calage" count={diff.approVerdicts?.length ?? 0}>
                {diff.approVerdicts?.map((v, i) => {
                  const sens: 'degradation' | 'amelioration' =
                    v.verdict === 'recalable' ? 'amelioration' : 'degradation'
                  const label =
                    v.verdict === 'inevitable'
                      ? 'Rupture inévitable'
                      : v.verdict === 'recalable'
                        ? 'Appro à re-caler'
                        : 'Stock dormant'
                  const badgeClass =
                    v.verdict === 'inevitable'
                      ? 'bg-destructive/10 text-destructive'
                      : v.verdict === 'recalable'
                        ? 'bg-suggere/10 text-suggere'
                        : 'bg-muted text-foreground/80'
                  return (
                    <Row key={`verdict-${i}`} sens={sens}>
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex w-full items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold tabular-nums">
                            {v.composant}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}
                          >
                            {label}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          Sur {v.numOf} ·{' '}
                          {v.nouveau ? (
                            <>Besoin créé le {fmtJour(v.dateApres)}</>
                          ) : (
                            <>
                              Besoin {fmtJour(v.dateAvant)} → {fmtJour(v.dateApres)}
                            </>
                          )}{' '}
                          · Qté {v.quantite} u{v.manquant > 0 && <> · manque {v.manquant} u</>}{' '}
                          (délai {v.reorderDelay} j)
                        </span>
                      </div>
                    </Row>
                  )
                })}
              </Section>
            )}

            {/* Axe allocation — re-matching */}
            {diff.allocation.length > 0 && (
              <Section title="Allocation — re-matching" count={diff.allocation.length}>
                {diff.allocation.map((e, i) => (
                  <Row key={`alloc-${i}`} sens={e.sens}>
                    <X3Link
                      fonction="GESSOH"
                      cle={e.numCommande}
                      title={`Ouvrir la commande ${e.numCommande} dans Sage X3`}
                      className="font-mono text-[11px] font-bold tabular-nums"
                    >
                      {e.numCommande}
                      {e.ligne ? `#${e.ligne}` : ''}
                    </X3Link>
                    <span className="text-muted-foreground">{e.article}</span>
                    <span
                      className={cn(
                        'ml-auto text-right font-extrabold tabular-nums',
                        sensClass(e.sens)
                      )}
                    >
                      {e.perd.length > 0 && <>perd {e.perd.join(', ')} </>}
                      {e.gagne.length > 0 && <>· gagne {e.gagne.join(', ')} </>}
                      {e.deltaReliquat !== 0 && <> ({fmtDelta(e.deltaReliquat, ' u')})</>}
                    </span>
                  </Row>
                ))}
              </Section>
            )}

            {/* Axe charge — poste × semaine */}
            {diff.charge.length > 0 && (
              <Section title="Charge — poste × semaine" count={diff.charge.length}>
                {diff.charge.map((e, i) => (
                  <Row
                    key={`charge-${i}`}
                    sens={e.deltaHeures > 0 ? 'degradation' : 'amelioration'}
                  >
                    <span className="font-mono text-[11px] font-bold tabular-nums">{e.poste}</span>
                    <span className="text-muted-foreground">semaine du {fmtJour(e.semaine)}</span>
                    <span
                      className={cn(
                        'ml-auto font-extrabold tabular-nums',
                        sensClass(e.deltaHeures > 0 ? 'degradation' : 'amelioration')
                      )}
                    >
                      {fmtDelta(Math.round(e.deltaHeures * 10) / 10, ' h')}
                      {e.deltaPct !== null && <> ({fmtDelta(e.deltaPct, ' %')})</>}
                    </span>
                  </Row>
                ))}
              </Section>
            )}

            {/* Axes calmes — repliés en une ligne, le constat concentre le plein. */}
            {emptyAxes.length > 0 && (
              <p className="border-t border-rule-soft pt-3.5 text-[12px] text-muted-foreground">
                <b className="font-bold text-foreground">{emptyAxes.join(' · ')}</b> — aucun
                changement.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

interface SectionProps {
  title: string
  count: number
  children: React.ReactNode
}

/** Section d'axe — ne reçoit que des axes non vides (le vide est replié plus haut). */
function Section({ title, count, children }: SectionProps) {
  return (
    <div>
      <h3 className="mb-2 flex items-baseline gap-2 font-fraunces text-[14px] font-extrabold tracking-tight">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
          {count}
        </span>
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

interface RowProps {
  sens: DiffSens
  children: React.ReactNode
}

function Row({ sens, children }: RowProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[12px]',
        sens === 'degradation' ? 'border-l-2 border-l-destructive' : 'border-l-2 border-l-ferme'
      )}
    >
      {children}
    </div>
  )
}
