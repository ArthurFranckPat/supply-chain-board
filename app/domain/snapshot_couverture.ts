import { isoDay } from '#app/utils/dates'
import { MRP_MESSAGE } from '#app/repositories/appro_repository'

/**
 * Couverture de l'historique des photos (#138 lot 0) — la matière de
 * `node ace snapshot:diagnose`.
 *
 * Le lot 0 est invisible côté UI : rien, sur aucun écran, ne dit si l'horloge
 * de maturation tourne. Ces fonctions répondent à la seule question qui compte
 * avant que le moteur d'explication n'existe : « qu'a-t-on accumulé, et qu'a-t-on
 * perdu ». Pures, sans I/O — le service passe des décomptes déjà agrégés.
 */

/** Ce qu'une table de photos a accumulé. */
export interface CouverturePhotos {
  /** Nombre de JOURS photographiés (pas de lignes). */
  jours: number
  premier: string | null
  dernier: string | null
  /** Jours absents entre le premier et le dernier — trous irrécupérables. */
  manquants: string[]
  /**
   * Jours dont tout ou partie des lignes ont été ÉCRITES un autre jour.
   *
   * Une photo capture l'état live au moment du run : `snapshot:run --date` ne
   * remonte pas le temps, il écrit l'état d'aujourd'hui sous une date passée.
   * Ces jours-là racontent un passé qui n'a pas eu lieu, et le diff du lot 1 les
   * lirait comme du réel.
   */
  antidates: string[]
  /** Décompte du dernier jour, par source (ou par libellé de message). */
  derniere: Record<string, number>
  derniereTotal: number
}

/**
 * Jour ISO d'une colonne `date` relue en base. Selon le driver, elle revient en
 * `Date` plutôt qu'en texte : normaliser ici évite une comparaison de types à
 * chaque point d'appel.
 */
export function jourIso(v: unknown): string {
  return v instanceof Date ? isoDay(v) : String(v).slice(0, 10)
}

/**
 * Jours ISO absents entre le premier et le dernier jour photographié.
 *
 * Une photo manquée est irrécupérable — X3 ne versionne rien et n'autorise
 * aucun rattrapage rétroactif. La seule chose qu'on puisse en faire est de la
 * SIGNALER. Les week-ends comptent : le run nocturne tourne tous les jours, un
 * samedi absent est un vrai trou.
 */
export function joursManquants(jours: string[]): string[] {
  const presents = new Set(jours)
  if (presents.size < 2) return []
  const tri = [...presents].sort()
  const fin = Date.parse(`${tri[tri.length - 1]}T00:00:00Z`)
  const out: string[] = []
  for (let t = Date.parse(`${tri[0]}T00:00:00Z`) + 86_400_000; t < fin; t += 86_400_000) {
    const jour = new Date(t).toISOString().slice(0, 10)
    if (!presents.has(jour)) out.push(jour)
  }
  return out
}

/**
 * La photo d'une liste triée (desc) la plus proche de `apres - fenetreJours`.
 *
 * C'est le cœur du sélecteur de fenêtre J-1/J-7/J-30 (#138 lot 2) : au lieu de
 * déduire une date et d'exiger qu'une photo existe exactement ce jour-là, on
 * prend la photo EXISTANTE la plus proche de la cible. Les week-ends, lundis et
 * pannes cessent d'être des trous : la fenêtre réelle est celle des deux dates
 * retenues, que l'écran affiche telles quelles — elle peut être plus courte OU
 * plus longue que demandée selon les photos disponibles.
 *
 * `datesTrieesDesc` doit être triée du plus récent au plus ancien. Rend `null`
 * s'il n'y a pas au moins deux photos (un diff a besoin de deux points).
 */
export function photoLaPlusProche(
  datesTrieesDesc: string[],
  fenetreJours: number
): [string, string] | null {
  if (datesTrieesDesc.length < 2) return null
  const apres = datesTrieesDesc[0]
  const cible = Date.parse(`${apres}T00:00:00Z`) - fenetreJours * 86_400_000
  let avant = datesTrieesDesc[1]
  let meilleureDistance = Number.POSITIVE_INFINITY
  for (const d of datesTrieesDesc.slice(1)) {
    const distance = Math.abs(Date.parse(`${d}T00:00:00Z`) - cible)
    if (distance < meilleureDistance) {
      meilleureDistance = distance
      avant = d
    }
  }
  return [apres, avant]
}

/**
 * Nombre maximal de photos qu'une recherche de fenêtre remonte, et donc plafond
 * de `fenetre` en jours.
 *
 * Les deux DOIVENT être le même nombre : la requête ne lit que les N photos les
 * plus récentes, donc demander une fenêtre plus longue que N jours ne peut rien
 * rendre de plus. Séparés, `?fenetre=365` tronquait en silence à 62 photos et
 * l'écran annonçait « 12 jours couverts sur 365 demandés » — un chiffre faux
 * présenté comme une mesure.
 */
export const MAX_FENETRE_JOURS = 62

/**
 * Normalise le paramètre `fenetre` d'un endpoint (#138 lot 2).
 *
 * Seuls les entiers strictement positifs sont acceptés (1, 7, 21, 30, …) ;
 * toute autre valeur — `-7`, `0`, `abc`, chaîne vide — rend `null` et
 * l'endpoint retombe sur son défaut. Un `fenetre` négatif produirait sinon des
 * fréquences hebdomadaires négatives côté patterns et une fenêtre affichée
 * absurde.
 *
 * Au-delà de `MAX_FENETRE_JOURS`, la valeur est RABOTÉE à ce plafond plutôt que
 * rejetée : l'endpoint rend alors la fenêtre réellement utilisée, que l'écran
 * affiche telle quelle.
 */
export function fenetreValide(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return null
  return Math.min(n, MAX_FENETRE_JOURS)
}

/** Libellé d'un code `MRPMES_0`, pour un diagnostic lisible sans table de codes. */
export function libelleMessage(code: number): string {
  if (code === MRP_MESSAGE.AVANCER) return 'avancer'
  if (code === MRP_MESSAGE.RETARDER) return 'retarder'
  if (code === MRP_MESSAGE.INUTILE) return 'inutile'
  return `code ${code}`
}

/**
 * Agrège des décomptes `(jour, clé, jour d'écriture) → n` en couverture. Le
 * décompte détaillé ne porte que sur le DERNIER jour : c'est celui qui répond à
 * « la photo de cette nuit est-elle complète », la seule question qu'un
 * diagnostic ait à trancher.
 *
 * `ecrit_le` est facultatif : sans lui, `antidates` reste vide plutôt que de
 * crier au loup sur une absence d'information.
 */
export function couverture(
  rows: Array<Record<string, unknown>>,
  cle: (r: Record<string, unknown>) => string
): CouverturePhotos {
  // Une seule normalisation de date par ligne : `jourIso` peut coûter un parse,
  // et la table croît de ~37 000 lignes par jour.
  const parJour = rows.map((r) => ({ jour: jourIso(r.snapshot_date), row: r }))
  const jours = [...new Set(parJour.map((r) => r.jour))].sort()
  const dernier = jours.length === 0 ? null : jours[jours.length - 1]
  const derniere: Record<string, number> = {}
  const antidates = new Set<string>()
  let derniereTotal = 0
  for (const { jour, row } of parJour) {
    const ecritLe = row.ecrit_le
    if (ecritLe !== null && ecritLe !== undefined && jourIso(ecritLe) !== jour) antidates.add(jour)
    if (jour !== dernier) continue
    const n = Number(row.n)
    const k = cle(row)
    derniere[k] = (derniere[k] ?? 0) + n
    derniereTotal += n
  }
  return {
    jours: jours.length,
    premier: jours.length === 0 ? null : jours[0],
    dernier,
    manquants: joursManquants(jours),
    antidates: [...antidates].sort(),
    derniere,
    derniereTotal,
  }
}
