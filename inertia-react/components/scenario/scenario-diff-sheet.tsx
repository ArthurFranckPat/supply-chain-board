import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { cn } from '@r/lib/utils'
import type { PlanDiff, DiffSens } from '@r/lib/scenarios/types'

/**
 * Constat d'impact d'un scénario (issue #57, moteur étage 2). Quatre axes signés :
 * client (promesses) / appro (couvertures + verdicts de calage) / allocation
 * (re-matching) / charge (poste × semaine).
 *
 * Principe acté (vision §5) : CONSTAT, pas prescription — on liste, l'humain décide.
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto bg-background text-foreground sm:max-w-2xl">
        <SheetTitle className="font-fraunces text-[18px] font-bold">Étude d'impact</SheetTitle>
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
          <div className="mt-4 space-y-6">
            {/* Sujet de l'étude : hypothèse(s) injectée(s) + réponse CTP. Constat neutre,
                hors bilan signé (flux ADV : c'est la question posée, pas un impact). */}
            {diff.sujet && diff.sujet.length > 0 && (
              <div className="space-y-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Demande testée · réponse CTP (hors bilan)
                </p>
                {diff.sujet.map((s, i) => (
                  <div key={`sujet-${i}`} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-mono text-[11px]">
                      {s.numCommande}
                      {s.ligne ? `#${s.ligne}` : ''}
                    </span>
                    <span className="text-muted-foreground">
                      {s.article}
                      {s.client ? ` · ${s.client}` : ''}
                      {s.quantite != null ? ` · ${s.quantite} u` : ''}
                      {s.date ? ` · besoin ${fmtJour(s.date)}` : ''}
                    </span>
                    <span className="ml-auto font-bold text-foreground">
                      → {s.statut}
                      {s.joursRetard > 0 ? ` (+${s.joursRetard} j)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Réaction d'offre : l'OF (ou la commande d'achat) que la demande testée
                déclencherait. C'est LUI qui consomme la nomenclature — donc lui qui
                alimente les axes appro / allocation / charge ci-dessous. */}
            {diff.offreVirtuelle && diff.offreVirtuelle.length > 0 && (
              <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/40 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Ordre déclenché (virtuel) · consomme la nomenclature
                </p>
                {diff.offreVirtuelle.map((o) => (
                  <div key={o.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
                        {o.type === 'of' ? 'OF' : 'Achat'}
                      </span>
                      <span className="font-mono text-[11px]">{o.id}</span>
                      <span className="text-muted-foreground">
                        {o.article} · {o.quantite} u ·{' '}
                        {o.type === 'of' ? 'lancer le' : 'commander le'} {fmtJour(o.dateDebut)} →{' '}
                        dispo {fmtJour(o.dateFin)} ({o.delai} j)
                        {o.poste ? ` · ${o.poste}` : ''}
                        {o.heures ? ` · ${o.heures} h` : ''}
                      </span>
                      {o.lancementDepasse && (
                        <span className="ml-auto rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive">
                          Lancement dépassé
                        </span>
                      )}
                    </div>
                    {o.composants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-1 text-[11px]">
                        {o.composants.map((c) => (
                          <span
                            key={`${o.id}-${c.article}`}
                            className={cn(
                              'rounded border px-1.5 py-0.5 font-mono text-[10px]',
                              c.manquant > 0
                                ? 'border-destructive/40 text-destructive'
                                : 'border-border text-muted-foreground'
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

            {/* Bilan */}
            <div className="flex gap-4 text-[12px] font-bold">
              <span className="text-destructive">{diff.stats.degradations} dégradation(s)</span>
              <span className="text-ferme">{diff.stats.ameliorations} amélioration(s)</span>
            </div>

            {/* Axe client — promesses */}
            <Section title="Client — promesses" count={diff.client.length}>
              {diff.client.map((e, i) => (
                <Row key={`client-${i}`} sens={e.sens}>
                  <span className="font-mono text-[11px]">
                    {e.numCommande}
                    {e.ligne ? `#${e.ligne}` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {e.article} · {e.client}
                  </span>
                  <span className={cn('ml-auto font-bold', sensClass(e.sens))}>
                    {e.disparue && <>hors plan · </>}
                    {e.statutAvant ?? '—'} → {e.statutApres ?? '—'}
                    {e.deltaJours !== 0 && <> ({fmtDelta(e.deltaJours, ' j')})</>}
                  </span>
                </Row>
              ))}
            </Section>

            {/* Axe appro — couvertures composants */}
            <Section title="Appro — couvertures composants" count={diff.appro.length}>
              {diff.appro.map((e, i) => (
                <Row key={`appro-${i}`} sens={e.sens}>
                  <span className="font-mono text-[11px]">{e.composant}</span>
                  <span className="text-muted-foreground">{e.ofs.length} OF</span>
                  <span className={cn('ml-auto font-bold', sensClass(e.sens))}>
                    manquant {e.manquantAvant} → {e.manquantApres} ({fmtDelta(e.delta, '')})
                  </span>
                </Row>
              ))}
            </Section>

            {/* Axe appro — Verdicts de calage */}
            <Section title="Appro — Verdicts de calage" count={diff.approVerdicts?.length ?? 0}>
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
                    <div className="flex flex-col gap-0.5 w-full">
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="font-mono text-[11px] font-bold">{v.composant}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}
                        >
                          {label}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Sur {v.numOf} ·{' '}
                        {v.nouveau ? (
                          <>Besoin créé le {fmtJour(v.dateApres)}</>
                        ) : (
                          <>
                            Besoin {fmtJour(v.dateAvant)} → {fmtJour(v.dateApres)}
                          </>
                        )}{' '}
                        · Qté {v.quantite} u{v.manquant > 0 && <> · manque {v.manquant} u</>} (délai{' '}
                        {v.reorderDelay} j)
                      </span>
                    </div>
                  </Row>
                )
              })}
            </Section>

            {/* Axe allocation — re-matching */}
            <Section title="Allocation — re-matching" count={diff.allocation.length}>
              {diff.allocation.map((e, i) => (
                <Row key={`alloc-${i}`} sens={e.sens}>
                  <span className="font-mono text-[11px]">
                    {e.numCommande}
                    {e.ligne ? `#${e.ligne}` : ''}
                  </span>
                  <span className="text-muted-foreground">{e.article}</span>
                  <span className={cn('ml-auto text-right font-bold', sensClass(e.sens))}>
                    {e.perd.length > 0 && <>perd {e.perd.join(', ')} </>}
                    {e.gagne.length > 0 && <>· gagne {e.gagne.join(', ')} </>}
                    {e.deltaReliquat !== 0 && <> ({fmtDelta(e.deltaReliquat, ' u')})</>}
                  </span>
                </Row>
              ))}
            </Section>

            {/* Axe charge — poste × semaine */}
            <Section title="Charge — poste × semaine" count={diff.charge.length}>
              {diff.charge.map((e, i) => (
                <Row key={`charge-${i}`} sens={e.deltaHeures > 0 ? 'degradation' : 'amelioration'}>
                  <span className="font-mono text-[11px]">{e.poste}</span>
                  <span className="text-muted-foreground">semaine du {fmtJour(e.semaine)}</span>
                  <span
                    className={cn(
                      'ml-auto font-bold',
                      sensClass(e.deltaHeures > 0 ? 'degradation' : 'amelioration')
                    )}
                  >
                    {fmtDelta(Math.round(e.deltaHeures * 10) / 10, ' h')}
                    {e.deltaPct !== null && <> ({fmtDelta(e.deltaPct, ' %')})</>}
                  </span>
                </Row>
              ))}
            </Section>
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

function Section({ title, count, children }: SectionProps) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 font-fraunces text-[14px] font-bold">
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
          {count}
        </span>
      </h3>
      {count > 0 ? (
        <div className="space-y-1">{children}</div>
      ) : (
        <p className="text-[12px] italic text-muted-foreground">Aucun changement.</p>
      )}
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
        'flex flex-wrap items-center gap-2 rounded-md border-l-2 bg-card px-2.5 py-1.5 text-[12px]',
        sens === 'degradation' ? 'border-l-destructive' : 'border-l-ferme'
      )}
    >
      {children}
    </div>
  )
}
