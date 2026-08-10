import { driverDiffAmplitude, type DriverDiffEntry } from '#app/domain/cbn_driver_diff'
import { jourIso } from '#app/domain/snapshot_couverture'

/**
 * Diff temporel backend — question B « pourquoi est-il apparu/changé ? »
 * (ticket 04 : Q8 date d'apparition clé stable VCRNUM:VCRLIN:VCRSEQ,
 *  Q12 sources terrain stables, Lot 0 besoin_matiere_ferme).
 *
 * Pur, sans I/O. Le service porte les lectures SQLite, ce module porte la
 * règle métier : quelle borne, quelles sources, quel tri, quel shape.
 *
 * Sources diffées = entrées terrain stables uniquement (Q12) :
 *  stock, demande_ferme, demande_prevision, appro, of_ferme, besoin_matiere
 *  (WIPSTA=1). Exclus : of_planifie, of_suggestion, appro_suggestion et
 *  WIPTYP=6 WIPSTA 2/3 — jamais de diff de sorties CBN (cbn_explanation:66-76).
 *  WIPSTA 2/3 exclus implicitement : jamais photographiés (ticket 01).
 *
 * Lecture SQLite uniquement — latence négligeable ; trous (week-ends, pannes)
 * sautés sans casser le diff via photoLaPlusProche côté service.
 */

/** Entrées terrain stables admises dans le diff temporel (Q12 + Lot0). */
export const SOURCES_DIFF_TEMP = [
  'stock',
  'demande_ferme',
  'demande_prevision',
  'appro',
  'of_ferme',
  'besoin_matiere',
] as const

export type SourceDiffTemporel = (typeof SOURCES_DIFF_TEMP)[number]

const SOURCES_DIFF_TEMP_SET = new Set<string>(SOURCES_DIFF_TEMP)

/** Une entrée du diff temporel, telle que rendue dans `diff.entrees`. */
export interface TemporelEntree {
  source: SourceDiffTemporel
  detail: string
  jour: string
}

/** Résultat du diff temporel pour un (article, cle). */
export interface DiffTemporelResult {
  depuis: string | null
  entrees: TemporelEntree[]
  message?: string | null
}

/**
 * Parse une clé stable `VCRNUM:VCRLIN:VCRSEQ`.
 * `VCRSEQ` peut être `1` ou `344000` — 4ᵉ composante de la clé ORDERS.
 * Retourne `null` si la forme n'est pas `a:b:c` avec `b` entier.
 */
export function parseCle(cle: string): { vcrnum: string; vcrlin: number; vcrseq: string } | null {
  const parts = cle.trim().split(':')
  if (parts.length !== 3) return null
  const [vcrnumRaw, vcrlinRaw, vcrseqRaw] = parts
  const vcrnum = vcrnumRaw.trim()
  const vcrseq = vcrseqRaw.trim()
  if (!vcrnum || !vcrseq) return null
  const vcrlin = Number(vcrlinRaw.trim())
  if (!Number.isInteger(vcrlin)) return null
  return { vcrnum, vcrlin, vcrseq }
}

/**
 * Première photo où la clé stable porte `MRPMES_0 != 1` (Q8, B).
 * `rows` triés par `snapshot_date` ASC — première ligne où `mrpmes !== 1`.
 * `null` si la clé n'a jamais porté de message (jamais apparu).
 */
export function trouverDepuis(
  rows: Array<{ snapshot_date: string | unknown; mrpmes: number }>
): string | null {
  for (const r of rows) {
    if (r.mrpmes !== 1) return jourIso(r.snapshot_date)
  }
  return null
}

/**
 * Filtre les entrées du driver diff pour le diff temporel :
 * - `itmref === article`
 * - `source ∈ SOURCES_DIFF_TEMP`
 * Tri par `driverDiffAmplitude` décroissante (le plus fort d'abord) —
 * même tri que `/drivers-diff` (§5.4), bornage côté appelant garde le plus fort.
 * `jour` = `apres` (diff direct), pas le jour du pas (frise future).
 */
export function entreesPourArticle(
  entrees: DriverDiffEntry[],
  article: string,
  jour: string
): TemporelEntree[] {
  const filtrees = entrees.filter(
    (e) => e.article === article && SOURCES_DIFF_TEMP_SET.has(e.source as string)
  )
  filtrees.sort((a, b) => driverDiffAmplitude(b) - driverDiffAmplitude(a))
  return filtrees.map((e) => ({
    source: e.source as SourceDiffTemporel,
    detail: e.detail,
    jour,
  }))
}

/**
 * Le diff temporel porte-t-il sur une source admise ?
 * Exposé pour les tests et la documentation — ticket 05 fera la jonction.
 */
export function estSourceDiffTemporel(source: string): source is SourceDiffTemporel {
  return SOURCES_DIFF_TEMP_SET.has(source)
}

/**
 * Date de demande la plus proche de `cible` SANS DÉPASSER `cible` (plancher).
 * Retourne `null` si la liste est vide.
 * Si aucune date ≤ cible (trou avant la première photo), retombe sur la plus
 * proche au sens |distance| — documenté, car le mouvement 06→07 serait alors
 * perdu mais le diff reste défini plutôt que `null` (spec : trous sautés,
 * jamais en faux `apparue` en bloc). Préfère le passé : trou 04–07 encadrant
 * 06 → rend 04 (1j avant) plutôt que 07 (1j après).
 */
export function plusProcheDe(datesDesc: string[], cible: string): string | null {
  if (datesDesc.length === 0) return null
  const cibleMs = Date.parse(`${cible}T00:00:00Z`)
  let floor: string | null = null
  let floorDist = Number.POSITIVE_INFINITY
  let nearest = datesDesc[0]
  let nearestDist = Math.abs(Date.parse(`${nearest}T00:00:00Z`) - cibleMs)
  for (const d of datesDesc) {
    const ms = Date.parse(`${d}T00:00:00Z`)
    const dist = Math.abs(ms - cibleMs)
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = d
    }
    if (ms <= cibleMs) {
      const fDist = cibleMs - ms
      if (fDist < floorDist) {
        floorDist = fDist
        floor = d
      }
    }
  }
  return floor ?? nearest
}
