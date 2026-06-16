import { defineConfig } from '@adonisjs/inertia'

/**
 * Configuration Inertia.
 *
 * - `rootView` : shell Edge minimal qui charge le bundle Vite + le tag @inertia.
 * - SSR désactivé (SPA) : SEO interne faible, on garde le setup simple.
 */
export default defineConfig({
  rootView: 'inertia_layout',
  ssr: { enabled: false },
})

/**
 * Registre typé des pages Inertia : contrat de props contrôleur ↔ page Solid.
 * Chaque page migrée déclare ici la forme de ses props.
 */
declare module '@adonisjs/inertia/types' {
  interface InertiaPages {
    home: { message: string }
  }
}
