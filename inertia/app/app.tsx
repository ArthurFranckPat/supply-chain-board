import '../../resources/css/app.css'

import { render } from 'solid-js/web'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'solid-sonner'
import { createInertiaApp } from '../lib/inertia-solid'

const pages = import.meta.glob('../pages/**/*.tsx')

createInertiaApp({
  resolve: async (name) => {
    // Filet inter-runtimes (migration react-shadcn §4.4) : composant absent du
    // bundle Solid (visite XHR vers une route React) → hard reload pour que le
    // serveur serve le layout React. `await` dans le try : resolvePageComponent
    // rejette en async (un throw sync ne couvre pas le cas). Navigation
    // normale = <a> natifs.
    try {
      return await resolvePageComponent(`../pages/${name}.tsx`, pages)
    } catch (error) {
      console.warn(`Page [${name}] absente du bundle Solid — hard reload`, error)
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
    render(
      () => (
        <>
          <App {...props} />
          {/* #62 (lot 6) : Toaster global. Avant ce lot, les 9 dispatchs
              CustomEvent('sch-toast') étaient émis mais JAMAIS consommés —
              tous les messages ("Scénario appliqué", "Déplacement échoué"…)
              étaient avalés silencieusement. */}
          <Toaster position="top-right" richColors closeButton duration={4000} />
        </>
      ),
      el
    )
  },
})
