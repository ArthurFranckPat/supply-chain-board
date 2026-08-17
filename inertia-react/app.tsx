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
    // Le chargement d'une page peut échouer sans que la page soit en cause :
    // en dev, une re-optimisation de deps Vite invalide les chunks déjà
    // chargés (504 « Outdated Optimize Dep ») et fait rejeter l'import
    // dynamique. Un hard reload repart sur le nouveau hash. `await` dans le
    // try : resolvePageComponent REJETTE en async (un throw sync ne couvre
    // pas le cas).
    try {
      // resolvePageComponent est typé Promise<unknown> (helper agnostique).
      return (await resolvePageComponent(`./pages/${name}.tsx`, pages)) as any
    } catch (error) {
      // Garde anti-boucle : un seul reload par URL par fenêtre de 10s.
      const key = `runtime-reload:${window.location.pathname}`
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last > 10_000) {
        console.warn(`Chargement de [${name}] échoué — hard reload`, error)
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
        // Le reload est asynchrone : on gèle la résolution le temps qu'il parte.
        return new Promise(() => {})
      }
      // Deuxième échec d'affilée : le reload n'y changera rien. On laisse
      // remonter plutôt que de figer l'app sur une page blanche muette.
      //
      // Avant d'accuser le cache : sonder le serveur. Un import dynamique qui
      // rejette a deux causes très différentes — serveur mort (rien à purger,
      // il faut le relancer) ou chunks périmés après re-optimisation de deps.
      // Le message générique envoyait systématiquement vers `node_modules/.vite`,
      // donc vers le mauvais geste dans le cas le plus fréquent.
      const serveurJoignable = await fetch(window.location.origin, {
        method: 'HEAD',
        cache: 'no-store',
      }).then(
        () => true,
        () => false
      )

      console.error(
        serveurJoignable
          ? `Chargement de [${name}] échoué deux fois, serveur joignable — cache Vite périmé ` +
              `ou page réellement absente. Arrêter le serveur, supprimer node_modules/.vite, relancer.`
          : `Chargement de [${name}] échoué deux fois, serveur de dev INJOIGNABLE — il est mort. ` +
              `Le relancer (npm run dev) ; la cause de la mort est dans tmp/dev-server.prev.log. ` +
              `Ne pas purger node_modules/.vite, il n'y est pour rien.`,
        error
      )
      throw error
    }
  },
  setup({ el, App, props }) {
    createRoot(el).render(
      <>
        <App {...props} />
        {/* Grammaire overlays (airbnb-overlays.html §04) : pilule encre
            bas-centre, 4,2 s, couche toasts au-dessus de tout (sheets
            z-60, dialogs z-70 — le z-index natif de sonner reste le plus
            haut, pas de prop zIndex dans l'API v2). Le sens est porté par
            l'icône, pas la pilule : pas de richColors. Détails hérités
            dans styles/app.css. */}
        <Toaster
          position="bottom-center"
          duration={4200}
          toastOptions={{
            style: {
              background: '#222222',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              padding: '13px 20px',
              fontWeight: 500,
              boxShadow: '0 6px 20px rgb(0 0 0 / 0.16)',
            },
          }}
        />
      </>
    )
  },
})
