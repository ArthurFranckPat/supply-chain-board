/**
 * Contrat de préférences de vues (pages du menu + sous-vues) — par utilisateur.
 *
 * Miroir client : `inertia-react/lib/view-prefs/registry.ts`. Le client ne
 * résout pas l'alias `#types/*` (Adonis) : les deux fichiers doivent rester
 * synchrones, comme `#types/dashboard_layout` ↔ `lib/dashboard/types`.
 *
 * Persistance : JSON sérialisé dans `users.view_prefs` (colonne TEXT nullable).
 * `null` = défaut, c'est-à-dire TOUT visible. On persiste les éléments MASQUÉS
 * (et non les visibles) pour qu'une page ajoutée plus tard apparaisse sans
 * migration ni reparamétrage : un défaut « tout visible » est le seul qui ne
 * demande rien à l'utilisateur.
 *
 * Portée : le masquage d'une PAGE est appliqué côté serveur (middleware
 * `view_prefs_middleware`) — ouvrir son URL redirige vers une page visible. Le
 * masquage d'une SOUS-VUE est appliqué côté client (les sous-vues sont un état
 * d'écran, pas une route) : l'onglet disparaît et le repli se fait sur la
 * première sous-vue visible.
 */

/** Clé de page = clé de navigation (MastheadTab). */
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
  'logistics_analysis',
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
  /** Page d'accueil : jamais masquable (le masquage n'aurait pas de sens). */
  pinned?: boolean
  /** Sous-vues d'écran. La PREMIÈRE est la vue par défaut / de repli. */
  subviews: SubviewDef[]
}

/**
 * Registre canonique des pages et sous-vues. Toute page ajoutée au menu doit
 * l'être ici ; toute sous-vue ajoutée à une page doit l'être sur sa page.
 */
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
    key: 'logistics_analysis',
    label: 'Analyse logistique',
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
  /** Version du contrat — sert aux migrations de forme côté client. */
  version: number
  /** Pages masquées (jamais `dashboard`, épinglé). */
  hiddenPages: PageKey[]
  /** Sous-vues masquées, en clés composites `page:sousVue`. */
  hiddenSubviews: string[]
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  version: VIEW_PREFS_VERSION,
  hiddenPages: [],
  hiddenSubviews: [],
}

/** Vérifie qu'un `unknown` est une clé de page valide. */
export function isPageKey(v: unknown): v is PageKey {
  return typeof v === 'string' && (PAGE_KEYS as readonly string[]).includes(v)
}

/** Clé composite d'une sous-vue. */
export function subviewKey(page: PageKey, sub: string): string {
  return `${page}:${sub}`
}

/** Vérifie qu'un `unknown` est une clé de sous-vue connue (`page:sousVue`). */
export function isSubviewKey(v: unknown): boolean {
  if (typeof v !== 'string') return false
  const parts = v.split(':')
  if (parts.length !== 2) return false
  const [page, sub] = parts
  if (!isPageKey(page)) return false
  const def = PAGES.find((p) => p.key === page)
  return Boolean(def?.subviews.some((s) => s.key === sub))
}

/**
 * Normalise un payload brut (DB ou client) en `ViewPrefs` valide : ne garde que
 * les clés connues, dédoublonne, et retire `dashboard` des pages masquées
 * (épinglé). Robuste aux évolutions du registre — une page retirée n'empêche
 * pas de relire une préférence plus ancienne.
 */
export function normalizeViewPrefs(raw: unknown): ViewPrefs {
  const base: ViewPrefs = {
    version: VIEW_PREFS_VERSION,
    hiddenPages: [],
    hiddenSubviews: [],
  }
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

/** Une page est masquée (jamais `dashboard`, épinglé). */
export function isPageHidden(prefs: ViewPrefs, page: PageKey): boolean {
  if (page === 'dashboard') return false
  return prefs.hiddenPages.includes(page)
}

/** Une sous-vue est masquée. */
export function isSubviewHidden(prefs: ViewPrefs, page: PageKey, sub: string): boolean {
  return prefs.hiddenSubviews.includes(subviewKey(page, sub))
}

// ---------------------------------------------------------------------------
// Application côté serveur (middleware) — chemins → cible
// ---------------------------------------------------------------------------

/** Chemin canonique de chaque page visible (repli du middleware). */
export const PAGE_PATHS: Record<PageKey, string> = {
  dashboard: '/',
  programme: '/programme',
  sequenceur: '/sequenceur',
  load: '/charge',
  heures_produites: '/heures-produites',
  approvisionnement: '/approvisionnement',
  tracking: '/suivi',
  receptions: '/receptions',
  conditionnements: '/conditionnements',
  logistics_analysis: '/analyse-logistique',
  promesse: '/promesse',
  copilote: '/copilote',
  config: '/configuration/calendrier',
}

/** Sous-vues adressables par une route propre (Config). */
export const SUBVIEW_PATHS: Record<string, string> = {
  'config:calendrier': '/configuration/calendrier',
  'config:impressions': '/configuration/impressions',
  'config:affichage': '/configuration/affichage',
}

export interface PageTarget {
  page: PageKey
  /** Sous-vue visée, quand la route en désigne une (ex. Config). */
  subview?: string
}

/** Le chemin commence-t-il par `prefix` sur une frontière de segment ? */
function startsWithSeg(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

// Ordre = spécifique → générique. `/configuration/vues` (page de préférences)
// n'est volontairement ciblé par aucune règle : elle reste toujours joignable,
// sinon masquer Config rendrait le réglage irréversible.
const PAGE_ROUTE_TARGETS: {
  prefix: string
  exact?: boolean
  page: PageKey
  subview?: string
}[] = [
  { prefix: '/programme/scenarios/comparer', page: 'programme' },
  { prefix: '/ordonnancement', page: 'programme', subview: 'ordonnancement' },
  { prefix: '/planification', page: 'programme', subview: 'planification' },
  { prefix: '/programme', page: 'programme' },
  { prefix: '/sequenceur', page: 'sequenceur' },
  { prefix: '/charge', page: 'load' },
  { prefix: '/heures-produites', page: 'heures_produites' },
  { prefix: '/approvisionnement', page: 'approvisionnement' },
  { prefix: '/suivi', page: 'tracking' },
  { prefix: '/receptions', page: 'receptions' },
  { prefix: '/conditionnements', page: 'conditionnements' },
  { prefix: '/analyse-logistique', page: 'logistics_analysis' },
  { prefix: '/promesse', page: 'promesse' },
  { prefix: '/copilote', page: 'copilote' },
  { prefix: '/configuration/calendrier', page: 'config', subview: 'calendrier' },
  { prefix: '/configuration/impressions', page: 'config', subview: 'impressions' },
  { prefix: '/configuration/affichage', page: 'config', subview: 'affichage' },
  { prefix: '/impressions', page: 'config', subview: 'impressions' },
  { prefix: '/', exact: true, page: 'dashboard' },
]

/**
 * Cible d'une requête d'après son chemin. `null` = non concernée (API, assets,
 * page de préférences, pages de lab) → la requête passe.
 */
export function pageTargetForPath(pathname: string): PageTarget | null {
  for (const rule of PAGE_ROUTE_TARGETS) {
    if (rule.exact ? pathname === rule.prefix : startsWithSeg(pathname, rule.prefix)) {
      return rule.subview ? { page: rule.page, subview: rule.subview } : { page: rule.page }
    }
  }
  return null
}

/**
 * Chemin de repli quand une requête vise une page ou une sous-vue masquée :
 * la sous-vue sœur visible si la page l'est, sinon la première page visible.
 *
 * Cas piège — Config : ses sous-vues sont des ROUTES. Si la page est visible
 * mais que TOUTES ses sous-vues sont masquées, son chemin par défaut mène à une
 * route masquée → boucle de redirection. On ne renvoie donc un chemin de page
 * que s'il reste au moins une sous-vue visible ; sinon on sort vers une autre
 * page. Les pages dont les sous-vues sont un état d'écran (Programme, Charge…)
 * n'ont pas ce risque : leur chemin mène à la page elle-même, jamais masquée.
 */
export function fallbackPathFor(prefs: ViewPrefs, target: PageTarget): string {
  const pageDef = PAGES.find((p) => p.key === target.page)
  if (pageDef && !isPageHidden(prefs, pageDef.key)) {
    const routed = pageDef.subviews.some((s) => SUBVIEW_PATHS[subviewKey(pageDef.key, s.key)])
    if (routed) {
      const sub = pageDef.subviews.find((s) => !isSubviewHidden(prefs, pageDef.key, s.key))
      if (sub) return SUBVIEW_PATHS[subviewKey(pageDef.key, sub.key)]
    } else {
      return PAGE_PATHS[pageDef.key]
    }
  }
  const visible = PAGES.find((p) => !isPageHidden(prefs, p.key))
  return visible ? PAGE_PATHS[visible.key] : '/'
}
