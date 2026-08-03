/**
 * Constantes partagées des graphes du cockpit (#119, lot 4).
 * Couleurs = variables CSS du thème (airbnb), comme /charge (chart-math).
 */

export const BRAND = 'var(--color-brand)'
export const FERME = 'var(--color-ferme)'
export const FG = 'var(--color-foreground)'

const MOIS_COURT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const

/** `2026-07` → `juil.` — l'année s'affiche sur janvier et sur le premier mois
 *  de la série (la fenêtre 6 mois peut chevaucher deux années). */
export function moisLabel(mois: string, index = -1): string {
  const [y, m] = mois.split('-').map(Number)
  const court = MOIS_COURT[(m ?? 1) - 1] ?? mois
  if (m === 1 || index === 0) return `${court} ${String(y).slice(2)}`
  return court
}

/** Nombre compact à la française : 12 500 → « 12,5 k ». */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${(Math.round(k * 10) / 10).toLocaleString('fr-FR')} k`
  }
  return `${Math.round(n * 10) / 10}`.replace('.', ',')
}
