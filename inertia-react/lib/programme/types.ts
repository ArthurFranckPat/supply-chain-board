/**
 * Issue #21 — types de la vue unifiée OF ↔ commandes.
 * Miroir précis des formes émises par SchedulerController.loadProgrammeData().
 *
 * Le board pose les OF sur poste × jour (date de début), une bande « Expéditions »
 * porte les commandes à leur date d'expédition, et `links` relie chaque OF à sa
 * commande. Pas de rang CBN ni de seuil « trop tôt » (hors scope) — le cœur est
 * la visualisation du lien, chacun à sa date.
 */

/** Statut d'OF porté par la carte (les MO sont filtrés 1/2/3 côté serveur). */
export type ProgrammeCardStatus = 'ferme' | 'planifie' | 'suggere'

/**
 * Vue active de /programme. Vivait dans `components/programme/programme-toolbar`,
 * supprimé à la migration design system : un type de domaine ne doit pas
 * dépendre d'un composant de barre d'outils pour exister.
 */
export type ProgrammeMode = 'combined' | 'ordonnancement' | 'commandes'

export interface ProgrammeOfCard {
  numOf: string
  status: ProgrammeCardStatus
  article: string
  designation: string | null
  posteCode: string
  posteLabel: string
  done: number
  launched: number
  hours: number
}

export interface ProgrammeDayCell {
  iso: string
  ofs: ProgrammeOfCard[]
}

export interface ProgrammePosteRow {
  code: string
  name: string
  ofCount: number
  totalHours: number
  dayCells: ProgrammeDayCell[]
}

export interface ProgrammeCommande {
  /** Identité LIGNE (numCommande#ligne) — clé des liens. */
  id: string
  numCommande: string
  /** N° de ligne de commande (X3 VCRLIN_0) ; null pour les prévisions. */
  ligne: string | null
  /** Nature de la demande : `commande` (SORDER) ou `prevision` (WIPSTA=3). */
  nature: 'commande' | 'prevision'
  client: string | null
  dateExpeditionIso: string | null
  /** Type de commande (MTS / MTO / NOR). */
  type: string | null
  /** Index de colonne (date d'expédition) dans la fenêtre. */
  col: number
}

export interface ProgrammeLink {
  ofId: string
  posteCode: string
  /** Colonne de la carte OF (date de début). */
  ofCol: number
  commandeId: string
  /** Colonne du marqueur commande (date d'expédition). */
  cmdCol: number
  /** OF suggéré (CBN non affermi) → lien en pointillé. */
  suggere: boolean
  /** Date de fin EFFECTIVE de l'OF (override incluse), ISO — null si inconnue (issue #23). */
  ofDateFinIso: string | null
  /** Date de besoin EFFECTIVE de la ligne (= dateExpedition), ISO — null si inconnue (issue #23). */
  cmdDateBesoinIso: string | null
}

export interface ProgrammeDayCol {
  short: string
  iso: string
  today: boolean
}

export interface ProgrammeBoardData {
  days: ProgrammeDayCol[]
  cols: number
  weekSpans: { week: number; span: number }[]
  colWeek: number[]
  weekCaps: Record<string, number>
  postes: ProgrammePosteRow[]
  commandes: ProgrammeCommande[]
  links: ProgrammeLink[]
}
