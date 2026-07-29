/**
 * Payload « Contrôle prod » — OF où la déclaration PF dépasse le pointage
 * d'opération intermédiaire (issue #95).
 *
 * Périmètre : ORDERS live (reste>0, DONE>0) ∪ MFGITM ouverts (MFGSTA<3, DONE>0)
 * absents du live. Pas de JOIN X3 : 2 requêtes plates + MFGOPE chunké app-side.
 */

import cache from '@adonisjs/cache/services/main'
import { X3Database } from '#app/x3/client/x3_database'
import { X3OperationRepository } from '#repositories/operation_repository'
import {
  computeAvancement,
  ecartDeclarationQty,
  estEcartDeclaration,
} from '#app/domain/of_avancement'
import staticSync from '#services/static_sync_service'

export type ControleProdSource = 'live' | 'ouvert'

export interface ControleProdRow {
  numOf: string
  article: string
  designation: string | null
  qtyDeclaree: number
  qtyPointee: number
  ecart: number
  qteRestante: number
  source: ControleProdSource
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

interface OfCandidate {
  numOf: string
  article: string
  done: number
  remain: number
  source: ControleProdSource
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

/**
 * Calcule la liste d'écarts. `force` purge le cache bentocache (2 min).
 */
export async function loadControleProdData(force = false): Promise<ControleProdPayload> {
  const ns = () => cache.namespace('controle-prod')
  const key = 'payload'
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

        const rows: ControleProdRow[] = []
        for (const c of candidates) {
          const av = avancementByOf.get(c.numOf)
          if (!estEcartDeclaration(av, c.done)) continue
          rows.push({
            numOf: c.numOf,
            article: c.article,
            designation: designations.get(c.article) ?? null,
            qtyDeclaree: c.done,
            qtyPointee: av?.qtyRealisee ?? 0,
            ecart: ecartDeclarationQty(av, c.done),
            qteRestante: c.remain,
            source: c.source,
          })
        }
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
