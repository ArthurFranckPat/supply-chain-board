import { For, type Accessor } from 'solid-js'
import type { PathSpec } from '@/lib/vision/link-overlay'

/**
 * Overlay SVG des liens OF↔commande, mode « combiné » (issue #52 — extrait de
 * scheduler/programme.tsx). Liens masqués par défaut : visibles seulement au
 * survol d'un OF ou d'une commande (sinon board trop fouillis).
 */
export function LinksOverlay(props: { paths: Accessor<PathSpec[]>; isActive: (p: PathSpec) => boolean }) {
  return (
    <svg class="pointer-events-none absolute inset-0 z-[5]" style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <For each={props.paths()}>
        {(p) => {
          const on = () => props.isActive(p)
          return (
            <path
              d={p.d}
              fill="none"
              stroke="var(--color-terra)"
              stroke-width={p.suggere ? 1.8 : 2.2}
              stroke-dasharray={p.suggere ? '5 4' : undefined}
              opacity={on() ? (p.suggere ? 0.8 : 0.95) : 0}
              style={{ transition: 'opacity .15s' }}
            />
          )
        }}
      </For>
    </svg>
  )
}
