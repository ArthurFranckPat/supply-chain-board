import { For, Show, type Accessor } from 'solid-js'
import { deltaLabel } from '@/lib/vision/impact'
import { VERDICT_STROKE } from '@/lib/vision/verdict-tones'
import type { PathSpec } from '@/lib/vision/link-overlay'

/**
 * Overlay SVG des liens OF↔commande, mode « combiné » (issue #52 — extrait de
 * scheduler/programme.tsx). Issue #23 : couche d'impact —
 *  • lien `retard` → rouge, VISIBLE D'EMBLÉE (opacité de base), badge « +N j » ;
 *  • lien `limite` → ambre, présence atténuée d'emblée ;
 *  • lien `ok` / null → brand, masqué hors survol (comportement inchangé).
 *
 * Un retard présent à l'ouverture est ainsi détectable sans interaction (cas 1
 * de l'issue), contrairement à l'état antérieur (tous liens masqués par défaut).
 * #62 (lot 2) : tons extraits vers lib/vision/verdict-tones.ts (source unique).
 * Programme v2 : segment « Liens » 3 états (Aucun / Problèmes / Tous) remplace
 * le toggle binaire highlightRetards.
 */

export type LinkMode = 'none' | 'problems' | 'all'

export function LinksOverlay(props: {
  paths: Accessor<PathSpec[]>
  isActive: (p: PathSpec) => boolean
  /** Programme v2 : segment Liens (Aucun / Problèmes / Tous). Défaut 'problems'. */
  linkMode?: Accessor<LinkMode>
}) {
  const mode = () => props.linkMode?.() ?? 'problems'
  return (
    <svg
      class="pointer-events-none absolute inset-0 z-[5]"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <For each={props.paths()}>
        {(p) => {
          const on = () => props.isActive(p)
          // #62 (lot 0) : largeur du badge dérivée du label (≈5.8 px/caractère en
          // mono 9.5 px + marges) — un « +12 j » ne déborde plus des 32 px fixes.
          const badgeLabel = deltaLabel(p.deltaJours)
          const badgeW = Math.max(24, Math.round(badgeLabel.length * 5.8) + 12)
          // Programme v2 — opacité de base par verdict × mode du segment :
          //   none     → tout masqué (sauf survol)
          //   problems → retard 0.55, limite 0.3, ok 0
          //   all      → retard 0.55, limite 0.3, ok 0.25
          const baseOpacity = () => {
            if (mode() === 'none') return 0
            if (p.verdict === 'retard') return 0.55
            if (p.verdict === 'limite') return 0.3
            return mode() === 'all' ? 0.25 : 0
          }
          const opacity = () => {
            if (on()) return p.suggere ? 0.8 : 0.95
            return baseOpacity()
          }
          const stroke = () => (p.verdict ? VERDICT_STROKE[p.verdict] : 'var(--color-brand)')
          // Badge visible pour retard (toujours), limite (si mode ≠ none), ok (si all)
          const badgeVisible = () =>
            p.deltaJours !== null &&
            (p.verdict === 'retard' ||
              (p.verdict === 'limite' && mode() !== 'none') ||
              mode() === 'all')
          return (
            <>
              <path
                d={p.d}
                fill="none"
                stroke={stroke()}
                stroke-width={p.verdict === 'retard' ? 2.4 : p.suggere ? 1.8 : 2.2}
                stroke-dasharray={p.suggere ? '5 4' : undefined}
                opacity={opacity()}
                style={{ transition: 'opacity .15s' }}
              />
              {/* Étiquette « +N j » au milieu du path (retard / limite seulement). */}
              <Show when={badgeVisible()}>
                <g
                  opacity={on() || p.verdict === 'retard' ? 1 : 0.7}
                  style={{ transition: 'opacity .15s' }}
                >
                  <rect
                    x={p.mid.x - badgeW / 2}
                    y={p.mid.y - 8}
                    width={badgeW}
                    height={16}
                    rx={8}
                    fill="var(--color-card, #fffdf8)"
                    stroke={stroke()}
                    stroke-width={1}
                  />
                  <text
                    x={p.mid.x}
                    y={p.mid.y + 3.5}
                    text-anchor="middle"
                    class="font-mono"
                    style={{ 'font-size': '9.5px', 'font-weight': 700, 'fill': stroke() }}
                  >
                    {badgeLabel}
                  </text>
                </g>
              </Show>
            </>
          )
        }}
      </For>
    </svg>
  )
}
