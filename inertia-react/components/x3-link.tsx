/**
 * Lien « Ouvrir dans X3 » (issue #118) — composant partagé de toutes les
 * surfaces du board.
 *
 * Lit la prop Inertia partagée `x3Web` (posée par `inertia_middleware`, suit
 * l'environnement de la session). Sans endpoint configuré ou avec une clé
 * vide, rend le contenu en texte brut — jamais de lien mort, jamais de lien
 * vers le mauvais environnement.
 *
 * Deux variantes (lot 4) :
 *  • `iconOnly` — le numéro garde son action interne (drill-down, sheet), X3
 *    est une icône séparée à côté. Rien n'est rendu si le lien est impossible.
 *  • sinon — le numéro est le lien.
 */
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { ExternalLink } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { x3Href, type X3Fonction, type X3Web } from '@r/lib/x3-link'

export function X3Link(props: {
  fonction: X3Fonction
  cle: string
  /** Titre du lien (aria + title), ex. « Ouvrir la commande dans Sage X3 ». */
  title?: string
  className?: string
  /** Icône seule, à côté d'un numéro qui garde son action interne (lot 4). */
  iconOnly?: boolean
  children?: ReactNode
}) {
  const web = usePage<{ x3Web: X3Web | null }>().props.x3Web
  const href = x3Href(web, props.fonction, props.cle)

  if (!href) {
    return props.iconOnly ? null : <span className={props.className}>{props.children}</span>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // Les ancres sont implicitement draggables : sur une carte de board, un
      // glisser démarré depuis le n° (l'ancre la plus visée) lancerait le drag
      // du lien au lieu de celui de la carte (revue #118).
      draggable={false}
      title={props.title}
      aria-label={props.title}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center gap-1 underline-offset-2 transition-colors',
        'hover:text-[#2778c1] hover:underline focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-brand/40 rounded-sm',
        props.className
      )}
    >
      {!props.iconOnly && props.children}
      <ExternalLink
        size={props.iconOnly ? 12 : 11}
        strokeWidth={2}
        className="shrink-0 opacity-60"
      />
    </a>
  )
}
