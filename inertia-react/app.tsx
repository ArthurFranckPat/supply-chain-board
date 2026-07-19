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
  resolve: async (name: string) => {
    // Filet inter-runtimes : composant absent du bundle React (visite XHR
    // venue d'une page Solid, ou layout servi par un process périmé) → hard
    // reload pour laisser le serveur servir le bon layout. `await` dans le
    // try : resolvePageComponent REJETTE en async (un throw sync ne couvre
    // pas le cas). La navigation normale passe par des <a> natifs (§4.4).
    try {
      // resolvePageComponent est typé Promise<unknown> (helper agnostique).
      return (await resolvePageComponent(`./pages/${name}.tsx`, pages)) as any
    } catch (error) {
      console.warn(`Page [${name}] absente du bundle React — hard reload`, error)
      // Garde anti-boucle : un seul reload par URL par fenêtre de 10s.
      const key = `runtime-reload:${window.location.pathname}`
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
      } else {
        console.error(`Boucle de reload évitée pour [${name}] — layout serveur incohérent ?`)
      }
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
