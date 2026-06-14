/**
 * Imperative Gantt DOM helpers.
 *
 * These functions manipulate absolute CSS positioning (left, width, top) on
 * .bar elements within .track containers. They are inherently imperative —
 * the positions are runtime calculations that cannot be expressed declaratively.
 *
 * Called from the Alpine board component methods.
 */

/** Adds n days to an ISO date string (local timezone). Returns ISO string. */
export function addIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/** Measures the actual rendered width of a day column from a track element. */
export function dayWidthOf(track: HTMLElement, cols: number): number {
  return track.getBoundingClientRect().width / cols
}

/** Recalculates lane stacking for all bars within a single track. */
export function relayout(track: HTMLElement, compact: boolean): void {
  const bars = Array.from(track.querySelectorAll<HTMLElement>('.bar'))
  bars.sort((a, b) => {
    const sa = +(a.dataset.startIdx ?? '0')
    const sb = +(b.dataset.startIdx ?? '0')
    return sa - sb || +(b.dataset.vspan ?? '0') - +(a.dataset.vspan ?? '0')
  })

  const laneEnds: number[] = []
  for (const bar of bars) {
    const s = +(bar.dataset.startIdx ?? '0')
    const sp = compact ? 1 : Math.max(1, +(bar.dataset.vspan ?? '1'))
    let lane = laneEnds.findIndex((end) => end < s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(-1)
    }
    laneEnds[lane] = s + sp - 1
    bar.style.top = `calc(${lane} * var(--lane-h) + 3px)`
    bar.style.left = `calc(${s} * var(--day-w))`
    bar.style.width = `calc(${sp} * var(--day-w) - 5px)`
  }
  track.style.height = `calc(${Math.max(1, laneEnds.length)} * var(--lane-h) + 6px)`
}

/** Relayout all tracks in the document. */
export function relayoutAll(compact: boolean): void {
  document.querySelectorAll<HTMLElement>('.track').forEach((t) => relayout(t, compact))
}

/** Gets the workstation code of an element's line (card → data-line, bar → track parent). */
export function lineOf(el: HTMLElement): string | undefined {
  if (el.classList.contains('card')) return el.dataset.line
  return el.closest('.track')?.dataset.col
}

/** Recomputes charge totals per day column based on visible (non-dimmed, non-hidden) bars. */
export function recomputeCharge(cols: number): void {
  const totals = new Array<number>(cols).fill(0)
  document.querySelectorAll<HTMLElement>('.bar').forEach((bar) => {
    if (bar.classList.contains('dim')) return
    const row = bar.closest('.row')
    if (row && row.classList.contains('hide')) return
    const s = +(bar.dataset.startIdx ?? '-1')
    if (s >= 0 && s < cols) totals[s] += +(bar.dataset.hours ?? '0')
  })
  document.querySelectorAll<HTMLElement>('.dcol').forEach((dc, i) => {
    const dh = dc.querySelector<HTMLElement>('.dh')
    if (dh) dh.textContent = `${Math.round(totals[i] ?? 0)} h`
  })
}

/** Applies feasibility badge to a bar element. */
export function applyBarBadge(numOf: string, feasible: boolean | null): void {
  const bar = document.querySelector<HTMLElement>(
    `.bar[data-num-of="${CSS.escape(numOf)}"]`,
  )
  if (!bar) return

  bar.style.outline = ''
  bar.style.outlineOffset = ''
  const old = bar.querySelector('.feas-badge')
  if (old) old.remove()

  if (feasible === true) {
    bar.style.outline = '2px solid #2e9e00'
    bar.style.outlineOffset = '-1px'
    bar.insertAdjacentHTML(
      'beforeend',
      '<span class="feas-badge bg-st-ferme text-white" title="Faisable">✓</span>',
    )
  } else if (feasible === false) {
    bar.style.outline = '2px solid #b42318'
    bar.style.outlineOffset = '-1px'
    bar.insertAdjacentHTML(
      'beforeend',
      '<span class="feas-badge bg-danger text-white" title="Bloqué — composants manquants">✕</span>',
    )
  }
}

/** Clears all feasibility badges from bars. */
export function clearAllBadges(): void {
  document.querySelectorAll('.bar .feas-badge').forEach((b) => b.remove())
  document.querySelectorAll<HTMLElement>('.bar').forEach((b) => {
    b.style.outline = ''
    b.style.outlineOffset = ''
  })
}
