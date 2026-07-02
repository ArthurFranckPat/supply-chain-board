/**
 * Helpers partagés entre les vues Expéditions (manifeste cartes + frise de charge).
 * Seuils de charge palette + parsing des créneaux « HH:mm ».
 *
 * Les seuils exploitent les tokens sémantiques du thème Papier :
 *  - > 100 %       → destructive (rouge, dépassement capacité)
 *  - proche du max → suggere (ambre, 90 %+ du plafond)
 *  - charge moyenne → planifie (bleu foncé)
 *  - charge légère  → ferme (vert)
 *
 * Issue #44 affinage : la jauge est désormais pilotée par le **taux de remplissage**
 * (palTheo / capacité, éq. standard pondéré ESH) plutôt que par un comptage brut
 * de palettes vs seuil arbitraire. `chargeTier` travaille donc sur un ratio 0–1+.
 */

export type ChargeTier = 'bad' | 'warn' | 'mid' | 'ok'

/** Seuil « proche du max » : 90 % de la capacité. */
const WARN_RATIO = 0.9
/** Seuil « charge moyenne » : 45 % de la capacité. */
const MID_RATIO = 0.45

/**
 * Palier de charge depuis un taux de remplissage (0 = vide, 1 = capacité atteinte,
 * >1 = débord). Retourne le tier sémantique pour la couleur.
 */
export function chargeTier(tauxRemplissage: number): ChargeTier {
  if (tauxRemplissage > 1) return 'bad'
  if (tauxRemplissage >= WARN_RATIO) return 'warn'
  if (tauxRemplissage >= MID_RATIO) return 'mid'
  return 'ok'
}

/** Classe de couleur Tailwind (token thème) pour un palier de charge. */
export function chargeText(tier: ChargeTier): string {
  switch (tier) {
    case 'bad':
      return 'text-destructive'
    case 'warn':
      return 'text-suggere'
    case 'mid':
      return 'text-planifie'
    case 'ok':
      return 'text-ferme'
  }
}

/** Classe de couleur de fond Tailwind (token) — cases palettes / barres frise. */
export function chargeBgClass(tier: ChargeTier): string {
  switch (tier) {
    case 'bad':
      return 'bg-destructive'
    case 'warn':
      return 'bg-suggere'
    case 'mid':
      return 'bg-planifie'
    case 'ok':
      return 'bg-ferme'
  }
}

// ── Créneaux « HH:mm » ──────────────────────────────────────────────

const HM_RE = /^(\d{2}):(\d{2})$/

/** « 06:45 » → 405 (minutes depuis minuit). 0 si format invalide. */
export function toMinutes(hhmm: string): number {
  const m = HM_RE.exec(hhmm)
  if (!m) return 0
  return Number.parseInt(m[1]!, 10) * 60 + Number.parseInt(m[2]!, 10)
}

/** Minutes depuis minuit → « HH:mm » (avec zéro initial). */
export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Bornes de la fenêtre temporelle (arrondies à l'heure), pour la frise. */
export function timeBounds(debutFin: ReadonlyArray<readonly [string, string]>): {
  start: number
  end: number
  hours: number
} {
  if (debutFin.length === 0) return { start: 0, end: 24 * 60, hours: 24 }
  let start = Infinity
  let end = -Infinity
  for (const [d, f] of debutFin) {
    start = Math.min(start, toMinutes(d))
    end = Math.max(end, toMinutes(f))
  }
  // Arrondi à l'heure (vers le bas pour le début, vers le haut pour la fin).
  const hStart = Math.floor(start / 60) * 60
  const hEnd = Math.ceil(end / 60) * 60
  return { start: hStart, end: hEnd, hours: Math.max((hEnd - hStart) / 60, 1) }
}

/** Pourcentage de position dans la fenêtre [start, end] (en minutes). */
export function pctOf(min: number, start: number, dur: number): number {
  if (dur <= 0) return 0
  return ((min - start) / dur) * 100
}
