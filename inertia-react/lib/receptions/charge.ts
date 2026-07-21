/**
 * Paliers de charge quai (réceptions) — unité = palettes attendues.
 *
 * Échelle ABSOLUE en palettes, calibrage empirique repris de la vue Calendrier :
 * ≥ 20 = débord, 12-19 = fort, 5-11 = moyen, < 5 = léger. Source unique partagée
 * par la vue Calendrier (histogramme), la vue Tableau (colonne Palettes) et la
 * vue Board (pied de colonne) — ne pas redéfinir localement.
 */

export type ChargeTier = 'ok' | 'mid' | 'warn' | 'bad'

export function chargeTier(palettes: number): ChargeTier {
  if (palettes >= 20) return 'bad'
  if (palettes >= 12) return 'warn'
  if (palettes >= 5) return 'mid'
  return 'ok'
}

/** Fond (barre d'histogramme, pastille). */
export function chargeBg(tier: ChargeTier): string {
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

/** Texte (compteur de palettes). */
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

/** Libellé court du palier (légendes, infobulles). */
export function chargeLabel(tier: ChargeTier): string {
  switch (tier) {
    case 'bad':
      return 'Débord'
    case 'warn':
      return 'Fort'
    case 'mid':
      return 'Moyen'
    case 'ok':
      return 'Léger'
  }
}
