/**
 * Payload « OF à solder » — famille MIROIR du contrôle prod (issue #95).
 *
 * Contrôle prod (`controle_prod_loader.ts`) : déclaré > pointé.
 * Ici : pointé à 100 % et RIEN de déclaré, alors qu'ORDERS annonce encore un reste.
 * Même anomalie de fond (ORDERS ment sur le reste à produire), même destinataire
 * (ordonnancement / atelier), donc même page — mais l'autre sens, et surtout l'autre
 * conséquence : ces OF sont ÉCARTÉS de l'offre, donc ils font basculer des commandes
 * en « sans couverture ». Cf. `estOfFantome` dans `app/domain/of_avancement.ts`.
 *
 * ## Pourquoi ne pas élargir les candidats du contrôle prod
 *
 * `fetchCandidates()` y exige `CPLQTY_0 > 0` : un fantôme a `CPLQTY_0 = 0`, il est donc
 * hors périmètre par construction. Lever ce filtre ferait passer les candidats de ~106
 * à >4 000 OF (mesuré en PROD le 02/08/2026), soit autant de lignes MFGOPE à charger —
 * inacceptable avec le coût O(n²) de ZSOAPSQL.
 *
 * La détection est donc PRISE À LA SOURCE qui la fait déjà : le pipeline ruptures charge
 * MFGOPE pour le pool d'OF de sa fenêtre et remonte `phantomOfs`. On lit son payload en
 * cache — aucune requête X3 supplémentaire pour la détection. Seul l'enrichissement
 * (dates de pointage, poste, planificateur) coûte deux requêtes plates, bornées aux
 * quelques dizaines d'OF concernés.
 */

import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { loadShortageRowsData } from '#services/shortage_payload_loader'
import staticSync from '#services/static_sync_service'
import type { PhantomOfCommande } from '#services/order_impacts_loader'

export interface OfASolderRow {
  numOf: string
  article: string
  designation: string | null
  /** Reste annoncé par ORDERS (RMNEXTQTY) — la quantité fictive. */
  qteRestante: number
  /** Pointage constaté à l'opération la plus avancée / qté prévue sur cette opération. */
  qtyRealisee: number
  qtyPrevueOp: number
  /**
   * Dernière imputation de pointage (MFGOPETRK.IPTDAT) — le discriminant de l'action :
   * pointage d'hier = déclaration en retard, pointage d'il y a trois mois = OF mort.
   * `null` si aucun pointage daté (X3 n'exige pas MFGOPETRK pour clore une opération).
   */
  dernierPointageIso: string | null
  joursDepuisPointage: number | null
  /** Poste du dernier pointage (MFGOPETRK.CPLWST). */
  poste: string | null
  /** MFGITM : jalonnement courant + statut + planificateur (contexte de l'action). */
  dateDebutIso: string | null
  dateFinIso: string | null
  planner: string | null
  site: string | null
  /** Commandes rendues « sans couverture » par l'écartement de cet OF. */
  commandes: PhantomOfCommande[]
}

export interface OfASolderStats {
  nbOfs: number
  totalQte: number
  /** OF dont l'écartement laisse au moins une commande sans couverture. */
  nbBloquants: number
  nbSansCommande: number
}

export interface OfASolderPayload {
  rows: OfASolderRow[]
  stats: OfASolderStats
  x3Error: string | null
}

const EMPTY_STATS: OfASolderStats = { nbOfs: 0, totalQte: 0, nbBloquants: 0, nbSansCommande: 0 }

function isoDay(d: Date | null): string | null {
  if (!d) return null
  // Sentinelle X3 « 31-DEC-99 » (date nulle) : luxon la rend en 1999 — jamais un vrai
  // pointage sur ce périmètre. La laisser passer afficherait « 31/12/99 » comme une date.
  if (d.getUTCFullYear() < 2000) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function sqlList(values: string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')
}

interface PointageInfo {
  dernierPointageIso: string | null
  poste: string | null
}

/** Dernier pointage daté par OF (MFGOPETRK), borné aux OF fantômes. */
async function fetchPointages(numOfs: string[]): Promise<Map<string, PointageInfo>> {
  const out = new Map<string, PointageInfo>()
  if (numOfs.length === 0) return out

  const db = new X3Database()
  try {
    const CHUNK = 500
    for (let i = 0; i < numOfs.length; i += CHUNK) {
      const rows = (await db.raw(
        `SELECT MFGNUM_0 AS NUM, IPTDAT_0 AS IPTDAT, CPLWST_0 AS WST
         FROM MFGOPETRK
         WHERE MFGNUM_0 IN (${sqlList(numOfs.slice(i, i + CHUNK))})`
      )) as Record<string, string | null>[]
      for (const r of rows) {
        const numOf = (r.NUM ?? '').trim()
        if (!numOf) continue
        const iso = isoDay(parseX3Date(r.IPTDAT))
        const prev = out.get(numOf)
        // Dernier pointage = date d'imputation la plus récente ; le poste suit la date.
        if (!prev || (iso && (!prev.dernierPointageIso || iso > prev.dernierPointageIso))) {
          out.set(numOf, { dernierPointageIso: iso, poste: (r.WST ?? '').trim() || null })
        }
      }
    }
    return out
  } finally {
    await db.destroy()
  }
}

interface MfgInfo {
  dateDebutIso: string | null
  dateFinIso: string | null
  planner: string | null
  site: string | null
}

/** Jalonnement + planificateur (MFGITM), bornés aux OF fantômes. */
async function fetchMfgInfo(numOfs: string[]): Promise<Map<string, MfgInfo>> {
  const out = new Map<string, MfgInfo>()
  if (numOfs.length === 0) return out

  const db = new X3Database()
  try {
    const CHUNK = 500
    for (let i = 0; i < numOfs.length; i += CHUNK) {
      const rows = (await db.raw(
        `SELECT MFGNUM_0 AS NUM, STRDAT_0 AS STRDAT, ENDDAT_0 AS ENDDAT,
                PLANNER_0 AS PLANNER, MFGFCY_0 AS SITE
         FROM MFGITM
         WHERE MFGNUM_0 IN (${sqlList(numOfs.slice(i, i + CHUNK))})`
      )) as Record<string, string | null>[]
      for (const r of rows) {
        const numOf = (r.NUM ?? '').trim()
        if (!numOf) continue
        out.set(numOf, {
          dateDebutIso: isoDay(parseX3Date(r.STRDAT)),
          dateFinIso: isoDay(parseX3Date(r.ENDDAT)),
          planner: (r.PLANNER ?? '').trim() || null,
          site: (r.SITE ?? '').trim() || null,
        })
      }
    }
    return out
  } finally {
    await db.destroy()
  }
}

/**
 * Liste des OF à solder. `force` propage l'invalidation au payload ruptures (source
 * de la détection) — pas de cache propre ici : l'enrichissement est borné aux OF déjà
 * détectés, le coût est négligeable devant le pipeline amont.
 */
export async function loadOfASolderData(force = false): Promise<OfASolderPayload> {
  const { phantomOfs, x3Error } = await loadShortageRowsData({ force })
  if (phantomOfs.length === 0) return { rows: [], stats: EMPTY_STATS, x3Error }

  const numOfs = phantomOfs.map((p) => p.numOf)
  const [pointages, mfgInfos, articles] = await Promise.all([
    fetchPointages(numOfs).catch(() => new Map<string, PointageInfo>()),
    fetchMfgInfo(numOfs).catch(() => new Map<string, MfgInfo>()),
    staticSync.readArticles().catch(() => []),
  ])

  const designations = new Map<string, string>()
  for (const a of articles) if (a.code) designations.set(a.code, a.description)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows: OfASolderRow[] = phantomOfs.map((p) => {
    const pt = pointages.get(p.numOf)
    const mfg = mfgInfos.get(p.numOf)
    const dernierPointageIso = pt?.dernierPointageIso ?? null
    const joursDepuisPointage = dernierPointageIso
      ? Math.round(
          (today.getTime() - new Date(`${dernierPointageIso}T00:00:00Z`).getTime()) / 86400000
        )
      : null
    return {
      numOf: p.numOf,
      article: p.article,
      designation: designations.get(p.article) ?? null,
      qteRestante: p.qteRestante,
      qtyRealisee: p.qtyRealisee,
      qtyPrevueOp: p.qtyPrevueOp,
      dernierPointageIso,
      joursDepuisPointage,
      poste: pt?.poste ?? null,
      dateDebutIso: mfg?.dateDebutIso ?? null,
      dateFinIso: mfg?.dateFinIso ?? null,
      planner: mfg?.planner ?? null,
      site: mfg?.site ?? null,
      commandes: p.commandes ?? [],
    }
  })

  // Tri par ENJEU, pas par quantité : d'abord les OF qui laissent une commande sans
  // couverture (livraison en jeu), ensuite les plus anciens (OF morts à nettoyer).
  rows.sort((a, b) => {
    if (a.commandes.length !== b.commandes.length) return b.commandes.length - a.commandes.length
    const ja = a.joursDepuisPointage ?? -1
    const jb = b.joursDepuisPointage ?? -1
    if (ja !== jb) return jb - ja
    return b.qteRestante - a.qteRestante
  })

  return {
    rows,
    stats: {
      nbOfs: rows.length,
      totalQte: rows.reduce((s, r) => s + r.qteRestante, 0),
      nbBloquants: rows.filter((r) => r.commandes.length > 0).length,
      nbSansCommande: rows.filter((r) => r.commandes.length === 0).length,
    },
    x3Error,
  }
}
