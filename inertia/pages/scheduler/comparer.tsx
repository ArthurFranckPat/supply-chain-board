import { For, Show, createSignal, onMount, type Component } from 'solid-js'
import { router } from '@/lib/inertia-solid'
import { Button } from '@/components/ui/button'
import { usePrintFitPage } from '@/lib/board/use-print-fit'
import type { PlanDiff, AllocationStrategy } from '@/lib/scenarios/types'

interface ScenarioCompareVm {
  id: number
  nom: string
  description: string | null
  auteur: string | null
  statut: 'brouillon' | 'applique'
  strategy: AllocationStrategy
  mutationsCount: number
  diff: PlanDiff
  stats: {
    delayedOrders: number
    inducedShortages: number
  }
}

interface PlanActuelVm {
  nom: string
  diff: PlanDiff
  stats: {
    delayedOrders: number
    inducedShortages: number
  }
}

interface Props {
  scenarios: ScenarioCompareVm[]
  planActuel: PlanActuelVm
  windowFrom: string
  windowTo: string
  evaluatedAt: string
  dataAt: string
}

export const ComparerPage: Component<Props> = (props) => {
  let pageRef: HTMLDivElement | undefined
  usePrintFitPage(() => pageRef)

  // Calcule les surcharges (poste-semaine où deltaHeures > 0)
  const getSurchargeStats = (diff: PlanDiff) => {
    const surchargedWeeks = diff.charge.filter((c) => c.deltaHeures > 0)
    const totalExtraHours = surchargedWeeks.reduce((acc, c) => acc + c.deltaHeures, 0)
    // Regroupe par poste
    const extraByPoste: Record<string, number> = {}
    for (const c of surchargedWeeks) {
      extraByPoste[c.poste] = (extraByPoste[c.poste] || 0) + c.deltaHeures
    }
    return {
      count: surchargedWeeks.length,
      hours: totalExtraHours,
      byPoste: extraByPoste,
    }
  }

  const formatStrategy = (s: AllocationStrategy) => {
    switch (s) {
      case 'date_besoin':
        return 'Date de besoin (défaut)'
      case 'date_passation':
        return 'Date de passation (anticipation)'
      case 'priorite_previsions':
        return 'Priorité prévisions client'
      default:
        return s
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      ref={pageRef}
      class="min-h-screen bg-background p-8 font-sans print:p-0 print:bg-white"
    >
      {/* Header Band */}
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4 print:hidden">
        <div>
          <h1 class="font-fraunces text-2xl font-bold text-foreground">
            Comparaison des Scénarios de Planification
          </h1>
          <p class="text-xs text-muted-foreground mt-1">
            Évalué le {new Date(props.evaluatedAt).toLocaleString()} sur données fraîches du{' '}
            {new Date(props.dataAt).toLocaleDateString()} · Horizon {props.windowFrom} au {props.windowTo}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.visit('/programme')}>
            <span class="material-symbols-outlined text-[16px] mr-1.5">arrow_back</span>
            Retour au programme
          </Button>
          <Button size="sm" onClick={handlePrint} class="gap-1.5">
            <span class="material-symbols-outlined text-[16px]">print</span>
            Imprimer (A3 Paysage)
          </Button>
        </div>
      </div>

      {/* Print-only Header */}
      <div class="hidden print:block mb-4 border-b border-black pb-2">
        <div class="flex justify-between items-end">
          <div>
            <h1 class="font-fraunces text-xl font-bold text-black">
              Comparaison des Scénarios de Planification
            </h1>
            <p class="text-[10px] text-gray-600">
              Horizon : {props.windowFrom} au {props.windowTo}
            </p>
          </div>
          <p class="text-[9px] text-gray-500 text-right">
            Évalué le {new Date(props.evaluatedAt).toLocaleString()} sur données du{' '}
            {new Date(props.dataAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Comparison Grid */}
      <div
        class="grid gap-4"
        style={{
          "grid-template-columns": `260px repeat(${props.scenarios.length + 1}, minmax(240px, 1fr))`,
        }}
      >
        {/* Row Headers */}
        <div class="flex flex-col gap-4">
          <div class="h-[150px] border border-transparent p-4 flex flex-col justify-end">
            <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scénario</span>
          </div>
          
          {/* Metadata Section */}
          <div class="rounded-lg border border-rule bg-muted/40 p-4 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">Informations</h3>
            <div class="h-28 flex flex-col justify-between text-xs text-muted-foreground">
              <div>Règle d'allocation</div>
              <div>Mutations enregistrées</div>
              <div>Auteur / Statut</div>
            </div>
          </div>

          {/* Client Axis Section */}
          <div class="rounded-lg border border-rule bg-muted/40 p-4 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">Axe Client</h3>
            <div class="h-16 flex flex-col justify-between text-xs text-muted-foreground">
              <div>Commandes en retard</div>
              <div>Delta retards</div>
            </div>
          </div>

          {/* Appro Axis Section */}
          <div class="rounded-lg border border-rule bg-muted/40 p-4 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">Axe Appro</h3>
            <div class="h-24 flex flex-col justify-between text-xs text-muted-foreground">
              <div>Composants en rupture</div>
              <div>Ruptures inévitables</div>
              <div>Appros à re-caler</div>
            </div>
          </div>

          {/* Charge Axis Section */}
          <div class="rounded-lg border border-rule bg-muted/40 p-4 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-foreground">Axe Charge</h3>
            <div class="h-24 flex flex-col justify-between text-xs text-muted-foreground">
              <div>Surcharges détectées</div>
              <div>Delta d'heures supp.</div>
              <div>Postes surchargés</div>
            </div>
          </div>
        </div>

        {/* Plan Actuel Column (Reference) */}
        <div class="flex flex-col gap-4">
          <div class="h-[150px] border border-border bg-muted/30 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <h2 class="font-fraunces text-base font-bold text-foreground">Plan Actuel</h2>
              <span class="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-brand">
                Référence
              </span>
            </div>
            <div class="text-[10px] text-muted-foreground">
              Plan réel de production de l'usine
            </div>
          </div>

          {/* Info */}
          <div class="rounded-lg border border-border bg-card p-4 h-36 flex flex-col justify-between text-xs font-medium">
            <div>{formatStrategy('date_besoin')}</div>
            <div class="font-mono text-muted-foreground">0 mutation</div>
            <div class="text-muted-foreground">—</div>
          </div>

          {/* Client */}
          <div class="rounded-lg border border-border bg-card p-4 h-24 flex flex-col justify-between text-sm font-semibold">
            <div class="flex items-baseline gap-1.5">
              <span class="text-lg font-bold text-foreground">{props.planActuel.stats.delayedOrders}</span>
              <span class="text-[10px] font-normal text-muted-foreground">commandes</span>
            </div>
            <div class="text-xs font-normal text-muted-foreground">Référence</div>
          </div>

          {/* Appro */}
          <div class="rounded-lg border border-border bg-card p-4 h-32 flex flex-col justify-between text-sm font-semibold">
            <div class="flex items-baseline gap-1.5">
              <span class="text-lg font-bold text-foreground">{props.planActuel.stats.inducedShortages}</span>
              <span class="text-[10px] font-normal text-muted-foreground">composants</span>
            </div>
            <div class="text-xs font-normal text-muted-foreground">0</div>
            <div class="text-xs font-normal text-muted-foreground">0</div>
          </div>

          {/* Charge */}
          {(() => {
            const charge = getSurchargeStats(props.planActuel.diff)
            return (
              <div class="rounded-lg border border-border bg-card p-4 h-32 flex flex-col justify-between text-xs">
                <div class="font-bold text-foreground text-sm">{charge.count} poste-semaines</div>
                <div class="text-muted-foreground">{charge.hours} h</div>
                <div class="truncate text-[10px] text-muted-foreground">
                  {Object.keys(charge.byPoste).join(', ') || 'Aucun'}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Scenarios Columns */}
        <For each={props.scenarios}>
          {(sc) => {
            const clientDelta = sc.stats.delayedOrders - props.planActuel.stats.delayedOrders
            const shortageDelta = sc.stats.inducedShortages - props.planActuel.stats.inducedShortages

            const inevitableCount = sc.diff.approVerdicts?.filter(v => v.verdict === 'inevitable').length ?? 0
            const recalableCount = sc.diff.approVerdicts?.filter(v => v.verdict === 'recalable').length ?? 0

            return (
              <div class="flex flex-col gap-4">
                <div class="h-[150px] border border-border bg-card rounded-lg p-4 flex flex-col justify-between relative group hover:border-brand/40 transition">
                  <div>
                    <h2 class="font-fraunces text-base font-bold text-brand truncate" title={sc.nom}>{sc.nom}</h2>
                    <span class={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${sc.statut === 'applique' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {sc.statut === 'applique' ? 'appliqué' : 'brouillon'}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-2">
                    <span class="text-[10px] text-muted-foreground truncate" title={sc.description ?? ''}>
                      {sc.description || 'Aucune description'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.visit(`/programme?open_scenario_id=${sc.id}`)}
                      class="print:hidden flex-none text-[10px] h-6 px-2"
                    >
                      Ouvrir
                    </Button>
                  </div>
                </div>

                {/* Info */}
                <div class="rounded-lg border border-border bg-card p-4 h-36 flex flex-col justify-between text-xs">
                  <div class="font-medium text-foreground">{formatStrategy(sc.strategy)}</div>
                  <div class="font-mono font-semibold text-foreground">
                    {sc.mutationsCount} mutation{sc.mutationsCount > 1 ? 's' : ''}
                  </div>
                  <div class="text-muted-foreground">
                    Par {sc.auteur || 'System'}
                  </div>
                </div>

                {/* Client retards */}
                <div class="rounded-lg border border-border bg-card p-4 h-24 flex flex-col justify-between text-sm font-semibold">
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-lg font-bold text-foreground">{sc.stats.delayedOrders}</span>
                    <span class="text-[10px] font-normal text-muted-foreground">commandes</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class={`text-xs font-bold ${clientDelta > 0 ? 'text-red-600' : clientDelta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {clientDelta > 0 ? `+${clientDelta}` : clientDelta < 0 ? `${clientDelta}` : '0'}
                    </span>
                    <span class="text-[10px] font-normal text-muted-foreground">vs plan actuel</span>
                  </div>
                </div>

                {/* Appro shortages */}
                <div class="rounded-lg border border-border bg-card p-4 h-32 flex flex-col justify-between text-sm font-semibold">
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-lg font-bold text-foreground">{sc.stats.inducedShortages}</span>
                    <span class="text-[10px] font-normal text-muted-foreground">composants</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class={`text-xs font-bold ${shortageDelta > 0 ? 'text-red-600' : shortageDelta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {shortageDelta > 0 ? `+${shortageDelta}` : shortageDelta < 0 ? `${shortageDelta}` : '0'}
                    </span>
                    <span class="text-[10px] font-normal text-muted-foreground">vs plan actuel</span>
                  </div>
                  <div class="text-xs font-normal text-red-600 flex justify-between">
                    <span>Inévitables</span>
                    <span>{inevitableCount}</span>
                  </div>
                  <div class="text-xs font-normal text-amber-600 flex justify-between">
                    <span>À re-caler</span>
                    <span>{recalableCount}</span>
                  </div>
                </div>

                {/* Charge */}
                {(() => {
                  const charge = getSurchargeStats(sc.diff)
                  const baselineCharge = getSurchargeStats(props.planActuel.diff)
                  const hoursDelta = charge.hours - baselineCharge.hours

                  return (
                    <div class="rounded-lg border border-border bg-card p-4 h-32 flex flex-col justify-between text-xs">
                      <div class="font-bold text-foreground text-sm">{charge.count} poste-semaines</div>
                      <div class="flex items-center justify-between">
                        <span class="font-semibold text-muted-foreground">{charge.hours} h total</span>
                        <span class={`font-bold ${hoursDelta > 0 ? 'text-red-600' : hoursDelta < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {hoursDelta > 0 ? `+${hoursDelta}h` : hoursDelta < 0 ? `${hoursDelta}h` : '0h'}
                        </span>
                      </div>
                      <div class="truncate text-[10px] text-muted-foreground" title={Object.keys(charge.byPoste).join(', ')}>
                        {Object.keys(charge.byPoste).join(', ') || 'Aucun'}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}

export default ComparerPage
