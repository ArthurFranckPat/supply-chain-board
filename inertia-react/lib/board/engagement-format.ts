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
  /** Capacité d'un jour ouvert moyen (h) sur CE poste — diviseur de `fmtJ`. */
  dailyCapacityHours: number | null
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

/** Repli quand la capacité du poste est inconnue : une équipe de 7 h (`SHIFT_HOURS`). */
export const SHIFT_HOURS = 7

/**
 * Heures de charge → JOURS de production sur un poste donné.
 *
 * `dailyCapacityHours` = capacité d'un jour ouvert moyen de CE poste (équipes ×
 * exemplaires × rendement). L'ignorer et diviser par 7 en dur faisait mentir toute
 * ligne en 2×8 : PP_830 écoule 12,6 h/jour, donc 118,2 h de charge valent 9,4 jours
 * et non 16,9 — un chiffre qui contredisait la saturation affichée juste à côté
 * (188 % d'une semaine de 5 jours ouvrés = 9,4 jours).
 *
 * Capacité inconnue (poste hors référentiel, fermé toute la semaine) → repli 7 h.
 */
export const fmtJ = (h: number, dailyCapacityHours?: number | null) => {
  const base = dailyCapacityHours && dailyCapacityHours > 0 ? dailyCapacityHours : SHIFT_HOURS
  return (Math.round((h / base) * 10) / 10).toFixed(1).replace('.', ',')
}

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
