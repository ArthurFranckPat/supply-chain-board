/**
 * Payload « Contrôle prod » — OF où la déclaration PF dépasse le pointage
 * d'opération intermédiaire (issue #95).
 *
 * Périmètre : ORDERS live (reste>0, DONE>0) ∪ MFGITM ouverts (MFGSTA<3, DONE>0)
 * absents du live. Pas de JOIN X3 : requêtes plates + MFGOPE chunké app-side.
 * Enrichissement dates/statut uniquement sur les OF en écart (pas tout le pool).
 */

import { cacheNs } from '#services/cache_ns'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { X3OperationRepository } from '#repositories/operation_repository'
import {
  computeAvancement,
  ecartDeclarationQty,
  estEcartDeclaration,
} from '#app/domain/of_avancement'
import { tronquerPoste } from '#app/domain/production_realisee'
import staticSync from '#services/static_sync_service'
import LocalMenu from '#models/local_menu'

export type ControleProdSource = 'live' | 'ouvert'

export interface ControleProdRow {
  numOf: string
  article: string
  designation: string | null
  qtyDeclaree: number
  qtyPointee: number
  qtyLancee: number | null
  ecart: number
  qteRestante: number
  source: ControleProdSource
  /** MFGITM.STRDAT — début planifié. */
  dateDebutIso: string | null
  /** MFGITM.ENDDAT — fin planifiée. */
  dateFinIso: string | null
  /** MFGITM.TRKFIRST — premier suivi atelier. */
  datePremierSuiviIso: string | null
  /** MFGITM.TRKLAST — dernier suivi atelier (clé d'analyse). */
  dateDernierSuiviIso: string | null
  /** MFGITM.MFGSTA + libellé menu local. */
  mfgSta: number | null
  mfgStaLabel: string | null
  planner: string | null
  site: string | null
  /** OPENUM dernière op intermédiaire pointée. */
  derniereOpPointee: number | null
  nbOperations: number
  /**
   * Poste de la dernière op pointée (CPLWST sinon EXTWST), tronqué à 6 car.
   * Sert le filtrage cockpit (#119) — null si inconnu.
   */
  poste: string | null
}

export interface ControleProdStats {
  nbEcarts: number
  totalEcart: number
  nbLive: number
  nbOuverts: number
}

export interface ControleProdPayload {
  rows: ControleProdRow[]
  stats: ControleProdStats
  x3Error: string | null
}

const num = (v: unknown) => Number.parseFloat(String(v ?? '0')) || 0

function isoDay(d: Date | null): string | null {
  if (!d) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

interface OfCandidate {
  numOf: string
  article: string
  done: number
  remain: number
  source: ControleProdSource
}

interface OfEnrichment {
  qtyLancee: number
  dateDebutIso: string | null
  dateFinIso: string | null
  datePremierSuiviIso: string | null
  dateDernierSuiviIso: string | null
  mfgSta: number | null
  planner: string | null
  site: string | null
}

async function fetchCandidates(): Promise<OfCandidate[]> {
  const db = new X3Database()
  try {
    const liveSql = `
SELECT VCRNUM_0 AS NUM, ITMREF_0 AS ARTICLE, CPLQTY_0 AS DONE, RMNEXTQTY_0 AS REMAIN
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND WIPSTA_0 IN (1, 2, 3)
  AND RMNEXTQTY_0 > 0
  AND CPLQTY_0 > 0`
    const openSql = `
SELECT MFGNUM_0 AS NUM, ITMREF_0 AS ARTICLE, CPLQTY_0 AS DONE, RMNEXTQTY_0 AS REMAIN
FROM MFGITM
WHERE MFGSTA_0 < 3 AND CPLQTY_0 > 0`

    const [liveRows, openRows] = await Promise.all([
      db.raw(liveSql) as Promise<Record<string, string | null>[]>,
      db.raw(openSql) as Promise<Record<string, string | null>[]>,
    ])

    const byOf = new Map<string, OfCandidate>()
    for (const r of liveRows) {
      const numOf = (r.NUM ?? '').trim()
      if (!numOf) continue
      byOf.set(numOf, {
        numOf,
        article: (r.ARTICLE ?? '').trim(),
        done: num(r.DONE),
        remain: num(r.REMAIN),
        source: 'live',
      })
    }
    for (const r of openRows) {
      const numOf = (r.NUM ?? '').trim()
      if (!numOf || byOf.has(numOf)) continue
      const done = num(r.DONE)
      if (done <= 0) continue
      byOf.set(numOf, {
        numOf,
        article: (r.ARTICLE ?? '').trim(),
        done,
        remain: num(r.REMAIN),
        source: 'ouvert',
      })
    }
    return [...byOf.values()]
  } finally {
    await db.destroy()
  }
}

/** Enrichit les seuls OF en écart via MFGITM (dates suivi, lancée, statut…). */
async function fetchEnrichment(numOfs: string[]): Promise<Map<string, OfEnrichment>> {
  const out = new Map<string, OfEnrichment>()
  if (numOfs.length === 0) return out

  const db = new X3Database()
  try {
    const CHUNK = 500
    for (let i = 0; i < numOfs.length; i += CHUNK) {
      const chunk = numOfs.slice(i, i + CHUNK)
      const inList = chunk.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
      const rows = (await db.raw(
        `SELECT MFGNUM_0 AS NUM, EXTQTY_0 AS LAUNCHED, STRDAT_0 AS STRDAT, ENDDAT_0 AS ENDDAT,
                TRKFIRST_0 AS TRKFIRST, TRKLAST_0 AS TRKLAST, MFGSTA_0 AS MFGSTA,
                PLANNER_0 AS PLANNER, MFGFCY_0 AS SITE
         FROM MFGITM
         WHERE MFGNUM_0 IN (${inList})`
      )) as Record<string, string | null>[]
      for (const r of rows) {
        const numOf = (r.NUM ?? '').trim()
        if (!numOf) continue
        const staRaw = r.MFGSTA
        const mfgSta =
          staRaw != null && String(staRaw).trim() !== ''
            ? Number.parseInt(String(staRaw), 10)
            : null
        out.set(numOf, {
          qtyLancee: num(r.LAUNCHED),
          dateDebutIso: isoDay(parseX3Date(r.STRDAT)),
          dateFinIso: isoDay(parseX3Date(r.ENDDAT)),
          datePremierSuiviIso: isoDay(parseX3Date(r.TRKFIRST)),
          dateDernierSuiviIso: isoDay(parseX3Date(r.TRKLAST)),
          mfgSta: Number.isFinite(mfgSta as number) ? (mfgSta as number) : null,
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
 * Calcule la liste d'écarts. `force` purge le cache bentocache (2 min).
 */
export async function loadControleProdData(force = false): Promise<ControleProdPayload> {
  const ns = () => cacheNs('controle-prod')
  const key = 'payload:v3'
  if (force) await ns().delete({ key })

  try {
    const cached = await ns().getOrSet({
      key,
      ttl: 2 * 60 * 1000,
      factory: async () => {
        const candidates = await fetchCandidates()
        const ops = await new X3OperationRepository().getOperations(candidates.map((c) => c.numOf))
        const avancementByOf = computeAvancement(ops)

        const articles = await staticSync.readArticles().catch(() => [])
        const designations = new Map<string, string>()
        for (const a of articles) if (a.code) designations.set(a.code, a.description)

        const draft: {
          c: OfCandidate
          qtyPointee: number
          derniereOp: number | null
          nbOps: number
          poste: string | null
        }[] = []
        for (const c of candidates) {
          const av = avancementByOf.get(c.numOf)
          if (!estEcartDeclaration(av, c.done)) continue
          const derniereOp = av?.derniereOpPointée ?? null
          const opDerniere =
            derniereOp !== null
              ? ops.find((o) => o.mfgnum === c.numOf && o.openum === derniereOp)
              : undefined
          const brut = opDerniere?.cplwst || opDerniere?.extwst || null
          draft.push({
            c,
            qtyPointee: av?.qtyRealisee ?? 0,
            derniereOp,
            nbOps: av?.nbOperations ?? 0,
            poste: brut ? tronquerPoste(brut) : null,
          })
        }

        const enrich = await fetchEnrichment(draft.map((d) => d.c.numOf))

        // Menu local MFGSTA (chapitre X3 usuel des statuts OF article — 230 si présent,
        // sinon on tombe sur le code numérique).
        const menuRows = await LocalMenu.query()
          .whereIn('chapter', [230, 317])
          .catch(() => [])
        const staLabel = (sta: number | null) => {
          if (sta == null) return null
          const hit =
            menuRows.find((m) => m.chapter === 230 && m.value === sta) ??
            menuRows.find((m) => m.chapter === 317 && m.value === sta)
          return hit?.label ?? String(sta)
        }

        const rows: ControleProdRow[] = draft.map(({ c, qtyPointee, derniereOp, nbOps, poste }) => {
          const e = enrich.get(c.numOf)
          return {
            numOf: c.numOf,
            article: c.article,
            designation: designations.get(c.article) ?? null,
            qtyDeclaree: c.done,
            qtyPointee,
            qtyLancee: e?.qtyLancee ?? null,
            ecart: ecartDeclarationQty(avancementByOf.get(c.numOf), c.done),
            qteRestante: c.remain,
            source: c.source,
            dateDebutIso: e?.dateDebutIso ?? null,
            dateFinIso: e?.dateFinIso ?? null,
            datePremierSuiviIso: e?.datePremierSuiviIso ?? null,
            dateDernierSuiviIso: e?.dateDernierSuiviIso ?? null,
            mfgSta: e?.mfgSta ?? null,
            mfgStaLabel: staLabel(e?.mfgSta ?? null),
            planner: e?.planner ?? null,
            site: e?.site ?? null,
            derniereOpPointee: derniereOp,
            nbOperations: nbOps,
            poste,
          }
        })
        rows.sort((a, b) => b.ecart - a.ecart)

        const stats: ControleProdStats = {
          nbEcarts: rows.length,
          totalEcart: rows.reduce((s, r) => s + r.ecart, 0),
          nbLive: rows.filter((r) => r.source === 'live').length,
          nbOuverts: rows.filter((r) => r.source === 'ouvert').length,
        }
        return { rows, stats, x3Error: null as string | null }
      },
    })
    return cached
  } catch (e) {
    return {
      rows: [],
      stats: { nbEcarts: 0, totalEcart: 0, nbLive: 0, nbOuverts: 0 },
      x3Error: (e as Error).message,
    }
  }
}
