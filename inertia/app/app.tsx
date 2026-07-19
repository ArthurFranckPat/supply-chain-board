import '../../resources/css/app.css'

import { render } from 'solid-js/web'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'solid-sonner'
import { createInertiaApp } from '../lib/inertia-solid'

const pages = import.meta.glob('../pages/**/*.tsx')

createInertiaApp({
  resolve: (name) => {
    // Filet inter-runtimes (migration react-shadcn §4.4) : composant absent du
    // bundle Solid (visite XHR vers une route React) → hard reload pour que le
    // serveur serve le layout React. Navigation normale = <a> natifs.
    try {
      return resolvePageComponent(`../pages/${name}.tsx`, pages)
    } catch (error) {
      console.warn(`Page [${name}] absente du bundle Solid — hard reload`, error)
      window.location.reload()
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
