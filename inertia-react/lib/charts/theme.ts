/**
 * Socle des graphiques — palette de séries et formats d'affichage.
 *
 * Règle du projet : tout graphique passe par `@tanstack/charts`. Ce module
 * porte ce que la librairie ne sait pas deviner — le sens métier des couleurs
 * et les formats français.
 *
 * Les couleurs sont des références CSS, jamais des hex en dur : elles suivent
 * le thème posé sur le conteneur (`.theme-cursor`, `.theme-airbnb`). Elles
 * sont déclarées dans `inertia-react/styles/app.css`.
 */

/** Séries métier. Une couleur = un sens, stable d'une page à l'autre. */
export const SERIE = {
  /** OF lancé, engagé en atelier. */
  ferme: 'var(--serie-ferme)',
  /** Calé par le CBN, pas encore lancé. */
  planifie: 'var(--serie-planifie)',
  /** Proposé par le CBN, non validé. */
  suggere: 'var(--serie-suggere)',
  /** Charge amont : induite par un autre poste, jamais saisie ici. */
  induit: 'var(--serie-induit)',
  /** Constaté, mesuré, passé. */
  reel: 'var(--serie-reel)',
  /** Calculé, futur, non engagé. */
  projete: 'var(--serie-projete)',
  /** Plafond : capacité, seuil de sécurité, objectif. */
  capacite: 'var(--serie-capacite)',
  /** Lissage, moyenne mobile, tendance. */
  tendance: 'var(--serie-tendance)',
  /** Absence de qualification métier. */
  neutre: 'var(--serie-neutre)',
  /**
   * Encre douce — un classement où le rang porte le sens, pas la couleur.
   * À préférer aux paliers quand toutes les lignes sont du même statut :
   * une barre verte dans une liste « en retard » alerte à contresens.
   */
  encre: 'var(--serie-encre)',
  /** Dépassement, rupture, retard. */
  alerte: 'var(--serie-alerte)',
} as const

export type NomSerie = keyof typeof SERIE

/** Paliers de saturation charge/capacité — mêmes seuils que `engagement-format`. */
export const PALIER = {
  ok: 'var(--serie-ferme)',
  high: 'var(--serie-suggere)',
  crit: 'var(--serie-alerte)',
} as const

export type NomPalier = keyof typeof PALIER

/** Couleur d'un taux de charge : 85 % et 100 % sont les deux ruptures. */
export function palierSaturation(pct: number | null): NomPalier {
  if (pct === null || pct < 85) return 'ok'
  return pct < 100 ? 'high' : 'crit'
}

/** Encre du texte de graphique — le reste hérite de `currentColor`. */
export const AXE = {
  /** Micro-texte des graduations. Densité produit : 11 px, atténué. */
  tickFontSize: 11,
  tickOpacity: 0.62,
  /** Filet de grille : l'encre à 6 %. */
  grille: 'var(--serie-grille)',
} as const

/* ── Formats ─────────────────────────────────────────────────── */

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const nfEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Entier français : séparateur de milliers en espace insécable. */
export const fmtNombre = (v: number) => nf0.format(v)

/** Une décimale — heures, taux, ratios. */
export const fmtDecimal = (v: number) => nf1.format(v)

/** Heures d'atelier : « 10,5 h ». */
export const fmtHeures = (v: number) => `${nf1.format(v)} h`

/** Euros pleins : « 1 240 € ». */
export const fmtEuro = (v: number) => nfEuro.format(v)

/** Euros compacts pour un axe : « 1,2 M€ », « 340 k€ ». */
export function fmtEuroCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${nf1.format(v / 1_000_000)} M€`
  if (abs >= 1_000) return `${nf0.format(v / 1_000)} k€`
  return `${nf0.format(v)} €`
}

/** Pourcentage entier : « 94 % ». */
export const fmtPourcent = (v: number) => `${nf0.format(v)} %`

/**
 * Date à l'écran : jj/mm/aaaa, toujours. L'ISO reste côté machine.
 * Accepte une `Date` ou une chaîne ISO `aaaa-mm-jj`.
 */
export function fmtDate(v: Date | string): string {
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : ''
  const jj = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${jj}/${mm}/${d.getFullYear()}`
}

/** Jour court pour un axe dense : « 12/03 ». */
export function fmtJourCourt(v: Date | string): string {
  const complet = fmtDate(v)
  return complet.length === 10 ? complet.slice(0, 5) : complet
}

/**
 * Période ISO `aaaa-Wnn` → « S32 ». Toute autre forme est rendue telle quelle :
 * les périodes du domaine sont déjà des libellés (mois, jours).
 */
export function fmtPeriode(periode: string): string {
  const semaine = /^(\d{4})-W(\d{2})$/.exec(periode)
  return semaine ? `S${semaine[2]}` : periode
}

/** Période ISO `aaaa-Wnn` → « S32 2026 », pour un tooltip qui doit lever l'ambiguïté. */
export function fmtPeriodeLongue(periode: string): string {
  const semaine = /^(\d{4})-W(\d{2})$/.exec(periode)
  return semaine ? `S${semaine[2]} ${semaine[1]}` : periode
}
