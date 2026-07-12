import '../../resources/css/app.css'

import { render } from 'solid-js/web'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'solid-sonner'
import { createInertiaApp } from '../lib/inertia-solid'

const pages = import.meta.glob('../pages/**/*.tsx')

createInertiaApp({
  resolve: (name) => resolvePageComponent(`../pages/${name}.tsx`, pages),
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
