import { createMemo, For, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'

/**
 * Board « Papier » — grille de planification (coquille, cellules vides).
 *
 * Une rangée par poste de production, le temps coule à l'horizontale (semaines
 * côte à côte). En-tête de poste = charge (ChargeHistogram : total + moyenne
 * h/sem + histogramme hebdo empilé Ferme/Planifié/Suggéré). Cellules vides sur
 * fond quadrillé, prêtes à recevoir les cartes commande.
 */

export type BoardDay = { short: string; num: string; today?: boolean; hours?: number }
export type BoardWeek = { label: string; span: number }
export type BoardLine = {
  code: string
  name: string
  tone?: string
  /** Charge par semaine (histogramme). */
  weekLoads?: ChargeWeek[]
}

export type BoardProps = {
  days: BoardDay[]
  weeks: BoardWeek[]
  lines: BoardLine[]
  /** Largeur de la colonne « Poste » (gelée à gauche). */
  labelWidth?: number
  class?: string
}

const GRAPH_PAPER =
  'linear-gradient(to right, rgba(31,26,19,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(31,26,19,.045) 1px, transparent 1px)'

export const Board: Component<BoardProps> = (props) => {
  const lw = () => props.labelWidth ?? 210
  const cols = () => `${lw()}px repeat(${props.days.length}, minmax(56px, 1fr))`
  const minWidth = () => `calc(${lw()}px + ${props.days.length * 66}px)`

  /** Heures hebdo max (toutes lignes) = échelle des barres de charge. */
  const maxHours = createMemo(() => {
    let m = 0
    for (const l of props.lines) {
      for (const w of l.weekLoads ?? []) {
        const t = w.ferme + w.planifie + w.suggere
        if (t > m) m = t
      }
    }
    return m || 1
  })

  return (
    <div
      class={cx(
        'overflow-x-auto rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        props.class,
      )}
    >
      <div style={{ 'min-width': minWidth() }}>
        {/* Bande de semaine (encre) */}
        <div class="grid" style={{ 'grid-template-columns': cols() }}>
          <div class="bg-foreground" />
          <For each={props.weeks}>
            {(w) => (
              <div
                class="flex items-center gap-2 bg-foreground px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-secondary"
                style={{ 'grid-column': `span ${w.span}` }}
              >
                {w.label}
              </div>
            )}
          </For>
        </div>

        {/* En-tête des jours */}
        <div class="grid border-b-2 border-foreground" style={{ 'grid-template-columns': cols() }}>
          <div class="bg-secondary px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Poste de charge
          </div>
          <For each={props.days}>
            {(d) => (
              <div class={cx('bg-secondary px-1 py-1.5 text-center', d.today && 'bg-terra-soft')}>
                <div class="font-mono text-[9px] uppercase text-muted-foreground">{d.short}</div>
                <div
                  class={cx(
                    'font-fraunces text-[15px] font-bold leading-none',
                    d.today ? 'text-terra' : 'text-foreground',
                  )}
                >
                  {d.num}
                </div>
                <Show when={d.hours != null}>
                  <div class="mt-1 font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                    {d.hours}h
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Rangées de postes */}
        <Show
          when={props.lines.length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <span class="material-symbols-outlined text-[28px] text-muted-foreground/60">grid_view</span>
              <div class="font-fraunces text-[15px] font-bold">Aucun poste à planifier</div>
              <div class="font-fraunces text-[13px] italic text-muted-foreground">
                Le board est vide sur cette fenêtre.
              </div>
            </div>
          }
        >
          <For each={props.lines}>
            {(line) => (
              <div
                class="grid border-b border-rule-soft last:border-b-0"
                style={{ 'grid-template-columns': cols() }}
              >
                {/* En-tête de poste : dot + code, nom, charge */}
                <div class="flex flex-col gap-2 border-r border-rule-soft bg-card px-3 py-2.5">
                  <div class="flex items-center gap-1.5">
                    <span
                      class="size-2 rounded-sm"
                      style={{ background: line.tone ?? 'var(--color-planifie)' }}
                    />
                    <span class="font-mono text-[12px] font-bold">{line.code}</span>
                  </div>
                  <span class="text-[10px] leading-tight text-muted-foreground">{line.name}</span>
                  <ChargeHistogram weeks={line.weekLoads ?? []} maxHours={maxHours()} />
                </div>

                {/* Cellules vides (quadrillé) */}
                <For each={props.days}>
                  {(d) => (
                    <div
                      class={cx(
                        'border-r border-rule-soft last:border-r-0',
                        d.today && 'bg-terra-soft',
                      )}
                      style={{
                        'min-height': '150px',
                        'background-image': GRAPH_PAPER,
                        'background-size': '22px 22px',
                      }}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

export default Board
