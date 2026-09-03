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
 *
 * Alignement temporel : quand la page passe la `version` du payload (`?v=`),
 * les entrées X3 relues sont celles FIGÉES par l'exécution du payload qui a
 * produit la barre — la table ne peut pas diverger de la barre par un effet de
 * cache périmé (deux snapshots X3 différents), seulement par un filtre choisi
 * à l'écran.
 */

import { cacheNs } from '#services/cache_ns'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import staticSync from '#services/static_sync_service'
import type { Article } from '#app/domain/models/article'
import {
  chargeSegment,
  ofSegment,
  type ChargeOfSeg,
  type ChargeSeg,
} from '#app/domain/charge_explosion'
import { hoursForQuantity } from '#app/domain/models/gamme'
import { isoDay } from '#app/utils/dates'
import {
  chargeBucketRange,
  chargeHorizon,
  computeChargeNeeds,
  fetchChargeInputs,
  getPinnedChargeInputs,
  ofResteAProduire,
  type ChargeInputs,
} from '#services/load_payload_loader'

export type ChargeGran = 'month' | 'week'
export type ChargeDetailView = 'of' | 'commande'

/** Segment de la barre auquel la ligne contribue — miroir de `LoadPeriod`. */
export type ChargeSegField = ChargeSeg

/** Ligne de détail en vue OF : un ordre de fabrication. */
export interface ChargeDetailOfRow {
  numOf: string
  article: string
  designation: string | null
  statutLabel: string | null
  quantite: number
  dateIso: string
  field: ChargeOfSeg
  hours: number
}

/** Ligne de détail en vue commande : un besoin (PF ou composant induit). */
export interface ChargeDetailCmdRow {
  article: string
  designation: string | null
  /** 0 = produit fini (charge directe), >0 = composant induit. */
  depth: number
  /** Chaîne BOM du produit fini au parent immédiat — vide au depth 0. */
  path: string[]
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
  /** Reste à produire = net − en-cours (3e cran de la bascule). */
  resteQty: number
  /** Part absorbée par des pièces déjà produites non déclarées — explique la baisse. */
  encoursQty: number
  brutHours: number
  netHours: number
  resteHours: number
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
  /**
   * Version du snapshot charge (`?v=`), émise par le factory du payload.
   *
   * Connue du serveur : le détail est calculé depuis les entrées X3 FIGÉES par
   * l'exécution du payload qui a produit la barre cliquée — table et barre sont
   * du même snapshot X3, et leur total retombe sur la même hauteur même quand
   * les caches de boardDataset tournent entre le rendu de la page et le clic
   * (c'est ce décalage qui montrait 14 h à la barre et 9,9 h à la table).
   * Inconnue ou expirée : repli sur la relecture live, historique.
   */
  version?: string
  /**
   * Purge le cache du détail ET — sur la seule branche sans version — celui des
   * entrées X3 sous-jacentes.
   *
   * Sans ça, le `?refresh=1` de la page rafraîchissait le GRAPHE mais pas le
   * panneau : celui-ci a sa propre clé, que rien n'invalidait. Avec un TTL de
   * 2 min mais un `grace` de 12 h et un vrai SWR (`timeout: 0`), la valeur
   * périmée était servie telle quelle et le rafraîchissement partait en arrière-
   * plan — donc le premier clic après un changement de données montrait encore
   * l'ancienne table, sans aucun moyen de forcer.
   *
   * Avec une version, ce paramètre ne touche plus X3 : le changement de version
   * EST le refresh, et re-purger les entrées casserait l'alignement graphe ↔
   * table qu'il est censé garantir.
   */
  refresh?: boolean
}

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class ChargeDetailBadRequest extends Error {}

export async function loadChargeDetail(params: ChargeDetailParams): Promise<ChargeDetail> {
  const poste = params.poste.trim()
  if (!poste) throw new ChargeDetailBadRequest('Poste manquant')

  // Version nettoyée : c'est un fragment de clé de cache, pas une donnée métier.
  const version = params.version && /^[a-z0-9]{4,24}$/i.test(params.version) ? params.version : null

  const range = chargeBucketRange(params.gran, params.bucket)
  if (!range) throw new ChargeDetailBadRequest(`Période illisible : ${params.bucket}`)

  const { monthStart, horizonEnd } = chargeHorizon(params.start)

  const cacheKey = `detail:charge:${isoDay(monthStart)}:${version ?? 'live'}:${params.view}:${poste}:${params.gran}:${params.bucket}`
  const force = !!params.refresh
  if (force) await cacheNs('charge').delete({ key: cacheKey })
  return cacheNs('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: async (): Promise<ChargeDetail> => {
      // Version connue : on relit les entrées et le stock figés par LE factory
      // qui a produit la barre, pas les caches SWR de boardDataset qui ont pu
      // tourner depuis — c'est toute la différence entre une table alignée et
      // le bug 14 h ≠ 9,9 h. Le `force` n'y change rien : la version est le
      // refresh.
      const pinned = version ? await getPinnedChargeInputs(version) : null
      const inputs: ChargeInputs = pinned
        ? pinned.inputs
        : await fetchChargeInputs(monthStart, horizonEnd, force)

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
          const ops = inputs.gammeMap.get(mo.article) ?? []
          if (!inBucket(mo.startDate)) continue
          const qty = ofResteAProduire(mo, inputs.avancementByOf)
          for (const gamme of ops) {
            if (gamme.workstation !== poste) continue
            const hours = hoursForQuantity(gamme, qty)
            if (hours <= 0) continue
            ofRows.push({
              numOf: mo.numOf,
              article: mo.article,
              designation: mo.designation,
              statutLabel: mo.statutLabel,
              // Reste à produire, pas RMNEXTQTY : la qté affichée doit être celle dont
              // les heures de la ligne sont issues, sinon la table s'explique mal.
              quantite: qty,
              dateIso: isoDay(mo.startDate!),
              field: ofSegment(mo.status),
              hours,
            })
          }
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

      const allNeeds = await computeChargeNeeds(inputs, pinned?.stock)
      const needs = allNeeds.filter((n) => n.wst === poste && inBucket(n.date) && n.brutHours > 0)

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
          path: n.path,
          pfArticle: n.source?.pfArticle ?? n.article,
          numCommande: n.source?.numCommande ?? null,
          ligne: n.source?.ligne ?? null,
          // Prévision : X3 ne porte pas de client, on laisse null (l'UI le dit).
          client: code ? (clientNames.get(code) ?? code) : null,
          dateIso: isoDay(n.date),
          field: chargeSegment(n.depth, n.nature),
          brutQty: n.brutQty,
          netQty: n.netQty,
          resteQty: n.resteQty,
          encoursQty: n.encoursQty,
          brutHours: n.brutHours,
          netHours: n.netHours,
          resteHours: n.resteHours,
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
