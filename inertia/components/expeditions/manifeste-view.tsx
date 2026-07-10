import { For, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { type CamionDtl } from '@/components/expeditions/camion-detail-sheet'
import { chargeBgClass, chargeText, chargeTier } from '@/components/expeditions/palette-charge'

/**
 * Vue « Manifestes camion » — chaque camion est une carte compacte.
 *
 * La charge est visualisée comme une **barre de remplissage** (le lit du camion)
 * plutôt qu'une grille de 35 cases : un camion à 6 palettes ne laisse pas 29
 * cases vides bruyantes, la barre se remplit proportionnellement et passe au
 * rouge (hachuré) au-delà du plafond plausible.
 */

export type ManifesteSort = 'time' | 'load' | 'client'

export const ManifesteView: Component<{
  rows: CamionDtl[]
  maxPalettesCamion: number
  camionCapacitePalettes: number
  selectedCamion: CamionDtl | null
  onSelect: (row: CamionDtl) => void
}> = (props) => {
  return (
    <div class="h-full overflow-y-auto px-5 pb-8 pt-4">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-3.5">
        <For each={props.rows} fallback={
          <div class="col-span-full flex flex-col items-center gap-2 p-10 text-center">
            <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">local_shipping</span>
            <span class="font-fraunces text-[14px] italic text-muted-foreground">Aucun camion ne correspond au filtre.</span>
          </div>
        }>
          {(c) => {
            // Taux de remplissage effectif : palTheo (éq. standard pondéré ESH) quand
            // disponible, sinon fallback nbPalettes / capacité (cas sans coef article).
            const taux = () =>
              c.palTheo >= 0 ? c.tauxRemplissage : c.nbPalettes / props.camionCapacitePalettes
            const tier = () => chargeTier(taux())
            // Débord = volume au-delà de 100 % de la capacité.
            const over = () => Math.max(taux() - 1, 0)
            const fillPct = () => Math.min(taux() * 100, 100)
            const isSel = () => props.selectedCamion === c
            // Chiffre principal adaptatif : nbPalettes si scanné (>0), sinon palTheo si
            // calculable (PALNUM absent mais coef article dispo), sinon '—'.
            const hasScan = () => c.nbPalettes > 0
            const hasTheo = () => c.palTheo >= 0
            const mainValue = () =>
              hasScan() ? String(c.nbPalettes)
              : hasTheo() ? c.palTheo.toFixed(1)
              : '—'
            const mainSuffix = () =>
              hasScan() ? '' : hasTheo() ? ' théo.' : ''
            return (
              <button
                type="button"
                class={cx(
                  'relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow] duration-150',
                  'border-rule hover:border-brand',
                  isSel() && 'border-brand ring-2 ring-brand/20',
                  c.anomalie && 'border-destructive/45',
                  c.anomalie && 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive',
                )}
                onClick={() => props.onSelect(c)}
              >
                {/* En-tête : client + créneau */}
                <div class="flex items-start justify-between gap-2.5">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="truncate text-[12.5px] font-bold text-foreground">{c.client || '—'}</span>
                      <Show when={c.source === 'navette'}>
                        <span class="inline-flex items-center gap-0.5 rounded bg-brand/10 px-1 font-mono text-[8px] font-bold tracking-wider text-brand uppercase" title={`Navette ${c.navetteNum}`}>
                          {c.navetteNum}
                        </span>
                      </Show>
                    </div>
                    <span class="font-mono text-[10px] text-muted-foreground">{c.bprnum}</span>
                  </div>
                  <span class={cx(
                    'flex flex-none items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-bold whitespace-nowrap',
                    c.anomalie ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground',
                  )}>
                    <span class="material-symbols-outlined text-[12px]">schedule</span>
                    {c.debut}{c.fin !== c.debut ? `–${c.fin}` : ''}
                  </span>
                </div>

                {/* Barre de charge — le « lit » du camion (pilotée par le taux de remplissage) */}
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class={cx('flex items-baseline gap-1 font-fraunces text-[26px] font-black leading-none tracking-tight tabular-nums', chargeText(tier()))}>
                      {mainValue()}
                      <span class="font-mono text-[10px] font-semibold tracking-normal text-muted-foreground">{mainSuffix()}</span>
                      <Show when={over() > 0}>
                        <span class="font-mono text-[12px] font-bold text-destructive" title={`${Math.round(over() * 100)}% au-delà de la capacité`}>+{Math.round(over() * 100)}%</span>
                      </Show>
                      <span class="font-mono text-[10px] font-semibold tracking-normal text-muted-foreground">/ {props.camionCapacitePalettes} pal.</span>
                    </span>
                    {/* palTheo en sous-texte seulement quand le scan existe (sinon déjà en principal) */}
                    <Show when={hasScan() && hasTheo()}>
                      <span class="font-mono text-[9px] text-muted-foreground/70" title="Équivalent-palettes théorique (calcul UC, pondéré ESH)">
                        ≈ {c.palTheo.toFixed(1)} théo.
                      </span>
                    </Show>
                  </div>
                  <div class="relative h-3.5 overflow-hidden rounded-full bg-secondary">
                    <Show when={over() > 0}>
                      {/* Débord hachuré : portion de barre au-delà de 100% (plafonnée visuellement). */}
                      <div
                        class="absolute inset-y-0 right-0"
                        style={{
                          width: `${Math.min(over() / Math.max(taux(), 1) * 100, 100)}%`,
                          background: 'repeating-linear-gradient(45deg, var(--color-destructive) 0 3px, #c44a32 3px 6px)',
                        }}
                      />
                    </Show>
                    <div
                      class={cx('h-full rounded-full transition-[width] duration-300', chargeBgClass(tier()))}
                      style={{ width: `${fillPct()}%` }}
                    />
                  </div>
                </div>

                {/* Pied : décomposition contenants (pal/cart) + lignes + flag anomalie */}
                <div class="flex items-center gap-4 border-t border-rule-soft pt-2.5">
                  <Stat label="Palettes" value={String(c.contenants.pal)} />
                  <Stat label="Cartons" value={String(c.contenants.cart)} />
                  <Stat label="Volantes" value={String(c.contenants.unites)} />
                  <Stat label="Lignes" value={String(c.nbLignes)} />
                  <Show when={c.anomalie}>
                    <span class="ml-auto flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.06em] text-destructive uppercase">
                      <span class="material-symbols-outlined text-[13px]">warning</span>
                      Suspecte
                    </span>
                  </Show>
                </div>
              </button>
            )
          }}
        </For>
      </div>
    </div>
  )
}

const Stat: Component<{ label: string; value: string }> = (p) => (
  <span class="flex flex-col gap-px">
    <span class="font-mono text-[13px] font-bold text-foreground tabular-nums">{p.value}</span>
    <span class="font-mono text-[8.5px] tracking-[0.08em] text-muted-foreground uppercase">{p.label}</span>
  </span>
)

export default ManifesteView
