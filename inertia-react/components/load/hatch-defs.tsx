import { FERME, SUGGERE } from '@/lib/load/chart-math'

/**
 * Motifs de hachure SVG partagés (document-global via url(#id)) : induit dans la
 * couleur du parent (ferme vert / prévision ambre). Définis une fois, référencés
 * par le mini-graphe et le graphe de détail. SVG 0×0 invisible.
 */
export function HatchDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern
          id="load-hatch-ferme"
          patternUnits="userSpaceOnUse"
          width="5"
          height="5"
          patternTransform="rotate(45)"
        >
          <rect width="5" height="5" fill={FERME} fillOpacity="0.22" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={FERME} strokeWidth="1.6" />
        </pattern>
        <pattern
          id="load-hatch-suggere"
          patternUnits="userSpaceOnUse"
          width="5"
          height="5"
          patternTransform="rotate(45)"
        >
          <rect width="5" height="5" fill={SUGGERE} fillOpacity="0.22" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={SUGGERE} strokeWidth="1.6" />
        </pattern>
      </defs>
    </svg>
  )
}
