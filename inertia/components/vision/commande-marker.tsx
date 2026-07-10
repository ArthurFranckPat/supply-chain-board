import { Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
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
  activeId: Accessor<string | null>
  onActivate: (id: string | null) => void
  /** #23 : verdict le plus grave des liens de cette commande (null = pas de verdict). */
  verdict?: ImpactVerdict | null
  /** #23 : delta (jours) du pire lien — alimente le badge « +N j ». */
  deltaJours?: number | null
}) {
  const cmd = props.cmd
  const verdict = () => props.verdict ?? null
  const borderClass = () =>
    verdict() ? VERDICT_BORDER[verdict()!] : UNKNOWN_BORDER
  const iconClass = () => (verdict() ? VERDICT_ICON[verdict()!] : UNKNOWN_ICON)
  const iconName = () =>
    verdict() === 'retard' ? 'schedule_send' : verdict() === 'limite' ? 'schedule' : 'local_shipping'
  // #62 (lot 1) : libellé accessible — numéro + ligne + verdict verbalisé.
  const ariaLabel = () =>
    `Commande ${cmd.numCommande}${cmd.ligne ? `, ligne ${cmd.ligne}` : ''}${
      verdict() ? `, ${VERDICT_LABEL[verdict()!]}` : ', non évaluée'
    }`
  return (
    <div
      data-link-cmd={`${props.lineCode}:${cmd.id}`}
      draggable={!!cmd.ligne}
      tabindex={0}
      aria-label={ariaLabel()}
      onDragStart={(e) => {
        if (!cmd.ligne) return
        e.dataTransfer?.setData(
          'application/x-cmd',
          JSON.stringify({ id: cmd.id, numCommande: cmd.numCommande, ligne: cmd.ligne }),
        )
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      }}
      onMouseEnter={() => props.onActivate(cmd.id)}
      onMouseLeave={() => props.onActivate(null)}
      onFocus={() => props.onActivate(cmd.id)}
      onBlur={() => props.onActivate(null)}
      class={cx(
        'relative overflow-hidden rounded-[6px] border border-rule border-l-[3px] bg-brand-soft px-1.5 py-1.5 leading-tight shadow-[0_1px_2px_rgba(31,26,19,.06)] transition-shadow duration-150',
        borderClass(),
        cmd.ligne ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        props.activeId() === cmd.id && 'shadow-[0_2px_10px_rgba(168,67,31,.22)] ring-1 ring-brand/50',
      )}
    >
      {/* Numéro complet (+ ligne) sur sa propre ligne, police réduite pour rentrer. */}
      <div class="flex items-baseline gap-1 whitespace-nowrap font-mono text-2xs font-bold text-brand">
        <span class={cx('material-symbols-outlined flex-none self-center text-xs', iconClass())}>
          {iconName()}
        </span>
        <span>
          {cmd.numCommande}
          <Show when={cmd.ligne}>
            <span class="text-brand/70">·L{cmd.ligne}</span>
          </Show>
        </span>
        {/* #23 : badge retard « +N j » */}
        <Show when={verdict() !== null && props.deltaJours !== null && props.deltaJours !== undefined}>
          <span
            class={cx(
              'ml-auto rounded-full px-1 py-px font-mono text-3xs font-bold tabular-nums',
              verdict() === 'retard'
                ? 'bg-error/10 text-error'
                : 'bg-amber-500/10 text-amber-600',
            )}
          >
            {deltaLabel(props.deltaJours!)}
          </span>
        </Show>
      </div>
      <div class="mt-1 flex items-center gap-1">
        <Show when={cmd.type}>
          <span class="flex-none rounded bg-brand-soft px-1 py-px font-mono text-3xs font-bold uppercase tracking-wider text-brand">
            {cmd.type}
          </span>
        </Show>
        <span class="flex-none font-fraunces text-2xs font-bold tabular-nums text-secondary-foreground">
          {fmtDay(props.cmdIso(cmd))}
        </span>
        <Show when={cmd.client}>
          <span class="truncate font-fraunces text-2xs italic text-muted-foreground">
            {cmd.client}
          </span>
        </Show>
      </div>
    </div>
  )
}
