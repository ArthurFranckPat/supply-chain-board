import { For, Show, type Accessor } from 'solid-js'
import type { ImpactVerdict } from '@/lib/vision/impact'
import { deltaLabel } from '@/lib/vision/impact'
import type { PathSpec } from '@/lib/vision/link-overlay'

/**
 * Overlay SVG des liens OF↔commande, mode « combiné » (issue #52 — extrait de
 * scheduler/programme.tsx). Issue #23 : couche d'impact —
 *  • lien `retard` → rouge, VISIBLE D'EMBLÉE (opacité de base), badge « +N j » ;
 *  • lien `limite` → ambre, visible au survol ;
 *  • lien `ok` / null → terra, masqué hors survol (comportement inchangé).
 *
 * Un retard présent à l'ouverture est ainsi détectable sans interaction (cas 1
 * de l'issue), contrairement à l'état antérieur (tous liens masqués par défaut).
 */
const STROKE: Record<ImpactVerdict, string> = {
  retard: 'var(--color-error)',
  limite: '#d97706', // amber-600
  ok: 'var(--color-terra)',
}

export function LinksOverlay(props: {
  paths: Accessor<PathSpec[]>
  isActive: (p: PathSpec) => boolean
  /** #23 : highlight forcé de tous les liens en retard (clic compteur toolbar). */
  highlightRetards?: Accessor<boolean>
}) {
  const highlight = () => props.highlightRetards?.() ?? false
  return (
    <svg
      class="pointer-events-none absolute inset-0 z-[5]"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <For each={props.paths()}>
        {(p) => {
          const on = () => props.isActive(p)
          // #23 : visibilité par verdict. retard = visible d'emblée (ou si highlight
          // toolbar activé) ; limite/ok = masqués hors survol (comportement inchangé).
          const baseOpacity = () => {
            if (p.verdict === 'retard') return 0.55
            if (p.verdict === 'limite' && highlight()) return 0.55
            return 0
          }
          const opacity = () => {
            if (on()) return p.suggere ? 0.8 : 0.95
            return baseOpacity()
          }
          const stroke = () => (p.verdict ? STROKE[p.verdict] : 'var(--color-terra)')
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
              <Show when={(p.verdict === 'retard' || (p.verdict === 'limite' && highlight())) && p.deltaJours !== null}>
                <g opacity={on() || p.verdict === 'retard' ? 1 : 0.7} style={{ transition: 'opacity .15s' }}>
                  <rect
                    x={p.mid.x - 16}
                    y={p.mid.y - 8}
                    width={32}
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
                    style={{ 'font-size': '9.5px', 'font-weight': 700, fill: stroke() }}
                  >
                    {deltaLabel(p.deltaJours)}
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
