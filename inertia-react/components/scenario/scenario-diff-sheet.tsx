import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { cn } from '@r/lib/utils'
import type { PlanDiff, DiffSens } from '@/lib/scenarios/types'

/**
 * Constat d'impact d'un scénario (issue #57, moteur étage 2). Trois axes signés :
 * client (promesses) / appro (couvertures composants) / allocation (re-matching).
 * L'axe charge reste sur le board (histogrammes déjà réactifs aux positions).
 *
 * Principe acté (vision §5) : CONSTAT, pas prescription — on liste, l'humain décide.
 */

const sensClass = (s: DiffSens) => (s === 'degradation' ? 'text-error' : 'text-emerald-600')

const fmtDelta = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

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
      <SheetContent className="theme-navy w-full overflow-y-auto bg-background text-foreground sm:max-w-2xl">
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
            {/* Bilan */}
            <div className="flex gap-4 text-[12px] font-bold">
              <span className="text-error">{diff.stats.degradations} dégradation(s)</span>
              <span className="text-emerald-600">{diff.stats.ameliorations} amélioration(s)</span>
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
                    {e.nouvelle && <>nouvelle · </>}
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
                    ? 'bg-red-100 text-red-700'
                    : v.verdict === 'recalable'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-700'
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
                        Sur {v.numOf} · Besoin {v.dateAvant} → {v.dateApres} · Qté {v.quantite} u (Délai{' '}
                        {v.reorderDelay}j)
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
      {count > 0 ? <div className="space-y-1">{children}</div> : <p className="text-[12px] italic text-muted-foreground">Aucun changement.</p>}
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
        sens === 'degradation' ? 'border-l-error' : 'border-l-emerald-500'
      )}
    >
      {children}
    </div>
  )
}
