import { daysBetweenIso } from '#app/domain/ruptures'

/**
 * KPI « profondeur de retard » — sévérité temporelle du backlog déjà en retard.
 *
 * Complémentaire de la charge (heures) : même population de lignes, jours
 * calendaires entre date d'expédition et date de référence.
 */

export const PROFONDEUR_BUCKET_DEFS = [
  { id: '1-7', label: '1–7 j', min: 1, max: 7 },
  { id: '8-14', label: '8–14 j', min: 8, max: 14 },
  { id: '15-30', label: '15–30 j', min: 15, max: 30 },
  { id: '>30', label: '>30 j', min: 31, max: Number.POSITIVE_INFINITY },
] as const

export type ProfondeurBucketId = (typeof PROFONDEUR_BUCKET_DEFS)[number]['id']

export interface RetardProfondeurBucket {
  id: ProfondeurBucketId
  label: string
  heures: number
  nbLignes: number
}

export interface RetardProfondeurKpi {
  /** Retard max (jours calendaires) parmi les lignes. */
  maxJours: number
  /** Moyenne des jours pondérée par les heures de charge restantes. */
  moyennePondereeHeures: number
  buckets: RetardProfondeurBucket[]
}

/** Jours de retard calendaires (0 si date absente ou future). */
export function computeJoursRetard(dateExpIso: string | null, refIso: string): number {
  if (!dateExpIso) return 0
  return Math.max(0, daysBetweenIso(dateExpIso, refIso))
}

export function emptyProfondeur(): RetardProfondeurKpi {
  return {
    maxJours: 0,
    moyennePondereeHeures: 0,
    buckets: PROFONDEUR_BUCKET_DEFS.map((b) => ({
      id: b.id,
      label: b.label,
      heures: 0,
      nbLignes: 0,
    })),
  }
}

/**
 * Agrège la profondeur à partir des lignes déjà filtrées (charge > 0).
 * Pondération : Σ(jours × heures) / Σ(heures) ; si heures nulles → moyenne simple.
 */
export function computeProfondeur(
  lignes: ReadonlyArray<{ joursRetard: number; heures: number }>
): RetardProfondeurKpi {
  if (lignes.length === 0) return emptyProfondeur()

  let maxJours = 0
  let sumJh = 0
  let sumH = 0
  let sumJ = 0
  const bucketAccum = new Map<ProfondeurBucketId, { heures: number; nbLignes: number }>()
  for (const def of PROFONDEUR_BUCKET_DEFS) {
    bucketAccum.set(def.id, { heures: 0, nbLignes: 0 })
  }

  for (const l of lignes) {
    const j = Math.max(0, Math.round(l.joursRetard))
    const h = Math.max(0, l.heures)
    if (j > maxJours) maxJours = j
    sumJh += j * h
    sumH += h
    sumJ += j

    const def = PROFONDEUR_BUCKET_DEFS.find((b) => j >= b.min && j <= b.max)
    if (def) {
      const acc = bucketAccum.get(def.id)!
      acc.heures += h
      acc.nbLignes += 1
    }
  }

  const moyenne =
    sumH > 0 ? Math.round((sumJh / sumH) * 10) / 10 : Math.round((sumJ / lignes.length) * 10) / 10

  return {
    maxJours,
    moyennePondereeHeures: moyenne,
    buckets: PROFONDEUR_BUCKET_DEFS.map((b) => {
      const acc = bucketAccum.get(b.id)!
      return {
        id: b.id,
        label: b.label,
        heures: Math.round(acc.heures * 10) / 10,
        nbLignes: acc.nbLignes,
      }
    }),
  }
}
