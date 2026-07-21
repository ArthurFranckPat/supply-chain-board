import { useState } from 'react'
import { cn } from '@r/lib/utils'
import type { VisionCommande } from '@/lib/vision/types'
import { fmtDay } from '@/lib/vision/date-utils'
import type { ImpactVerdict } from '@/lib/vision/impact'
import { deltaLabel } from '@/lib/vision/impact'
import {
  VERDICT_BORDER,
  VERDICT_ICON,
  VERDICT_LABEL,
  UNKNOWN_BORDER,
  UNKNOWN_ICON,
} from '@/lib/vision/verdict-tones'
import { DynamicIcon } from '../ui/dynamic-icon'

/**
 * Marqueur commande rendu dans une cellule du board (slot cellExtra de
 * BoardGrid), mode « combiné » (issue #52 — extrait de scheduler/programme.tsx).
 *
 * Issue #23 : la bordure gauche + icône passent à la couleur du verdict le plus
 * grave des liens rattachés (retard = rouge, limite = ambre) ; badge « +N j » à
 * côté de la date quand le delta est chiffré.
 *
 * #62 (lot 0) : verdict null (non évalué — aucun lien, impact incalculable) ≠ ok.
 * Le marqueur passe en ton NEUTRE (gris) au lieu d'emprunter la teinte du « ok » :
 * afficher « à l'heure » ce qu'on n'a pas évalué est un signal mensonger.
 * #62 (lot 2) : tons extraits vers lib/vision/verdict-tones.ts (source unique).
 */

export function CommandeMarker(props: {
  lineCode: string
  cmd: VisionCommande
  cmdIso: (cmd: VisionCommande) => string | null
  /** #23 : verdict le plus grave des liens de cette commande (null = pas de verdict). */
  verdict?: ImpactVerdict | null
  /** #23 : delta (jours) du pire lien — alimente le badge « +N j ». */
  deltaJours?: number | null
  onActivate?: (id: string | null) => void
  onDragStart?: (cmd: VisionCommande) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const cmd = props.cmd
  const verdict = props.verdict ?? null
  const borderClass = verdict ? VERDICT_BORDER[verdict] : UNKNOWN_BORDER
  const iconClass = verdict ? VERDICT_ICON[verdict] : UNKNOWN_ICON
  const iconName =
    verdict === 'retard'
      ? 'schedule_send'
      : verdict === 'limite'
        ? 'schedule'
        : 'local_shipping'
  // #62 (lot 1) : libellé accessible — numéro + ligne + verdict verbalisé.
  const ariaLabel =
    `Commande ${cmd.numCommande}${cmd.ligne ? `, ligne ${cmd.ligne}` : ''}${
      verdict ? `, ${VERDICT_LABEL[verdict]}` : ', non évaluée'
    }`

  return (
    <div
      data-link-cmd={`${props.lineCode}:${cmd.id}`}
      draggable={!!cmd.ligne}
      tabIndex={0}
      aria-label={ariaLabel}
      onDragStart={(e) => {
        if (!cmd.ligne) return
        e.dataTransfer?.setData(
          'application/x-cmd',
          JSON.stringify({ id: cmd.id, numCommande: cmd.numCommande, ligne: cmd.ligne })
        )
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        props.onDragStart?.(cmd)
      }}
      onMouseEnter={() => {
        setActiveId(cmd.id)
        props.onActivate?.(cmd.id)
      }}
      onMouseLeave={() => {
        setActiveId(null)
        props.onActivate?.(null)
      }}
      onFocus={() => {
        setActiveId(cmd.id)
        props.onActivate?.(cmd.id)
      }}
      onBlur={() => {
        setActiveId(null)
        props.onActivate?.(null)
      }}
      className={cn(
        'relative overflow-hidden rounded-[6px] border border-rule bg-brand-soft px-1.5 py-1.5 leading-tight shadow-[0_1px_2px_rgba(0,0,0,.06)] transition-shadow duration-150',
        borderClass,
        cmd.ligne ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        activeId === cmd.id &&
          'shadow-[0_2px_10px_rgba(0,0,0,.22)] ring-1 ring-brand/50'
      )}
    >
      {/* Numéro complet (+ ligne) sur sa propre ligne, police réduite pour rentrer. */}
      <div className="flex items-baseline gap-1 whitespace-nowrap font-mono text-2xs font-bold text-brand">
        <DynamicIcon name={iconName} size={12} strokeWidth={1.75} className={cn('flex-none self-center', iconClass)} />
        <span>
          {cmd.numCommande}
          {cmd.ligne && (
            <span className="text-brand/70">·L{cmd.ligne}</span>
          )}
        </span>
        {/* #23 : badge retard « +N j » */}
        {verdict !== null && props.deltaJours !== null && props.deltaJours !== undefined && (
          <span
            className={cn(
              'ml-auto rounded-full px-1 py-px font-mono text-3xs font-bold tabular-nums',
              verdict === 'retard' ? 'bg-error/10 text-error' : 'bg-suggere/10 text-suggere'
            )}
          >
            {deltaLabel(props.deltaJours!)}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {cmd.type && (
          <span className="flex-none rounded bg-brand-soft px-1 py-px font-mono text-3xs font-bold uppercase tracking-wider text-brand">
            {cmd.type}
          </span>
        )}
        <span className="flex-none font-fraunces text-2xs font-bold tabular-nums text-secondary-foreground">
          {fmtDay(props.cmdIso(cmd))}
        </span>
        {cmd.client && (
          <span className="truncate font-fraunces text-2xs italic text-muted-foreground">
            {cmd.client}
          </span>
        )}
      </div>
    </div>
  )
}
