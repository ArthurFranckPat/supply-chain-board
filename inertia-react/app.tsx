import React from 'react'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { CarbonProvider, GlobalStyle } from 'carbon-react'
import { I18nProvider } from 'carbon-react/esm/components/i18n-provider/i18n-provider.component.js'
import frFR from 'carbon-react/esm/locales/fr-fr.js'
import TokensWrapper from 'carbon-react/esm/components/tokens-wrapper'
import { Toaster } from 'sonner'

// Stylesheets — ordre IMPORTANT.
//  1. styles/app.css   : Tailwind v4 + tokens sémantiques mappés sur Sage
//                        (remplace l'ancien import du thème Papier resources/css/app.css
//                        qui conflit avec @sage/design-tokens, issue #77).
//  2. design-tokens    : tokens bruts Sage au :root (--colorsActionMajor500…).
//  3. styles/sage.css  : alias courts --color-bg/panel/line… pour le code custom.
//  4. fonts Carbon     : @font-face "Sage UI" (consommée par <GlobalStyle />).
import './styles/app.css'
import '@sage/design-tokens/css/base.css'
import '@sage/design-tokens/css/origin.css'
import './styles/sage.css'
import 'carbon-react/esm/style/fonts.css'

const pages = import.meta.glob('./pages/**/*.tsx')

createInertiaApp({
  resolve: (name: string) => {
    // Inter-runtime navigation fallback (hard visit if page component not found in this glob)
    try {
      return resolvePageComponent(`./pages/${name}.tsx`, pages)
    } catch (error) {
      console.warn(`React Page [${name}] not found in React bundle. Falling back to hard reload...`, error)
      // Redirect to same URL to let the other frontend (Solid) handle it
      if (typeof globalThis !== 'undefined') {
        (globalThis as any).location?.reload()
      }
      return new Promise(() => {}) // Block rendering of incomplete React component tree
    }
  },
  setup({ el, App, props }: { el: Element; App: React.ComponentType<any>; props: any }) {
    const root = createRoot(el)
    root.render(
      <CarbonProvider>
        {/* I18nProvider : locale fr-FR pour tout Carbon (dates JJ/MM/AAAA,
            labels "Rechercher"/"Chargement en cours…", boutons Confirm…).
            Règle projet : jj/mm/aaaa à l'écran partout (issue #77 §7). */}
        <I18nProvider locale={frFR}>
          {/* GlobalStyle : reset + typographie Carbon (font "Sage UI", échelle h1-h6).
              Requis pour que les composants Carbon héritent du thème Sage officiel. */}
          <GlobalStyle />
          {/* TokensWrapper : injecte les CSS custom properties de la couche de tokens
              sémantiques "global"/composant (--button-typical-*, --global-space-comp-*…).
              Sans ce wrapper ces vars ne sont définies nulle part dans le DOM : les
              composants qui s'appuient dessus (ButtonToggle…) perdent bordure/fond
              (var(--x) non résolue = valeur vide) — cf issue #77 rendu /suivi. */}
          <TokensWrapper>
            <App {...props} />
            {/* Global Toaster for notifications */}
            <Toaster position="top-right" richColors closeButton duration={4000} />
          </TokensWrapper>
        </I18nProvider>
      </CarbonProvider>
    )
  },
})
