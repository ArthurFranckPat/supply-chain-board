import './styles/app.css'

import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'sonner'

const pages = import.meta.glob('./pages/**/*.tsx')

// @adonisjs/inertia@4.2 rend le format v2 (<div id="app" data-page="…">) alors
// que le client @inertiajs/react@3.6 attend le format v3 (<script data-page
// type="application/json">). On parse l'attribut nous-mêmes (le navigateur
// décode les entités HTML) et on passe `page` explicitement — même approche
// que l'adapter Solid custom.
const appEl = document.getElementById('app')
const initialPage = appEl?.dataset.page ? JSON.parse(appEl.dataset.page) : undefined

createInertiaApp({
  page: initialPage,
  resolve: (name: string) => {
    // Filet inter-runtimes : composant absent du bundle React (visite XHR
    // venue d'une page Solid) → hard visit pour laisser le serveur servir le
    // bon layout. La navigation normale passe par des <a> natifs (§4.4).
    try {
      // resolvePageComponent est typé Promise<unknown> (helper agnostique).
      return resolvePageComponent(`./pages/${name}.tsx`, pages) as any
    } catch (error) {
      console.warn(`Page [${name}] absente du bundle React — hard reload`, error)
      window.location.reload()
      return new Promise(() => {})
    }
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <>
        <App {...props} />
        <Toaster position="top-right" richColors closeButton duration={4000} />
      </>
    )
  },
})
