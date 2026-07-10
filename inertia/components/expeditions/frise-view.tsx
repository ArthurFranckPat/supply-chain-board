import { For, Show, createMemo, createSignal, onCleanup, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { type CamionDtl } from '@/components/expeditions/camion-detail-sheet'
import {
  chargeBgClass,
  chargeText,
  chargeTier,
  fromMinutes,
  pctOf,
  timeBounds,
  toMinutes,
} from '@/components/expeditions/palette-charge'

/**
 * Vue « Frise de charge » — chaque camion est une barre positionnée sur un axe
 * temporel (auto-calibré sur les données), ancrée en bas de sa rangée (skyline).
 * La hauteur ∝ palettes, la largeur = créneau exact début→fin.
 *
 * Une ligne « MAINTENANT » et un histogramme de densité quai (camions simultanés
 * par heure) complètent la lecture : on repère les goulets d'un coup d'œil.
 *
 * Tooltip au survol + navigation clavier (Entrée/Espace pour ouvrir le détail).
 */

const ROW_H = 56      // hauteur d'une rangée (px)
const BAR_MIN = 16    // hauteur min barre
const BAR_MAX = 46    // hauteur max barre (pour pal ≤ max)
const PAD_TOP = 4
const NOW_MIN = (function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
})()

export const FriseView: Component<{
  rows: CamionDtl[]
  maxPalettesCamion: number
  camionCapacitePalettes: number
  selectedCamion: CamionDtl | null
  onSelect: (row: CamionDtl) => void
}> = (props) => {
  const bounds = createMemo(() =>
    timeBounds(props.rows.map((c) => [c.debut, c.fin] as const)),
  )
  const dur = () => bounds().end - bounds().start

  // La ligne MAINTENANT n'a du sens que si « maintenant » tombe dans la fenêtre.
  const nowPct = createMemo(() => {
    const b = bounds()
    if (NOW_MIN < b.start || NOW_MIN > b.end) return null
    return pctOf(NOW_MIN, b.start, b.end)
  })

  /** Taux de remplissage effectif d'un camion (palTheo si dispo, sinon nbPal/capacité). */
  const tauxOf = (c: CamionDtl) =>
    c.palTheo >= 0 ? c.tauxRemplissage : c.nbPalettes / props.camionCapacitePalettes

  // Hauteur de barre ∝ taux de remplissage (plafonné à 1 pour la hauteur visuelle).
  const barH = (c: CamionDtl) => {
    const ref = Math.min(tauxOf(c), 1)
    return Math.round(BAR_MIN + ref * (BAR_MAX - BAR_MIN))
  }

  // Densité quai : nombre de camions dont le créneau traverse chaque heure.
  const density = createMemo(() => {
    const b = bounds()
    const buckets = new Array(b.hours).fill(0)
    for (const c of props.rows) {
      const ds = Math.floor((toMinutes(c.debut) - b.start) / 60)
      const de = Math.floor((toMinutes(c.fin) - b.start) / 60)
      for (let h = ds; h <= de && h < b.hours; h++) if (h >= 0) buckets[h]++
    }
    const max = Math.max(...buckets, 1)
    return buckets.map((n, i) => ({ n, i, max }))
  })

  // ── Tooltip ──────────────────────────────────────────────────────
  const [hovered, setHovered] = createSignal<CamionDtl | null>(null)
  let tipEl: HTMLDivElement | undefined
  let mx = 0
  let my = 0

  const onMove = (e: MouseEvent) => {
    mx = e.clientX
    my = e.clientY
    if (tipEl) {
      let x = mx + 14
      let y = my + 14
      if (x + tipEl.offsetWidth > window.innerWidth) x = mx - tipEl.offsetWidth - 14
      tipEl.style.left = `${x}px`
      tipEl.style.top = `${y}px`
    }
  }
  const onEnter = (c: CamionDtl) => {
    setHovered(c)
    if (tipEl) tipEl.style.display = 'block'
    window.addEventListener('mousemove', onMove)
  }
  const onLeave = () => {
    setHovered(null)
    if (tipEl) tipEl.style.display = 'none'
    window.removeEventListener('mousemove', onMove)
  }
  onCleanup(() => window.removeEventListener('mousemove', onMove))

  return (
    <div class="h-full overflow-auto px-5 pb-8 pt-4">
      <div class="overflow-hidden rounded-xl border border-rule bg-card">
        {/* En-tête : label + heures */}
        <div class="sticky top-0 z-[6] grid grid-cols-[210px_1fr] border-b border-rule bg-secondary">
          <div class="border-r border-rule-soft px-4 py-[11px] font-mono text-[9px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
            Camion
          </div>
          <div class="grid" style={{ 'grid-template-columns': `repeat(${bounds().hours}, 1fr)` }}>
            <For each={Array.from({ length: bounds().hours })}>
              {(_, i) => (
                <span class="border-r border-rule-soft py-[11px] text-center font-mono text-[10px] font-bold text-muted-foreground last:border-r-0">
                  {fromMinutes(bounds().start + i() * 60)}
                </span>
              )}
            </For>
          </div>
        </div>

        {/* Rangées camions */}
        <For each={props.rows} fallback={
          <div class="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <span class="material-symbols-outlined text-[32px] opacity-45">local_shipping</span>
            <span class="font-fraunces text-[14px] italic">Aucun camion ne correspond au filtre.</span>
          </div>
        }>
          {(c) => {
            const left = () => pctOf(toMinutes(c.debut), bounds().start, dur())
            const width = () => Math.max(pctOf(toMinutes(c.fin), bounds().start, dur()) - left(), 2.5)
            const taux = () => tauxOf(c)
            const tier = () => chargeTier(taux())
            const h = () => barH(c)
            const isSel = () => props.selectedCamion === c
            return (
              <div class="grid grid-cols-[210px_1fr] border-b border-rule-soft last:border-b-0 hover:bg-foreground/[0.03]">
                <div class="flex flex-col gap-0.5 border-r border-rule-soft px-4 py-2 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class={cx('truncate text-[11.5px] font-bold', c.anomalie ? 'text-destructive' : 'text-foreground')}>
                      {c.client || '—'}
                    </span>
                    <Show when={c.source === 'navette'}>
                      <span class="font-mono text-[8px] font-bold tracking-wider text-brand uppercase">{c.navetteNum}</span>
                    </Show>
                  </div>
                  <span class="font-mono text-[9.5px] text-muted-foreground tabular-nums">
                    {c.debut}–{c.fin} · {c.qteUc.toLocaleString('fr-FR')} UC
                  </span>
                  <Show when={c.anomalie}>
                    <span class="flex w-fit items-center gap-0.5 font-mono text-[8.5px] font-bold tracking-[0.05em] text-destructive uppercase">
                      <span class="material-symbols-outlined text-[11px]">warning</span>
                      {c.nbPalettes} pal &gt; {props.maxPalettesCamion}
                    </span>
                  </Show>
                  <Show when={!c.anomalie && taux() > 1}>
                    <span class="flex w-fit items-center gap-0.5 font-mono text-[8.5px] font-bold tracking-[0.05em] text-destructive uppercase" title="Volume au-delà de la capacité (équivalent-palettes)">
                      <span class="material-symbols-outlined text-[11px]">warning</span>
                      {Math.round(taux() * 100)}% rempl.
                    </span>
                  </Show>
                </div>
                <div class="relative" style={{ height: `${ROW_H}px` }}>
                  {/* Grille de fond (lignes d'heure) */}
                  <div
                    class="absolute inset-0"
                    style={{
                      'background-image': `linear-gradient(to right, transparent calc(100%/${bounds().hours} - 1px), var(--color-rule-soft) calc(100%/${bounds().hours} - 1px) calc(100%/${bounds().hours}))`,
                      'background-size': `calc(100%/${bounds().hours}) 100%`,
                    }}
                  />
                  {/* Ligne MAINTENANT */}
                  <Show when={nowPct() !== null}>
                    <div class="pointer-events-none absolute inset-y-0 z-[5] w-px bg-brand" style={{ left: `${nowPct()}%` }}>
                      <span class="absolute -top-[7px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-brand bg-card px-1 py-px font-mono text-[8px] font-bold tracking-[0.1em] text-brand">
                        MAINTENANT
                      </span>
                    </div>
                  </Show>
                  {/* Barre camion */}
                  <div
                    role="button"
                    tabindex={0}
                    aria-label={`${c.client} — ${c.debut} à ${c.fin}, ${c.nbPalettes} palettes`}
                    class={cx(
                      'absolute flex cursor-pointer items-center overflow-hidden rounded-[5px] px-2 transition-[filter,box-shadow] duration-150',
                      'hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                      isSel() && 'ring-2 ring-brand ring-offset-1',
                      chargeBgClass(tier()),
                    )}
                    style={{
                      left: `${left()}%`,
                      width: `${width()}%`,
                      top: `${ROW_H - h() - PAD_TOP}px`,
                      height: `${h()}px`,
                      'background-image': 'repeating-linear-gradient(90deg, transparent 0 7px, rgba(251,248,239,0.14) 7px 8px)',
                    }}
                    onClick={() => props.onSelect(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSelect(c) } }}
                    onMouseEnter={() => onEnter(c)}
                    onMouseLeave={onLeave}
                  >
                    {/* Texte uniquement si la barre est assez large */}
                    <Show when={width() > 8}>
                      <span class="flex items-center gap-1 font-mono text-[10px] font-bold whitespace-nowrap text-card">
                        {c.nbPalettes}
                        <Show when={c.anomalie}>
                          <span class="material-symbols-outlined text-[12px]">warning</span>
                        </Show>
                      </span>
                    </Show>
                  </div>
                </div>
              </div>
            )
          }}
        </For>

        {/* Densité quai */}
        <div class="grid grid-cols-[210px_1fr] border-t-2 border-rule bg-secondary">
          <div class="flex flex-col justify-center gap-0.5 border-r border-rule-soft px-4 py-3">
            <span class="font-mono text-[9px] font-bold tracking-[0.14em] text-secondary-foreground uppercase">Densité quai</span>
            <span class="font-mono text-[8px] font-medium text-muted-foreground italic">camions simultanés / heure</span>
          </div>
          <div class="relative" style={{ height: '64px' }}>
            <Show when={nowPct() !== null}>
              <div class="pointer-events-none absolute inset-y-0 z-[5] w-px bg-brand" style={{ left: `${nowPct()}%` }} />
            </Show>
            <For each={density()}>
              {(d) => {
                const hpct = d.n / d.max * 100
                const cls = d.n >= 3 ? 'bg-suggere' : d.n >= 2 ? 'bg-planifie' : 'bg-ferme'
                return (
                  <div
                    class={cx('absolute bottom-0 flex items-start justify-center rounded-t-[4px] pt-1', cls)}
                    style={{
                      left: `${(d.i / bounds().hours) * 100}%`,
                      width: `${(1 / bounds().hours) * 100 - 1}%`,
                      height: `${Math.max(hpct, d.n ? 12 : 0)}%`,
                      'background-image': 'repeating-linear-gradient(90deg, transparent 0 6px, rgba(251,248,239,0.12) 6px 7px)',
                    }}
                  >
                    <Show when={d.n > 0}>
                      <span class="font-mono text-[9px] font-bold text-card">{d.n}</span>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </div>

      {/* Tooltip (portail fixed) */}
      <div
        ref={tipEl}
        class="pointer-events-none fixed z-50 hidden max-w-[240px] rounded-lg border border-rule bg-card p-2.5 text-[11px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]"
      >
        <Show when={hovered()}>{(c) => (
          <>
            <strong class="mb-0.5 block text-[12px]">{c().client || '—'}</strong>
            <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Créneau</span><b class="text-foreground font-bold">{c().debut}–{c().fin}</b>
            </div>
            <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Palettes</span>
              <b class={cx('font-bold', chargeText(chargeTier(c().palTheo >= 0 ? c().tauxRemplissage : c().nbPalettes / props.camionCapacitePalettes)))}>
                {c().nbPalettes} pal.
                <Show when={c().palTheo >= 0}>
                  {' '}(≈ {c().palTheo.toFixed(1)} théo.)
                </Show>
              </b>
            </div>
            <Show when={c().palTheo >= 0}>
              <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
                <span>Remplissage</span>
                <b class="font-bold text-foreground">{Math.round(c().tauxRemplissage * 100)}% / {props.camionCapacitePalettes} pal.</b>
              </div>
            </Show>
            <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>UC</span><b class="text-foreground font-bold">{c().qteUc.toLocaleString('fr-FR')}</b>
            </div>
            <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Contenants</span><b class="text-foreground font-bold">{c().nbContenants}</b>
            </div>
            <div class="flex justify-between gap-3.5 font-mono text-[10px] text-muted-foreground">
              <span>Lignes</span><b class="text-foreground font-bold">{c().nbLignes}</b>
            </div>
          </>
        )}</Show>
      </div>
    </div>
  )
}

export default FriseView
