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
   * Forme d'une ligne de charge /charge (miroir : inertia/lib/load/types.ts → LoadLine).
   */
  type LoadLineProp = {
    code: string
    name: string
    color: string
    articles: string[]
    monthly: { f: number; p: number; s: number }[]
    weekly: { f: number; p: number; s: number }[]
    capacity: { monthly: number[]; weekly: number[] }
    atelier: string
    atelierLabel: string
    workCenter: string
    category: 'montage' | 'fabrication'
  }

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
    // Tableau de bord (issue #26 shell + #38 KPI). Coquille + fetch différé du KPI.
    'dashboard': {
      referenceDate: string
      kpisHref: string
      otdHref: string
      stockHref: string
    }
    // Expéditions (issue #44) — onglet dédié à la gestion des expéditions client.
    'expeditions': {
      referenceDate: string
      rowsHref: string
      defaultGapMinutes: number
      maxPalettesCamion: number
    }
    // Réceptions fournisseurs — planning réceptions attendues + charge palettes par jour.
    'receptions': {
      from: string
      to: string
      horizon: number
      rowsHref: string
      todayHref: string
      defaultHorizon: number
    }
    // Conditionnements — identification des coefs manquants + estimation.
    'conditionnements': {
      rowsHref: string
    }
    'auth/login': {
      lastUsername: string
      lastEnv: 'test' | 'prod'
      error: string | null
    }
    'design_system': Record<string, never>
    'diagnostic-test': Record<string, never>
    'writeback-test': Record<string, never>
    'scheduler/scheduling': {
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
    'scheduler/planning': {
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
      rowsHref: string
    }
    'scheduler/tracking': {
      rowsHref: string
      proactiveRowsHref: string
    }
    'scheduler/load': {
      rangeLabel: string
      months: string[]
      weeks: string[]
      // Miroir client précis : inertia/lib/load/types.ts (LoadLine).
      // ofLines = charge OF (Ferme/Planifié/Suggéré) ; cmdLines = charge demande (Commande/Prévision).
      // capacity (#35) = capacité nette par bucket ; atelier/category (#36) = rattachement atelier.
      ofLines: LoadLineProp[]
      cmdLines: LoadLineProp[]
      ateliers: { code: string; label: string; category: 'montage' | 'fabrication' }[]
      x3Error: string | null
    }
    // Config calendrier usine (issue #37, design Registre V2).
    'config/calendrier': {
      year: number
      holidays: { date: string; name: string; active: boolean }[]
      closures: {
        id: number
        scope: 'global' | 'wst' | 'stoloc'
        code: string
        from: string
        to: string
        factor: number
        motif: string
      }[]
      postes: { code: string; label: string; atelier: string }[]
      ateliers: { code: string; label: string }[]
    }
    'scheduler/comparer': {
      scenarios: any[]
      planActuel: any
      windowFrom: string
      windowTo: string
      evaluatedAt: string
      dataAt: string
    }
    'scheduler/programme': {
      mode: 'combined' | 'ordonnancement' | 'planification'
      // OF board — null en mode planification
      board: BoardProp | null
      commandes: any[]
      links: any[]
      // Order board — null en mode combined/ordonnancement
      orderBoard: {
        days: any[]
        lines: any[]
        weekSpans: { week: number; span: number }[]
        cols: number
        colWeek: number[]
        weekCaps: Record<string, number>
        totalLines: number
        lineCount: number
        x3Error: string | null
        horizon: number
        windowFrom: string
        windowTo: string
        weekLabel: string
        dateRange: string
        prevHref: string
        nextHref: string
        todayHref: string
      } | null
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
  }
}
