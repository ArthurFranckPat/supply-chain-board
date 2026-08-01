import { defineConfig } from '@adonisjs/inertia'

/**
 * Configuration Inertia.
 *
 * - `rootView` : shell Edge unique — SolidJS retiré (#91), toutes les pages
 *   sont servies par le bundle `inertia-react`.
 * - SSR désactivé (SPA) : SEO interne faible, on garde le setup simple.
 */
export default defineConfig({
  rootView: 'inertia_layout_react',
  ssr: { enabled: false },
})

/**
 * Registre typé des pages Inertia : contrat de props contrôleur ↔ page React.
 * Chaque page migrée déclare ici la forme de ses props.
 */
declare module '@adonisjs/inertia/types' {
  /**
   * Forme d'une ligne de charge /charge (miroir : inertia-react/lib/load/types.ts → LoadLine).
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
   * Le miroir client précis vit dans `inertia-react/lib/board/types.ts` (BoardData).
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
    // `layout` = disposition personnalisée (ordre / visibilité / largeur + ordre
    // d'impression). Optionnel : absent tant que l'utilisateur n'a rien personnalisé.
    'dashboard': {
      referenceDate: string
      kpisHref: string
      otdHref: string
      stockHref: string
      layout?: {
        items: {
          id: 'charge' | 'profondeur' | 'otd' | 'stock' | 'lignes' | 'stockTable'
          visible: boolean
          width: 1 | 2 | 3
        }[]
        printOrder: ('charge' | 'profondeur' | 'otd' | 'stock' | 'lignes' | 'stockTable')[]
      }
    }
    // Expéditions (issue #44 + #104) — rétroviseur + prévision charge transport.
    'expeditions': {
      referenceDate: string
      rowsHref: string
      forecastHref: string
      defaultGapMinutes: number
      maxPalettesCamion: number
      forecastDefaultDays: number
    }
    // Réceptions fournisseurs — planning réceptions attendues + charge palettes par jour.
    'receptions': {
      from: string
      to: string
      horizon: number
      rowsHref: string
      /** Fragment criticité (jointure ruptures), chargé séparément de rowsHref. */
      criticiteHref: string
      todayHref: string
      defaultHorizon: number
    }
    // Approvisionnements (#103) — suggestions d'achat du CBN + messages de
    // replanification, groupés par fournisseur.
    'approvisionnements': {
      horizon: number
      rowsHref: string
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
    // Page témoin du socle React (migration react-shadcn, phase 0).
    'react_lab': Record<string, never>
    // POC drag board React (phase 3) — payload OF réel de /programme.
    'react_board': {
      board: BoardProp | null
      dateRange: string
      totalOf: number
      lineCount: number
      x3Error: string | null
    }
    'diagnostic-test': Record<string, never>
    'writeback-test': { firmSubprog: string }
    // Impression X3 (issue #85) — appel direct de ZSOAPPRINT sur un OF.
    // Le dossier ciblé suit la session : la page doit l'annoncer avant le tir.
    'print-test': {
      env: string
      pool: string
      host: string
      /** Destinations APRINTER du dossier ; `sandbox` = ne sort pas de papier. */
      destinations: {
        code: string
        label: string
        kind: number
        kindLabel: string
        server: string
        queue: string
        active: boolean
        sandbox: boolean
      }[]
      destinationsError: string
      /** Documents configurés — proposés en plus de la sonde PING. */
      documents: { code: string; label: string }[]
    }
    // CTP — simulateur autonome « date au plus tôt » (PRD §6.2, lot 3).
    'promesse': Record<string, never>
    // Copilote agentique v1 — chat SSE (jetable #77).
    'copilote': Record<string, never>
    'scheduler/shortages': {
      horizon: number
      windowStart: string
      dateRange: string
      rowsHref: string
    }
    'scheduler/controle-prod': {
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
      // Miroir client précis : inertia-react/lib/load/types.ts (LoadLine).
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
    // Journal d'exploitation des impressions (issue #85, lot 4).
    'impressions': {
      jobs: {
        id: number
        ofNum: string
        docType: string
        docLabel: string
        attempt: number
        stoloc: string
        atelierLabel: string
        destCode: string
        sandbox: boolean
        status: string
        serverVerdict: string
        jobRank: number
        jobPhase: string
        jobDetail: string
        verdictInferred: boolean
        message: string
        error: string
        origin: string
        requestedBy: string
        createdAt: number
      }[]
      ateliers: { code: string; label: string }[]
      autoPrintMode: string
      since: number
    }
    // Routage d'impression du dossier d'OF (issue #85, lot 2).
    'config/impressions': {
      ateliers: { code: string; label: string }[]
      destinations: {
        code: string
        label: string
        kind: number
        kindLabel: string
        server: string
        queue: string
        active: boolean
        sandbox: boolean
      }[]
      destinationsError: string
      queues: string[]
      queuesError: string
      settings: { autoPrintMode: string; updatedAt: number; updatedBy: string }
      /** Documents du dossier — codes GESARP saisis, inactifs compris. */
      documents: {
        id: number
        code: string
        label: string
        position: number
        active: boolean
        updatedAt: number
        updatedBy: string
      }[]
      rules: {
        id: number
        stoloc: string
        atelierLabel: string
        docType: string
        docLabel: string
        /** Règle portant un document retiré : elle ne sert plus à rien. */
        orphan: boolean
        destCode: string
        destLabel: string
        sandbox: boolean
        note: string
        updatedAt: number
        updatedBy: string
      }[]
      jobs: {
        id: number
        ofNum: string
        docType: string
        attempt: number
        stoloc: string
        destCode: string
        sandbox: boolean
        status: string
        serverVerdict: string
        jobRank: number
        jobPhase: string
        jobDetail: string
        verdictInferred: boolean
        retCod: string
        message: string
        error: string
        durationMs: number
        origin: string
        requestedBy: string
        createdAt: number
      }[]
    }
    'scheduler/comparer': {
      scenarios: any[]
      planActuel: any
      windowFrom: string
      windowTo: string
      evaluatedAt: string
      dataAt: string
    }
    // Séquenceur (#46/#100 unifiés) : board /programme en table. Filtre poste client.
    'scheduler/sequenceur': {
      postes: {
        code: string
        label: string
        count: number
        totalHours: number
        weeklyCapacityHours: number | null
        atelier: string
        atelierLabel: string
        nature: 'assemblage_pf' | 'assemble_sous_ensemble' | 'autre'
      }[]
      ateliers: { code: string; label: string }[]
      rows: any[]
      /** Fenêtre [from,to] matching/faisabilité (horizon programme). */
      feasibilityWindow: { from: string; to: string } | null
      x3Error: string | null
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
