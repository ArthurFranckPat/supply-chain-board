import { Show, type JSX } from 'solid-js'

/**
 * État vide guidé — titre + description + (optionnel) CTA.
 *
 * Issue #62 (lot 6) : remplace les ~12 états vides ad-hoc (inline <Show
 * fallback>) par un composant réutilisable. Modèle : papier-board.tsx.
 */
export function Empty(props: {
  icon: string
  title: string
  description?: string
  action?: JSX.Element
}) {
  return (
    <div class="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span class="material-symbols-outlined text-[28px] text-muted-foreground/60">{props.icon}</span>
      <div class="font-fraunces text-sm font-bold">{props.title}</div>
      <Show when={props.description}>
        <div class="font-fraunces text-sm italic text-muted-foreground">{props.description}</div>
      </Show>
      <Show when={props.action}>
        <div class="mt-2">{props.action}</div>
      </Show>
    </div>
  )
}
