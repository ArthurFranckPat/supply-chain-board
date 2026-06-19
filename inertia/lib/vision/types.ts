/**
 * Issue #21 — types de la vue unifiée OF ↔ commandes.
 * Miroir précis des formes émises par SchedulerController.loadVisionData().
 *
 * Le board pose les OF sur poste × jour (date de début), une bande « Expéditions »
 * porte les commandes à leur date d'expédition, et `links` relie chaque OF à sa
 * commande. Pas de rang CBN ni de seuil « trop tôt » (hors scope) — le cœur est
 * la visualisation du lien, chacun à sa date.
 */

/** Statut d'OF porté par la carte (les MO sont filtrés 1/2/3 côté serveur). */
export type VisionCardStatus = 'ferme' | 'planifie' | 'suggere'

export interface VisionOfCard {
  numOf: string
  status: VisionCardStatus
  article: string
  designation: string | null
  posteCode: string
  posteLabel: string
  done: number
  launched: number
  hours: number
}

export interface VisionDayCell {
  iso: string
  ofs: VisionOfCard[]
}

export interface VisionPosteRow {
  code: string
  name: string
  ofCount: number
  totalHours: number
  dayCells: VisionDayCell[]
}

export interface VisionCommande {
  id: string
  numCommande: string
  client: string | null
  dateExpeditionIso: string | null
  /** Index de colonne (date d'expédition) dans la fenêtre. */
  col: number
}

export interface VisionLink {
  ofId: string
  posteCode: string
  /** Colonne de la carte OF (date de début). */
  ofCol: number
  commandeId: string
  /** Colonne du marqueur commande (date d'expédition). */
  cmdCol: number
  /** OF suggéré (CBN non affermi) → lien en pointillé. */
  suggere: boolean
}

export interface VisionDayCol {
  short: string
  iso: string
  today: boolean
}

export interface VisionBoardData {
  days: VisionDayCol[]
  cols: number
  weekSpans: { week: number; span: number }[]
  colWeek: number[]
  weekCaps: Record<string, number>
  postes: VisionPosteRow[]
  commandes: VisionCommande[]
  links: VisionLink[]
}
