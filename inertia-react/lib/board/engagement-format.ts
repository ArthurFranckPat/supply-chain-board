/**
 * Formatage + logique d'urgence partagés entre le panneau `PosteEngagementSheet`
 * (issue #46) et la page `/sequenceur` — extraits pour éviter la duplication
 * entre les deux vues de l'engagement OF par poste.
 */

export interface EngagementCmd {
  numCommande: string
  ligne: string | null
  client: string | null
  livraisonIso: string | null
  /** 'matcher' = chaîne board ; 'peg' = repli contremarque (commande hors fenêtre). */
  method: 'matcher' | 'peg'
}

export interface EngagementRow {
  numOf: string
  article: string
  designation: string | null
  done: number
  launched: number
  dateDebutIso: string | null
  hours: number
  commandes: EngagementCmd[]
  livraisonIso: string | null
  /** WIPSTA — présent sur /sequenceur (#100) ; optionnel côté panneau legacy. */
  status?: number
  statusLabel?: string
}

export interface EngagementPayload {
  poste: { code: string; label: string }
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  rows: EngagementRow[]
  x3Error: string | null
}

/** ISO YYYY-MM-DD → JJ/MM/AA — '—' si absente. */
export const fmtDateFr = (iso: string | null): string => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

export const fmtH = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')
/** Convention métier : 1 jour = 7 heures. */
export const fmtJ = (h: number) => (Math.round((h / 7) * 10) / 10).toFixed(1).replace('.', ',')

/** Seuil d'urgence d'une livraison, pour la couleur + le regroupement visuel.
 *  - 'overdue' : livraison avant aujourd'hui (matériel non livré = alerte).
 *  - 'week'    : livraison dans les 7 prochains jours.
 *  - 'later'   : au-delà, ou sans date. */
export type Urgency = 'overdue' | 'week' | 'later'
export const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, week: 1, later: 2 }

const todayIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export const urgencyOf = (livraisonIso: string | null): Urgency => {
  if (!livraisonIso) return 'later'
  const today = todayIso()
  if (livraisonIso < today) return 'overdue'
  const weekLater = new Date()
  weekLater.setDate(weekLater.getDate() + 7)
  const y = weekLater.getFullYear()
  const m = String(weekLater.getMonth() + 1).padStart(2, '0')
  const da = String(weekLater.getDate()).padStart(2, '0')
  return livraisonIso <= `${y}-${m}-${da}` ? 'week' : 'later'
}

/** Couleur de la date de livraison selon l'urgence.
 *  Retard = danger, semaine = suggéré (Arches), plus tard = muted.
 *  Pas de Rausch ici : réservé filtres/CTA (sinon tout crie pareil). */
export const urgencyColor = (u: Urgency): string =>
  u === 'overdue' ? 'text-danger' : u === 'week' ? 'text-suggere' : 'text-muted-foreground'

/** Saturation charge/capacité — renvoie % et sévérité visuelle pour la jauge. */
export const saturation = (
  totalHours: number,
  capacity: number | null
): { pct: number | null; level: 'ok' | 'high' | 'crit' } => {
  if (!capacity || capacity <= 0) return { pct: null, level: 'ok' }
  const pct = (totalHours / capacity) * 100
  return { pct: Math.round(pct), level: pct > 100 ? 'crit' : pct > 85 ? 'high' : 'ok' }
}
