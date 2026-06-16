/**
 * Adaptateur SolidJS pour Inertia, bâti directement sur `@inertiajs/core` (v2).
 *
 * Il n'existe pas d'adaptateur Solid officiel/maintenu : on réimplémente ici le
 * strict nécessaire de `createInertiaApp` (montage initial + swap de page sur
 * visite + layouts persistants + contexte de page réactif), à l'image des
 * adaptateurs React/Vue.
 *
 * Réactivité : la page courante est exposée via un store Solid. Les props
 * passées au composant de page sont un instantané au montage ; pour de l'état
 * qui doit réagir aux rechargements partiels (`router.reload({ only })`),
 * lisez `usePage().props` (réactif, mis à jour via `reconcile`).
 */
import { router, setupProgress, shouldIntercept } from '@inertiajs/core'
import type { Page, PageProps, VisitOptions, Method } from '@inertiajs/core'
import {
  createContext,
  createMemo,
  createSignal,
  splitProps,
  useContext,
  Show,
  type Component,
  type JSX,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'

/** Composant de page, éventuellement porteur d'un layout persistant. */
export type InertiaPage = Component<PageProps> & {
  layout?: Component<{ children: JSX.Element }> | Component<{ children: JSX.Element }>[]
}

type ResolveResult = InertiaPage | { default: InertiaPage }
// Volontairement large : `resolvePageComponent` (@adonisjs/inertia) renvoie `unknown`.
type ResolveComponent = (name: string) => unknown

interface SetupProps {
  initialPage: Page
  initialComponent: InertiaPage
  resolveComponent: (name: string) => Promise<InertiaPage>
}

interface CreateInertiaAppOptions {
  /** Id du nœud racine injecté par `@inertia` (défaut : `app`). */
  id?: string
  /** Résout un nom de page vers son composant (via `import.meta.glob`). */
  resolve: ResolveComponent
  /** Monte l'app Solid sur `el`. */
  setup: (options: { el: HTMLElement; App: Component<SetupProps>; props: SetupProps }) => void
  /** Barre de progression Inertia. `false` pour désactiver. */
  progress?: false | Parameters<typeof setupProgress>[0]
}

/* -------------------------------------------------------------------------- */
/* Contexte de page                                                            */
/* -------------------------------------------------------------------------- */

const PageContext = createContext<Page>()

/** Page Inertia courante (store réactif) : `usePage().props`, `.url`, etc. */
export function usePage<T extends PageProps = PageProps>(): Page<T> {
  const ctx = useContext(PageContext)
  if (!ctx) throw new Error('usePage() doit être appelé dans l’arbre <App> Inertia')
  return ctx as Page<T>
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                   */
/* -------------------------------------------------------------------------- */

function unwrap(mod: unknown): InertiaPage {
  const result = mod as ResolveResult
  return (result && typeof result === 'object' && 'default' in result
    ? result.default
    : result) as InertiaPage
}

export async function createInertiaApp(options: CreateInertiaAppOptions): Promise<void> {
  const { id = 'app', resolve, setup, progress = {} } = options

  const el = document.getElementById(id)
  if (!el) throw new Error(`Élément racine Inertia introuvable : #${id}`)

  // @adonisjs/inertia embarque la page dans `<div id="app" data-page="<json>">`.
  // On la lit directement (getInitialPageFromDOM de core v3 attend un <script>,
  // format que le serveur Adonis n'émet pas).
  const raw = el.getAttribute('data-page')
  if (!raw) throw new Error(`Données de page Inertia absentes sur #${id}`)
  const initialPage = JSON.parse(raw) as Page

  const resolveComponent = async (name: string) => unwrap(await resolve(name))
  const initialComponent = await resolveComponent(initialPage.component)

  if (progress !== false) setupProgress(progress)

  setup({ el, App, props: { initialPage, initialComponent, resolveComponent } })
}

/* -------------------------------------------------------------------------- */
/* Composant racine                                                            */
/* -------------------------------------------------------------------------- */

function App(props: SetupProps): JSX.Element {
  const [component, setComponent] = createSignal<InertiaPage>(props.initialComponent)
  const [page, setPage] = createStore<Page>(props.initialPage)

  router.init({
    initialPage: props.initialPage,
    resolveComponent: props.resolveComponent,
    swapComponent: async ({ component: next, page: nextPage }) => {
      setComponent(() => next as InertiaPage)
      setPage(reconcile(nextPage as Page))
    },
  })

  // Layouts (un seul niveau ou chaîne), persistants tant que le composant les expose.
  const layouts = createMemo<Component<{ children: JSX.Element }>[]>(() => {
    const layout = component().layout
    if (!layout) return []
    return Array.isArray(layout) ? layout : [layout]
  })

  // Page nue, props réactives via le store.
  const pageElement = () => <Dynamic component={component()} {...page.props} />

  // Imbrique la page dans sa chaîne de layouts (du plus interne au plus externe).
  const tree = createMemo<JSX.Element>(() =>
    layouts()
      .slice()
      .reverse()
      .reduce<JSX.Element>(
        (children, Layout) => <Dynamic component={Layout} {...page.props}>{children}</Dynamic>,
        pageElement()
      )
  )

  return (
    <PageContext.Provider value={page}>
      <Show when={layouts().length} fallback={pageElement()}>
        {tree()}
      </Show>
    </PageContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* <Link>                                                                      */
/* -------------------------------------------------------------------------- */

export interface LinkProps
  extends Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  href: string
  method?: Method
  data?: VisitOptions['data']
  replace?: boolean
  preserveScroll?: boolean
  preserveState?: boolean
  only?: string[]
  headers?: Record<string, string>
}

/** Lien de navigation Inertia (visite XHR, pas de full reload). */
export function Link(props: LinkProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'href',
    'method',
    'data',
    'replace',
    'preserveScroll',
    'preserveState',
    'only',
    'headers',
    'children',
  ])

  const onClick = (event: MouseEvent) => {
    if (!shouldIntercept(event)) return
    event.preventDefault()
    router.visit(local.href, {
      method: local.method ?? 'get',
      data: local.data,
      replace: local.replace,
      preserveScroll: local.preserveScroll,
      preserveState: local.preserveState,
      only: local.only,
      headers: local.headers,
    } as VisitOptions)
  }

  return (
    <a href={local.href} onClick={onClick} {...rest}>
      {local.children}
    </a>
  )
}

export { router }
