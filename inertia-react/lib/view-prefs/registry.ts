/**
 * Miroir client du contrat de préférences de vues.
 *
 * Source de vérité côté serveur : `app/types/view_prefs.ts` (le client ne résout
 * pas l'alias `#types/*` d'Adonis). Les deux fichiers doivent rester synchrones.
 * Le client n'a pas besoin des helpers de routage du serveur (chemins → cible,
 * repli) : il ne consomme que le registre et la lecture des préférences.
 */

export const PAGE_KEYS = [
  'dashboard',
  'programme',
  'sequenceur',
  'load',
  'heures_produites',
  'approvisionnement',
  'tracking',
  'receptions',
  'conditionnements',
  'promesse',
  'copilote',
  'config',
] as const
export type PageKey = (typeof PAGE_KEYS)[number]

export interface SubviewDef {
  key: string
  label: string
}

export interface PageDef {
  key: PageKey
  label: string
  /** Section du menu — sert au regroupement sur la page de préférences. */
  group: string
  /** Page d'accueil : jamais masquable. */
  pinned?: boolean
  /** Sous-vues d'écran. La PREMIÈRE est la vue par défaut / de repli. */
  subviews: SubviewDef[]
}

export const PAGES: PageDef[] = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    group: 'Accès directs',
    pinned: true,
    subviews: [],
  },
  {
    key: 'tracking',
    label: 'Suivi commandes',
    group: 'Accès directs',
    subviews: [
      { key: 'proactif', label: 'Proactif' },
      { key: 'reactif', label: 'Réactif' },
    ],
  },
  {
    key: 'programme',
    label: 'Programme',
    group: 'Ordonnancement',
    subviews: [
      { key: 'combined', label: 'Combiné' },
      { key: 'ordonnancement', label: 'Ordonnancement (OF)' },
      { key: 'planification', label: 'Planification (commandes)' },
    ],
  },
  {
    key: 'sequenceur',
    label: 'Séquenceur',
    group: 'Ordonnancement',
    subviews: [],
  },
  {
    key: 'load',
    label: 'Charge',
    group: 'Planification',
    subviews: [
      { key: 'of', label: 'OF' },
      { key: 'commande', label: 'Commande' },
      { key: 'sous_ensembles', label: 'Sous-ensembles' },
    ],
  },
  {
    key: 'heures_produites',
    label: 'Heures produites',
    group: 'Planification',
    subviews: [
      { key: 'heures', label: 'Heures' },
      { key: 'commandes', label: 'Commandes' },
    ],
  },
  {
    key: 'approvisionnement',
    label: 'Approvisionnement',
    group: 'Planification',
    subviews: [
      { key: 'manque', label: 'Manque' },
      { key: 'besoin', label: 'Besoin' },
    ],
  },
  {
    key: 'receptions',
    label: 'Réceptions',
    group: 'Logistique',
    subviews: [
      { key: 'tableau', label: 'Tableau' },
      { key: 'calendrier', label: 'Calendrier' },
      { key: 'board', label: 'Board' },
    ],
  },
  {
    key: 'conditionnements',
    label: 'Conditionnements',
    group: 'Logistique',
    subviews: [],
  },
  {
    key: 'promesse',
    label: 'Promesse',
    group: 'Plus',
    subviews: [],
  },
  {
    key: 'copilote',
    label: 'Copilote',
    group: 'Plus',
    subviews: [],
  },
  {
    key: 'config',
    label: 'Config',
    group: 'Plus',
    subviews: [
      { key: 'calendrier', label: 'Calendrier usine' },
      { key: 'impressions', label: 'Impressions' },
      { key: 'affichage', label: 'Affichage' },
    ],
  },
]

export const VIEW_PREFS_VERSION = 1

export interface ViewPrefs {
  version: number
  hiddenPages: PageKey[]
  hiddenSubviews: string[]
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  version: VIEW_PREFS_VERSION,
  hiddenPages: [],
  hiddenSubviews: [],
}

export function isPageKey(v: unknown): v is PageKey {
  return typeof v === 'string' && (PAGE_KEYS as readonly string[]).includes(v)
}

export function subviewKey(page: PageKey, sub: string): string {
  return `${page}:${sub}`
}

export function isSubviewKey(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const parts = v.split(':')
  if (parts.length !== 2) return false
  const [page, sub] = parts
  if (!isPageKey(page)) return false
  const def = PAGES.find((p) => p.key === page)
  return Boolean(def?.subviews.some((s) => s.key === sub))
}

export function normalizeViewPrefs(raw: unknown): ViewPrefs {
  const base: ViewPrefs = { version: VIEW_PREFS_VERSION, hiddenPages: [], hiddenSubviews: [] }
  if (!raw || typeof raw !== 'object') return base
  const obj = raw as Record<string, unknown>

  if (Array.isArray(obj.hiddenPages)) {
    const seen = new Set<string>()
    for (const v of obj.hiddenPages) {
      if (isPageKey(v) && v !== 'dashboard' && !seen.has(v)) {
        seen.add(v)
        base.hiddenPages.push(v)
      }
    }
  }
  if (Array.isArray(obj.hiddenSubviews)) {
    const seen = new Set<string>()
    for (const v of obj.hiddenSubviews) {
      if (isSubviewKey(v) && !seen.has(v)) {
        seen.add(v)
        base.hiddenSubviews.push(v)
      }
    }
  }
  return base
}

export function isPageHidden(prefs: ViewPrefs, page: PageKey): boolean {
  if (page === 'dashboard') return false
  return prefs.hiddenPages.includes(page)
}

export function isSubviewHidden(prefs: ViewPrefs, page: PageKey, sub: string): boolean {
  return prefs.hiddenSubviews.includes(subviewKey(page, sub))
}
