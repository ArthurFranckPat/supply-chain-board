/**
 * Solid islands entry point.
 *
 * Bundled by esbuild + esbuild-plugin-solid → public/js/app.js.
 * Loaded with `defer` from the scheduler layout.
 *
 * Pattern: the server (Edge SSR) renders the page structure; Solid takes over
 * only the interactive zones marked `[data-solid="<name>"]`. Unpoly owns the
 * DOM swaps (#board-main), so islands are mounted/disposed via an Unpoly
 * compiler — runs on initial load, on every inserted fragment, and Unpoly
 * calls the returned destructor when the fragment is removed (no leaks).
 */

import { render } from 'solid-js/web'
import BoardGrid from './board/grid'
import { createBoardStore } from './board/store'
import type { BoardData } from './board/types'

declare global {
  interface Window {
    up?: {
      compiler: (selector: string, fn: (el: HTMLElement) => void | (() => void)) => void
    }
  }
}

/** An island factory mounts a Solid root on `el` and returns its dispose fn. */
type IslandFactory = (el: HTMLElement) => () => void

const ISLANDS: Record<string, IslandFactory> = {
  'board-grid': (el) => {
    const dataEl = document.getElementById('board-data')
    if (!dataEl?.textContent) {
      console.warn('[solid] #board-data introuvable')
      return () => {}
    }
    const data = JSON.parse(dataEl.textContent) as BoardData
    const store = createBoardStore(data)
    return render(() => <BoardGrid store={store} />, el)
  },
}

function mount(el: HTMLElement): (() => void) | void {
  const name = el.dataset.solid
  if (!name) return
  const factory = ISLANDS[name]
  if (!factory) {
    console.warn(`[solid] îlot inconnu: "${name}"`)
    return
  }
  return factory(el)
}

if (window.up) {
  // Unpoly drives mount + disposal across fragment swaps.
  window.up.compiler('[data-solid]', (el) => mount(el))
} else {
  // Fallback when Unpoly is absent (e.g. standalone pages).
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll<HTMLElement>('[data-solid]').forEach(mount)
  })
}
