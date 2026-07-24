/**
 * Détail d'une période de charge — ce qui compose UNE barre du graphe /charge.
 *
 * Reprend les mêmes entrées et le même calcul que l'agrégat
 * (`fetchChargeInputs` / `computeChargeNeeds`) puis filtre sur (poste, bucket)
 * au lieu de sommer : la table ne peut donc pas diverger de la barre qu'elle
 * explique. Aucune requête X3 supplémentaire — tout passe par les caches SWR
 * de boardDataset ; seules la résolution des noms clients et les désignations
 * d'articles sont lues ici, sur le seul périmètre du bucket cliqué.
 *
 * Le filtre statut/nature et la bascule brut/net ne sont PAS appliqués côté
 * serveur : chaque ligne porte son segment (`field`) et ses deux valeurs, et le
 * client masque avec le même jeu de segments qu'il applique déjà au graphe.
 * C'est ce qui garantit que le total de la table suit la hauteur de la barre
 * quel que soit le filtre actif.
 */

import cache from '@adonisjs/cache/services/main'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import staticSync from '#services/static_sync_service'
import type { Article } from '#app/domain/models/article'
import {
  chargeBucketRange,
  chargeHorizon,
  computeChargeNeeds,
  fetchChargeInputs,
} from '#services/load_payload_loader'

export type ChargeGran = 'month' | 'week'
export type ChargeDetailView = 'of' | 'commande'

/** Segment de la barre auquel la ligne contribue — miroir de `LoadPeriod`. */
export type ChargeSegField = 'f' | 'p' | 's' | 'fi' | 'si'

/** Ligne de détail en vue OF : un ordre de fabrication. */
export interface ChargeDetailOfRow {
  numOf: string
  article: string
  designation: string | null
  statutLabel: string | null
  quantite: number
  dateIso: string
  field: Extract<ChargeSegField, 'f' | 'p' | 's'>
  hours: number
}

/** Ligne de détail en vue commande : un besoin (PF ou composant induit). */
export interface ChargeDetailCmdRow {
  article: string
  designation: string | null
  /** 0 = produit fini (charge directe), >0 = composant induit. */
  depth: number
  /** Article parent immédiat — null au depth 0. */
  parent: string | null
  /** Produit fini de tête de la chaîne. */
  pfArticle: string
  numCommande: string | null
  ligne: string | null
  /** Raison sociale si résolue, sinon le code brut ; null sur une prévision. */
  client: string | null
  dateIso: string
  field: ChargeSegField
  brutQty: number
  netQty: number
  brutHours: number
  netHours: number
}

export interface ChargeDetail {
  view: ChargeDetailView
  poste: { code: string; label: string }
  bucket: { key: string; gran: ChargeGran; label: string; fromIso: string; toIso: string }
  ofRows: ChargeDetailOfRow[]
  cmdRows: ChargeDetailCmdRow[]
  x3Error: string | null
}

export interface ChargeDetailParams {
  start?: string
  poste: string
  view: ChargeDetailView
  gran: ChargeGran
  bucket: string
}

const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class ChargeDetailBadRequest extends Error {}

export async function loadChargeDetail(params: ChargeDetailParams): Promise<ChargeDetail> {
  const poste = params.poste.trim()
  if (!poste) throw new ChargeDetailBadRequest('Poste manquant')

  const range = chargeBucketRange(params.gran, params.bucket)
  if (!range) throw new ChargeDetailBadRequest(`Période illisible : ${params.bucket}`)

  const { monthStart, horizonEnd } = chargeHorizon(params.start)

  const cacheKey = `detail:charge:${isoDay(monthStart)}:${params.view}:${poste}:${params.gran}:${params.bucket}`
  return cache.namespace('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: async (): Promise<ChargeDetail> => {
      const inputs = await fetchChargeInputs(monthStart, horizonEnd)

      const inBucket = (d: Date | null): boolean =>
        !!d && d.getTime() >= range.from.getTime() && d.getTime() <= range.to.getTime()

      const bucket = {
        key: params.bucket,
        gran: params.gran,
        label: range.label,
        fromIso: isoDay(range.from),
        toIso: isoDay(range.to),
      }
      const posteLabel = inputs.wstLabels.get(poste) ?? poste

      if (params.view === 'of') {
        const ofRows: ChargeDetailOfRow[] = []
        for (const mo of inputs.mos) {
          const gamme = inputs.gammeMap.get(mo.article)
          if (gamme?.workstation !== poste) continue
          if (!inBucket(mo.startDate)) continue
          const rate = gamme.rate ?? 0
          const hours = rate > 0 ? mo.quantity / rate : 0
          if (hours <= 0) continue
          ofRows.push({
            numOf: mo.numOf,
            article: mo.article,
            designation: mo.designation,
            statutLabel: mo.statutLabel,
            quantite: mo.quantity,
            dateIso: isoDay(mo.startDate!),
            field: mo.status === 1 ? 'f' : mo.status === 2 ? 'p' : 's',
            hours,
          })
        }
        ofRows.sort((a, b) => b.hours - a.hours)
        return {
          view: 'of',
          poste: { code: poste, label: posteLabel },
          bucket,
          ofRows,
          cmdRows: [],
          x3Error: inputs.x3Error,
        }
      }

      const needs = (await computeChargeNeeds(inputs)).filter(
        (n) => n.wst === poste && inBucket(n.date) && n.brutHours > 0
      )

      // Désignations : référentiel articles LOCAL (SQLite), pas X3.
      const articles = await staticSync.readArticles().catch(() => [] as Article[])
      const desByArticle = new Map(articles.map((a) => [a.code, a.description || null]))

      // Noms clients : une seule requête BPARTNER, sur les seuls codes du bucket.
      const clientCodes = [
        ...new Set(needs.map((n) => n.source?.client).filter((c): c is string => !!c)),
      ]
      const clientNames = clientCodes.length
        ? await new X3OrderLineRepository()
            .resolveClientNames(clientCodes)
            .catch(() => new Map<string, string>())
        : new Map<string, string>()

      const cmdRows: ChargeDetailCmdRow[] = needs.map((n) => {
        const code = n.source?.client ?? null
        return {
          article: n.article,
          designation: desByArticle.get(n.article) ?? null,
          depth: n.depth,
          parent: n.parent,
          pfArticle: n.source?.pfArticle ?? n.article,
          numCommande: n.source?.numCommande ?? null,
          ligne: n.source?.ligne ?? null,
          // Prévision : X3 ne porte pas de client, on laisse null (l'UI le dit).
          client: code ? (clientNames.get(code) ?? code) : null,
          dateIso: isoDay(n.date),
          field:
            n.depth === 0
              ? n.nature === 'prevision'
                ? 's'
                : 'f'
              : n.nature === 'prevision'
                ? 'si'
                : 'fi',
          brutQty: n.brutQty,
          netQty: n.netQty,
          brutHours: n.brutHours,
          netHours: n.netHours,
        }
      })
      cmdRows.sort((a, b) => b.brutHours - a.brutHours)

      return {
        view: 'commande',
        poste: { code: poste, label: posteLabel },
        bucket,
        ofRows: [],
        cmdRows,
        x3Error: inputs.x3Error,
      }
    },
  })
}
