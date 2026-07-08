import { Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import type { VisionCommande } from '@/lib/vision/types'
import { fmtDay } from '@/lib/vision/date-utils'

/**
 * Marqueur commande rendu dans une cellule du board (slot cellExtra de
 * BoardGrid), mode « combiné » (issue #52 — extrait de scheduler/programme.tsx).
 */
export function CommandeMarker(props: {
  lineCode: string
  cmd: VisionCommande
  cmdIso: (cmd: VisionCommande) => string | null
  activeId: Accessor<string | null>
  onActivate: (id: string | null) => void
}) {
  const cmd = props.cmd
  return (
    <div
      data-link-cmd={`${props.lineCode}:${cmd.id}`}
      draggable={!!cmd.ligne}
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
      class={cx(
        'relative overflow-hidden rounded-[6px] border border-rule border-l-[3px] border-l-terra bg-terra-soft px-1.5 py-1.5 leading-tight shadow-[0_1px_2px_rgba(31,26,19,.06)] transition-shadow duration-150',
        cmd.ligne ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        props.activeId() === cmd.id && 'shadow-[0_2px_10px_rgba(168,67,31,.22)] ring-1 ring-terra/50',
      )}
    >
      {/* Numéro complet (+ ligne) sur sa propre ligne, police réduite pour rentrer. */}
      <div class="flex items-baseline gap-1 whitespace-nowrap font-mono text-[9.5px] font-bold text-terra">
        <span class="material-symbols-outlined flex-none self-center text-[11px] text-terra">
          local_shipping
        </span>
        <span>
          {cmd.numCommande}
          <Show when={cmd.ligne}>
            <span class="text-terra/70">·L{cmd.ligne}</span>
          </Show>
        </span>
      </div>
      <div class="mt-1 flex items-center gap-1">
        <Show when={cmd.type}>
          <span class="flex-none rounded bg-terra-soft px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wider text-terra">
            {cmd.type}
          </span>
        </Show>
        <span class="flex-none font-fraunces text-[10px] font-bold tabular-nums text-secondary-foreground">
          {fmtDay(props.cmdIso(cmd))}
        </span>
        <Show when={cmd.client}>
          <span class="truncate font-fraunces text-[9.5px] italic text-muted-foreground">
            {cmd.client}
          </span>
        </Show>
      </div>
    </div>
  )
}
