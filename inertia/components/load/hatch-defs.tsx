import type { Component } from 'solid-js'
import { FERME, SUGGERE } from '@/lib/load/chart-math'

/**
 * Motifs de hachure SVG partagés (document-global via url(#id)) : induit dans la
 * couleur du parent (ferme vert / prévision ambre). Définis une fois, référencés
 * par le mini-graphe et le graphe de détail. SVG 0×0 invisible.
 */
export const HatchDefs: Component = () => (
  <svg width="0" height="0" class="absolute" aria-hidden="true">
    <defs>
      <pattern
        id="load-hatch-ferme"
        patternUnits="userSpaceOnUse"
        width="5"
        height="5"
        patternTransform="rotate(45)"
      >
        <rect width="5" height="5" fill={FERME} fill-opacity="0.22" />
        <line x1="0" y1="0" x2="0" y2="5" stroke={FERME} stroke-width="1.6" />
      </pattern>
      <pattern
        id="load-hatch-suggere"
        patternUnits="userSpaceOnUse"
        width="5"
        height="5"
        patternTransform="rotate(45)"
      >
        <rect width="5" height="5" fill={SUGGERE} fill-opacity="0.22" />
        <line x1="0" y1="0" x2="0" y2="5" stroke={SUGGERE} stroke-width="1.6" />
      </pattern>
    </defs>
  </svg>
)
