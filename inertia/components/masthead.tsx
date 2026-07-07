import { For, Show, createEffect, createMemo, type Component, type JSX } from 'solid-js'
import { Link, usePage } from '@/lib/inertia-solid'
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
  | 'dashboard'
  | 'programme'
  | 'load'
  | 'ruptures'
  | 'tracking'
  | 'expeditions'
  | 'receptions'
  | 'config'

/** Onglets canoniques (ordre + cibles uniques). */
const TABS: { key: MastheadTab; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Tableau', href: route('dashboard') },
  { key: 'programme', label: 'Programme', href: route('scheduler.programme') },
  { key: 'load', label: 'Charge', href: route('load.index') },
  { key: 'ruptures', label: 'Ruptures', href: route('scheduler.shortage_tracker') },
  { key: 'tracking', label: 'Suivi', href: route('suivi.board') },
  { key: 'expeditions', label: 'Expéditions', href: route('expeditions.index') },
  { key: 'receptions', label: 'Réceptions', href: route('receptions.index') },
  { key: 'config', label: 'Config', href: route('calendar_config.index') },
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
  const page = usePage<{ authUser: { env: 'test' | 'prod' } | null }>()
  const env = createMemo(() => page.props.authUser?.env)

  // Marque l'environnement X3 courant sur <html> : un seul CSS peut alors
  // rethémer toutes les pages d'un coup. Posé ici car le Masthead est présent
  // sur chaque page authentifiée (le sélecteur [data-env] fait la déclinaison
  // test dans resources/css/app.css).
  createEffect(() => {
    const e = env()
    if (e) document.documentElement.dataset.env = e
    else delete document.documentElement.dataset.env
  })

  return (
    <header class="relative flex-none border-b border-rule bg-background print:hidden">
      {/* Bandeau d'alerte — uniquement en test, superposé pour ne pas impacter
          la hauteur fixe calibrée ci-dessous. */}
      <Show when={env() === 'test'}>
        <div class="absolute inset-x-0 top-0 z-10 h-[3px] bg-terra" aria-hidden="true" />
      </Show>
      {/* Hauteur fixe : toutes les pages alignent le bandeau titre, même sans
          `meta` (ex. Tableau). Calée sur la hauteur naturelle du meta 2 lignes
          (≈60px) → plus de décalage vertical entre pages à la navigation. */}
      <div class="flex min-h-[60px] items-end justify-between gap-5 px-7 pb-2 pt-3.5">
        <div class="flex items-center gap-3.5">
          <div class="font-fraunces text-[28px] font-black leading-[0.9] tracking-tight">
            Supply Chain <span class="font-medium italic text-terra">AERECO</span>
          </div>
          <div class="pb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
            {props.subtitle}
          </div>
          {/* Pastille d'environnement — voyante en test (remplie, accent test),
              discrète en prod (contour neutre). Toujours visible pour lever
              l'ambiguïté prod/test sur les données Sage X3. */}
          <Show when={env()}>
            {(e) => (
              <span
                title={`Environnement Sage X3 : ${e()}`}
                class={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${
                  e() === 'test'
                    ? 'border-transparent bg-terra text-card'
                    : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                <span class="size-[5px] rounded-full bg-current" />
                {e() === 'test' ? 'Test' : 'Prod'}
              </span>
            )}
          </Show>
        </div>
        <Show when={props.meta}>
          <div class="text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground">
            {props.meta}
          </div>
        </Show>
      </div>

      {/* Hauteur fixe aussi sur la rangée nav : pages à actions (recherche
          h-[30px]) vs Tableau (UserMenu 28px seul) donnaient ~2px d'écart. */}
      <nav class="flex min-h-[44px] items-center gap-1 border-t border-rule px-7">
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
