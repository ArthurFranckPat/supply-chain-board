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
  /**
   * Forme du payload `board` (cartes pré-stylées côté serveur).
   * Le miroir client précis vit dans `inertia/lib/board/types.ts` (BoardData).
   */
  type BoardProp = {
    cols: number
    days: any[]
    lines: any[]
    weekSpans: { week: number; span: number }[]
    colWeek: number[]
    weekCaps: Record<string, number>
  }

  interface InertiaPages {
    home: { message: string }
    'auth/login': {
      lastUsername: string
      lastEnv: 'test' | 'prod'
      error: string | null
    }
    'design_system': Record<string, never>
    'scheduler/expert-board': {
      board: BoardProp
      windowFrom: string
      windowTo: string
      horizon: number
      dateRange: string
      weekLabel: string
      prevHref: string
      nextHref: string
      todayHref: string
      totalOf: number
      lineCount: number
      x3Error: string | null
      cached: string | null
    }
    'scheduler/order-board': {
      board: BoardProp
      totalLines: number
      lineCount: number
      horizon: number
      windowFrom: string
      windowTo: string
      dateRange: string
      weekLabel: string
      prevHref: string
      nextHref: string
      todayHref: string
      x3Error: string | null
    }
    'scheduler/shortages': {
      horizon: number
      windowStart: string
      dateRange: string
      prevHref: string
      nextHref: string
      todayHref: string
      rowsHref: string
    }
    'scheduler/suivi': {
      referenceDate: string
      rowsHref: string
      proactiveRowsHref: string
    }
  }
}
