/**
 * Rattachement atelier d'un poste de charge (issue #36), dérivé de
 * `WORKSTATIO.STOLOC_0` (emplacement de stock du poste).
 *
 * `atelierLabel` rend un libellé lisible ; `atelierCategory` classe l'atelier en
 * **montage** (assemblage des PF, où s'attachent les commandes clients) ou
 * **fabrication** (sous-ensembles, ateliers AM…).
 *
 * ⚠️ PROVISOIRE — la règle montage/fabrication n'est pas dérivable des seules
 * données X3 : à arbitrer avec le métier (quels STOLOC / WCR sont du montage).
 * Tant que `MONTAGE_LOCATIONS` n'est pas validé, tout poste hors liste est
 * classé « fabrication ». Le rattachement atelier (STOLOC), lui, est exact.
 */
export type AtelierCategory = 'montage' | 'fabrication'

/** Libellés lisibles par emplacement (STOLOC). À compléter avec le métier. */
const LABELS: Record<string, string> = {
  S9P: 'Atelier S9P',
  S3P: 'Atelier S3P',
  S4P: 'Atelier S4P',
  CLP: 'Atelier CLP',
  EXP: 'Expédition',
  MEC: 'Mécanique',
  ELC: 'Électronique',
  LAB: 'Laboratoire',
  REC: 'Réception',
  ZPR: 'Zone production',
}

/** PROVISOIRE — emplacements de montage (commandes clients). À valider métier. */
const MONTAGE_LOCATIONS = new Set<string>([])

export function atelierLabel(stoloc: string): string {
  const code = (stoloc ?? '').trim()
  if (!code) return '—'
  return LABELS[code] ?? code
}

export function atelierCategory(stoloc: string): AtelierCategory {
  return MONTAGE_LOCATIONS.has((stoloc ?? '').trim()) ? 'montage' : 'fabrication'
}
