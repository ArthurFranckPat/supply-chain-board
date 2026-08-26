import './styles/app.css'

import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'
import { Toaster } from 'sonner'

const pages = import.meta.glob('./pages/**/*.tsx')

// Un reload déjà armé mais pas encore parti : les échecs d'un même épisode
// arrivent par deux chemins (vite:preloadError puis le catch de resolve),
// il ne faut les compter qu'une fois.
let rechargementEnAttente = false

// Filet si sessionStorage est corrompu ou interdit : borne les reloads à
// l'échelle de la page (remise à zéro à chaque navigation).
let rechargementsArmesCettePage = 0

/**
 * Garde anti-boucle persistée en sessionStorage, lue sans pouvoir throw.
 *
 * Le format courant est [timestamp, essais] ; l'ancien code (avant compteur)
 * écrivait un timestamp nu — et déstructurer un nombre fait
 * « number is not iterable », vu en console : le crash court-circuitait le
 * reload de secours lui-même. Tout format inattendu repart donc de zéro,
 * sauf le timestamp nu qui vaut un essai déjà consommé.
 */
function lireGardeAntiBoucle(cle: string): [number, number] {
  try {
    const brut = sessionStorage.getItem(cle)
    if (brut) {
      const valeur: unknown = JSON.parse(brut)
      if (Array.isArray(valeur)) return [Number(valeur[0] ?? 0), Number(valeur[1] ?? 0)]
      if (typeof valeur === 'number') return [valeur, 1]
    }
  } catch {
    // sessionStorage inaccessible : le filet en mémoire prend le relais.
  }
  return [0, 0]
}

function ecrireGardeAntiBoucle(cle: string, valeur: [number, number]): void {
  try {
    sessionStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    // Idem : le filet en mémoire borne déjà les reloads.
  }
}

/**
 * Hard reload après un échec d'import dynamique, avec garde anti-boucle.
 *
 * En dev, le `?v=<hash>` des deps pré-bundlées se périme quand le serveur
 * re-optimise : lockfile changé par un checkout de branche ou `npm ci`,
 * config Vite modifiée, dep découverte à chaud. L'onglet qui survit au
 * redémarrage garde son graphe de modules en mémoire avec les anciens hash
 * (504 « Outdated Optimize Dep »). Réessayer l'import ne suffit pas — le
 * navigateur ne re-demande pas un module qu'il tient déjà — seul un reload
 * complet repart sur le hash courant. Deux essais par fenêtre de 30 s : le
 * premier peut encore échouer si la re-optimisation serveur n'était pas
 * finie, le deuxième passe. Au-delà, on rend la main à l'appelant.
 */
function rechargerApresErreurDImport(contexte: string, erreur: unknown): boolean {
  if (rechargementEnAttente) return true
  if (rechargementsArmesCettePage >= 2) return false
  const cle = `runtime-reload:${window.location.pathname}`
  const [dernier, essais] = lireGardeAntiBoucle(cle)
  const dansLaFenetre = Date.now() - dernier < 30_000
  if (dansLaFenetre && essais >= 2) return false
  ecrireGardeAntiBoucle(cle, [Date.now(), dansLaFenetre ? essais + 1 : 1])
  rechargementsArmesCettePage += 1
  console.warn(`Échec de chargement [${contexte}] — hard reload`, erreur)
  // Délai court : si le serveur achève sa re-optimisation, le reload repart
  // sur le hash définitif au lieu d'un hash intermédiaire déjà condamné.
  rechargementEnAttente = true
  setTimeout(() => window.location.reload(), 400)
  return true
}

// Vite ≥ 5 émet « vite:preloadError » sur window pour tout échec d'import
// dynamique, y compris hors résolution de pages Inertia (imports applicatifs,
// CSS). Sans preventDefault, Vite propage l'erreur en non capturée. Même
// garde anti-boucle que resolve() : les deux chemins partagent le compteur.
if (import.meta.env.DEV) {
  window.addEventListener('vite:preloadError', (event) => {
    const erreur = (event as Event & { payload?: unknown }).payload ?? event.type
    if (rechargerApresErreurDImport('vite:preloadError', erreur)) event.preventDefault()
  })
}

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
    // dynamique. Un hard reload repart sur le nouveau hash — c'est le boulot
    // de `rechargerApresErreurDImport` ; s'il a épuisé sa garde, il reste le
    // diagnostic ci-dessous. `await` dans le try : resolvePageComponent
    // REJETTE en async (un throw sync ne couvre pas le cas).
    try {
      // resolvePageComponent est typé Promise<unknown> (helper agnostique).
      return (await resolvePageComponent(`./pages/${name}.tsx`, pages)) as any
    } catch (error) {
      if (rechargerApresErreurDImport(name, error)) {
        // Le reload est asynchrone : on gèle la résolution le temps qu'il parte.
        return new Promise(() => {})
      }
      // Garde épuisée : deux reloads n'ont rien changé, un troisième ne changera
      // rien. On laisse remonter plutôt que de figer l'app sur une page blanche.
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
          ? `Chargement de [${name}] échoué malgré deux reloads automatiques, serveur joignable — ` +
              `cache Vite réellement périmé ou page réellement absente. ` +
              `Arrêter le serveur, supprimer node_modules/.vite, relancer.`
          : `Chargement de [${name}] échoué malgré deux reloads automatiques, serveur de dev INJOIGNABLE — ` +
              `il est mort. Le relancer (npm run dev) ; la cause de la mort est dans ` +
              `tmp/dev-server.prev.log. Ne pas purger node_modules/.vite, il n'y est pour rien.`,
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
