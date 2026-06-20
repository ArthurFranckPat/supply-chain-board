import { For, Show, type Component, type JSX } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import UserMenu from '@/components/user-menu'

/**
 * Masthead « Papier » partagé — barre de navigation unique de toutes les pages
 * scheduler (Planification / Ordonnancement / Ruptures / Suivi). Garantit des
 * onglets, un actif et une grammaire identiques partout.
 *
 * - `subtitle` : libellé sous le logo (contexte de la page).
 * - `active`   : onglet courant (souligné terracotta).
 * - `meta`     : bloc d'info aligné à droite du bandeau (dates / compteurs).
 * - `actions`  : contenu à droite de la nav (recherche, filtres…) ; le menu
 *                utilisateur est toujours ajouté en dernier par le composant.
 */

export type MastheadTab =
  | 'tableau'
  | 'planification'
  | 'ordonnancement'
  | 'vision'
  | 'ruptures'
  | 'suivi'

/** Onglets canoniques (ordre + cibles uniques). */
const TABS: { key: MastheadTab; label: string; href: string }[] = [
  { key: 'tableau', label: 'Tableau', href: route('tableau') },
  { key: 'planification', label: 'Planification', href: route('order_planning.board') },
  { key: 'ordonnancement', label: 'Ordonnancement', href: route('scheduler.expert_board') },
  { key: 'vision', label: 'Vision', href: route('scheduler.vision') },
  { key: 'ruptures', label: 'Ruptures', href: route('scheduler.shortage_tracker') },
  { key: 'suivi', label: 'Suivi', href: route('suivi.board') },
]

const tabCls = (active: boolean) =>
  `border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
    active ? 'border-terra text-terra' : 'border-transparent text-secondary-foreground hover:text-terra'
  }`

export const Masthead: Component<{
  subtitle: string
  active: MastheadTab
  meta?: JSX.Element
  actions?: JSX.Element
}> = (props) => {
  return (
    <header class="flex-none border-b border-rule bg-background">
      <div class="flex items-end justify-between gap-5 px-7 pb-2 pt-3.5">
        <div class="flex items-baseline gap-3.5">
          <div class="font-fraunces text-[28px] font-black leading-[0.9] tracking-tight">
            Factory<span class="font-medium italic text-terra">OS</span>
          </div>
          <div class="pb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
            {props.subtitle}
          </div>
        </div>
        <Show when={props.meta}>
          <div class="text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground">
            {props.meta}
          </div>
        </Show>
      </div>

      <nav class="flex items-center gap-1 border-t border-rule px-7">
        <For each={TABS}>
          {(t) => (
            <Link href={t.href} class={tabCls(t.key === props.active)}>
              {t.label}
            </Link>
          )}
        </For>
        <div class="ml-auto flex items-center gap-2 py-1.5">
          {props.actions}
          <UserMenu />
        </div>
      </nav>
    </header>
  )
}

export default Masthead
