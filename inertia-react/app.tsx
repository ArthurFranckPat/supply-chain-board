import './styles/app.css'

import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'sonner'

const pages = import.meta.glob('./pages/**/*.tsx')

createInertiaApp({
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
