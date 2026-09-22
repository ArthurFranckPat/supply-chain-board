/**
 * Détail d'une période de charge — ce qui compose UNE barre du graphe /charge.
 *
 * Reprend les mêmes entrées et le même calcul que l'agrégat
 * (`fetchChargeInputs` / `computeChargeNeeds`) puis filtre sur (poste, bucket)
 * au lieu de sommer : la table ne peut donc pas diverger de la barre qu'elle
 * explique. Aucune requête X3 supplémentaire — tout passe par les caches SWR
 * de boardDataset ; seules la résolution des noms clients et les désignations
 * d'articles sont lues ici.
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
 *
 * `buildChargeDetailRows` produit les lignes de TOUT l'horizon, taguées par
 * poste : le détail d'une barre en filtre un (poste, bucket), l'export CSV les
 * ventile toutes. Une maison unique pour le calcul, donc aucune divergence
 * possible entre la table, le graphe et le fichier exporté.
 */

import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import {
  X3OrderLineRepository,
  type OrderDates,
  type OrderLinePeg,
} from '#repositories/order_line_repository'
import staticSync from '#services/static_sync_service'
import type { Article } from '#app/domain/models/article'
import {
  chargeSegment,
  ofSegment,
  type ChargeNeed,
  type ChargeOfSeg,
  type ChargeSeg,
} from '#app/domain/charge_explosion'
import { CommandeOFMatcher, type MatchingResult } from '#app/domain/of_conso'
import type { Flow } from '#app/domain/models/flow'
import type { Workstation } from '#app/domain/models/workstation'
import { hoursForQuantity } from '#app/domain/models/gamme'
import { capDay, chargeHoursWithEfficiency, isOpenDay } from '#app/domain/capacity'
import { mobiliteDeLigne, type Mobilite } from '#app/domain/load_smoothing'
import { addDays, isoDay } from '#app/utils/dates'
import {
  chargeBucketRange,
  chargeDay,
  chargeHorizon,
  computeChargeNeeds,
  computeChargeStock,
  fetchChargeInputs,
  getPinnedChargeInputs,
  ofDateForMode,
  ofResteAProduire,
  type ChargeInputs,
  type OfDateMode,
} from '#services/load_payload_loader'
import capacityCalendar from '#services/capacity_calendar_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'

export type ChargeGran = 'month' | 'week'
export type ChargeDetailView = 'of' | 'commande'

/** Segment de la barre auquel la ligne contribue — miroir de `LoadPeriod`. */
export type ChargeSegField = ChargeSeg

/** Commande cliente ou prévision allouée à un OF par le moteur de matching. */
export interface ChargeDetailOfCommande {
  numCommande: string
  ligne: string | null
  client: string | null
  clientCode: string | null
  quantite: number
  dateLivraisonIso: string | null
  raison: string
  type: 'order' | 'forecast'
  dateCommandeIso?: string | null
  dateDemandeeIso?: string | null
  dateAccepteeIso?: string | null
}

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
  commandes: ChargeDetailOfCommande[]
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
  /** Code tiers X3 brut — c'est LUI qui porte la règle, pas la raison sociale. */
  clientCode: string | null
  /**
   * La date de cette ligne est-elle négociable ? ALDES S.A. (80001) part tous
   * les jours vers la plateforme France ; tout autre client est un export à
   * départ hebdomadaire contractuel. Calculé serveur, par `load_smoothing` :
   * la règle n'a qu'une seule maison, l'écran ne fait que l'afficher.
   */
  mobilite: Mobilite
  motifMobilite: string
  dateIso: string
  /**
   * Date de livraison portée par X3, avant toute substitution locale.
   *
   * Sans elle, une ligne re-datée ne peut PAS revenir en arrière : l'écran
   * saurait qu'un override existe mais pas ce qu'il remplace, et « rétablir la
   * date X3 » se ferait à l'aveugle. `null` sur une prévision, qui n'a pas de
   * ligne de commande derrière elle.
   */
  dateX3Iso: string | null
  /**
   * Date locale substituée à celle de X3 (`order_line_overrides`), sinon `null`.
   * C'est le marqueur « cette ligne a été repositionnée », et le seul moyen de
   * distinguer une date négociée d'une date d'origine une fois le plan appliqué.
   */
  dateOverrideIso: string | null
  dateCommandeIso?: string | null
  dateDemandeeIso?: string | null
  dateAccepteeIso?: string | null
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
  /** OFs alloués à cette ligne par le moteur de matching commande→OF (suivi). */
  ofs: ChargeDetailRowOf[]
}

/**
 * Allocation OF d'une ligne de besoin, sortie de `CommandeOFMatcher` (of_conso.ts)
 * — le MÊME moteur que la page suivi : contremarque X3 en priorité, puis
 * couverture cumulative statut+date, stock déduit avant allocation.
 */
export interface ChargeDetailRowOf {
  numOf: string
  statutLabel: string | null
  /** Quantité DU BESOIN de la ligne que le moteur a allouée à cet OF. */
  quantite: number
  /** Date de fin de l'OF (ENDDAT). */
  dateIso: string | null
  /** Raison de match reprise telle quelle du moteur ('contremarque hard peg', …). */
  raison: string
  /** Commande à laquelle l'OF est contremarqué côté X3, sinon null. */
  reservePour: string | null
}

/** Capacité nette (h) d'un jour du bucket — 0 quand le poste est fermé. */
export interface ChargeDetailDayCapacity {
  dateIso: string
  capaciteH: number
}

export interface ChargeDetail {
  view: ChargeDetailView
  poste: { code: string; label: string }
  bucket: { key: string; gran: ChargeGran; label: string; fromIso: string; toIso: string }
  /**
   * Capacité du poste jour par jour sur le bucket, calendrier appliqué (fériés,
   * fermetures, sentinelle X3 des jours chômés).
   *
   * Sans elle, le panneau ne pouvait afficher qu'une PART DE LA PÉRIODE : un
   * lundi à 273 % de sa journée s'y lisait « 50 % », barre à moitié pleine. Le
   * seul écran censé montrer le déséquilibre le cachait.
   */
  capaciteParJour: ChargeDetailDayCapacity[]
  ofRows: ChargeDetailOfRow[]
  cmdRows: ChargeDetailCmdRow[]
  x3Error: string | null
}

export interface ChargeDetailParams {
  start?: string
  ofDate?: OfDateMode
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
  applyDemandHorizon?: boolean
}

/** Erreur de paramètre — le contrôleur la traduit en 400. */
export class ChargeDetailBadRequest extends Error {}

// ── Builder partagé : lignes de détail pour TOUT l'horizon ───────────────────
//
// `loadChargeDetail` ne sert qu'UNE barre ; l'export CSV les sert TOUTES. Les
// deux doivent sommer exactement les mêmes lignes, sinon la table et le fichier
// divergeraient — la règle du projet. D'où une maison unique : ce builder
// produit les lignes de l'horizon ENTIER, taguées par poste ; le détail filtre
// ensuite sur (poste, bucket), l'export ventile par bucket.

/** Ligne de détail OF, taguée du poste qui la porte. */
export type ChargeDetailOfRowT = ChargeDetailOfRow & { poste: string }
/** Ligne de détail commande, taguée du poste qui la porte. */
export type ChargeDetailCmdRowT = ChargeDetailCmdRow & { poste: string }

export interface BuildChargeDetailRowsParams {
  inputs: ChargeInputs
  view: ChargeDetailView
  ofDate: OfDateMode
  applyDemandHorizon: boolean
  calendar: { factor(w: Workstation, iso: string): number } | null
  wstByCode: Map<string, Workstation>
  monthStart: Date
  horizonEnd: Date
  /** Stock strict+CQ figé du snapshot — requis en vue commande (repli : recalcul). */
  stock?: Map<string, number>
  orderLineRepo?: Pick<
    X3OrderLineRepository,
    'resolveClientNames' | 'resolveOrderDates' | 'resolveOrderPegs'
  >
}

export interface BuildChargeDetailRowsResult {
  /** Taguées par poste ; `[]` en vue commande. */
  ofRows: ChargeDetailOfRowT[]
  /** Taguées par poste ; `[]` en vue OF. */
  cmdRows: ChargeDetailCmdRowT[]
}

export async function buildChargeDetailRows(
  p: BuildChargeDetailRowsParams
): Promise<BuildChargeDetailRowsResult> {
  const { inputs, wstByCode } = p
  // Le détail décale le jour de rattachement EXACTEMENT comme la barre (même
  // `chargeDay`, même calendrier), sinon la table ne retombe plus sur la hauteur
  // du bucket dès qu'un besoin tombe un jour fermé.
  const dayOf = (wst: string, d: Date): Date =>
    chargeDay(wst, d, p.calendar, wstByCode, p.monthStart, p.horizonEnd)

  // ── Matching commande→OF — le MÊME moteur que le suivi (`CommandeOFMatcher`,
  // of_conso.ts) : contremarque X3 d'abord, puis couverture cumulative
  // statut+date, stock déduit avant allocation. L'allocation est COMPÉTITIVE
  // sur tout l'horizon (une commande plus tôt doit prendre l'OF avant), donc
  // on matche TOUS les besoins de l'article. Offre = OF (`inputs.mos`, flux
  // identiques à boardDataset) + stock strict+CQ FIGÉ du snapshot — le même
  // stock que le netting brut/net/reste, pour que les deux lectures ne se
  // contredisent pas.
  const stock = p.stock ?? (await computeChargeStock(inputs))
  const allNeeds = await computeChargeNeeds(inputs, stock, undefined, p.applyDemandHorizon)
  const needs = allNeeds.filter((n) => n.brutHours > 0)

  // Une demande par (article, commande, ligne, date, nature) : l'explosion
  // émet un besoin PAR POSTE de la gamme, tous porteurs de la même quantité —
  // les dédupliquer, sinon le matcher croirait à autant de demandes séparées.
  const needKey = (
    article: string,
    numCommande: string | null,
    ligne: string | null,
    date: Date,
    prevision: boolean
  ): string =>
    `${article}|${numCommande ?? ''}|${ligne ?? ''}|${isoDay(date)}|${prevision ? 'p' : 'f'}`

  // Type de commande + contremarque X3 : sans eux, `matchCommande` route tout
  // en NOR/MTO et une commande MTS contremarquée rafle les OF des autres
  // commandes du même article (couverture cumulative) au lieu de n'être servie
  // que par SON OF. Échec de lecture = matching dégradé, pas de page vide.
  const repo = p.orderLineRepo ?? new X3OrderLineRepository()
  const pegOrderNums = [
    ...new Set(
      allNeeds
        .filter((n) => n.depth === 0 && n.nature !== 'prevision')
        .map((n) => n.source?.numCommande)
        .filter((c): c is string => !!c)
    ),
  ]
  const pegs = pegOrderNums.length
    ? await repo.resolveOrderPegs(pegOrderNums).catch(() => new Map<string, OrderLinePeg>())
    : new Map<string, OrderLinePeg>()

  const demandByKey = new Map<string, Flow>()
  for (const n of allNeeds) {
    const numCommande = n.source?.numCommande ?? null
    const key = needKey(
      n.article,
      numCommande,
      n.source?.ligne ?? null,
      n.date,
      n.nature === 'prevision'
    )
    if (demandByKey.has(key)) continue
    // Niveau 0 seulement : un besoin induit (composant) hérite de la commande
    // du PF, mais la contremarque désigne l'OF du PF, pas celui du composant.
    const peg =
      n.depth === 0 && n.nature !== 'prevision' && numCommande
        ? pegs.get(`${numCommande}#${n.source?.ligne ?? ''}`)
        : undefined
    demandByKey.set(key, {
      article: n.article,
      quantity: n.brutQty,
      direction: 'demand',
      date: n.date,
      origin:
        n.nature === 'prevision'
          ? {
              type: 'forecast',
              id: numCommande ?? n.article,
              customer: null,
              pays: null,
              orderType: null,
              contremarque: null,
              qteCommandee: n.brutQty,
              qteAllouee: 0,
            }
          : {
              type: 'order',
              id: numCommande ?? n.article,
              customer: n.source?.client ?? '',
              pays: null,
              orderType: peg?.orderType ?? null,
              nature: 'COMMANDE',
              contremarque: peg?.contremarque ?? null,
              qteCommandee: n.brutQty,
              qteAllouee: 0,
              ligne: n.source?.ligne ?? null,
            },
    })
  }

  const demandsByArticle = new Map<string, Flow[]>()
  for (const f of demandByKey.values()) {
    let arr = demandsByArticle.get(f.article)
    if (!arr) demandsByArticle.set(f.article, (arr = []))
    arr.push(f)
  }

  // Flux OF identiques à ceux de boardDataset.getOrdersForWindow : reste
  // RMNEXTQTY en quantité, ENDDAT en date, contremarque portée par l'origine.
  const ofFlowsByArticle = new Map<string, Flow[]>()
  for (const mo of inputs.mos) {
    if (mo.quantity <= 0) continue
    let arr = ofFlowsByArticle.get(mo.article)
    if (!arr) ofFlowsByArticle.set(mo.article, (arr = []))
    arr.push({
      article: mo.article,
      quantity: mo.quantity,
      direction: 'supply',
      date: mo.endDate,
      origin: {
        type: 'of',
        id: mo.numOf,
        status: mo.status,
        statutLabel: mo.statutLabel,
        typeOf: null,
        typeOfLabel: null,
        designation: mo.designation,
        launched: mo.quantityLaunched,
        reservePour: mo.reservePour ?? undefined,
      },
    })
  }

  // Désignations : référentiel articles LOCAL (SQLite), pas X3.
  const articles = await staticSync.readArticles().catch(() => [] as Article[])
  const desByArticle = new Map(articles.map((a) => [a.code, a.description || null]))
  const articlesMap = new Map(articles.map((a) => [a.code, a]))
  const resultByKey = new Map<string, MatchingResult>()
  const commandesByOf = new Map<string, ChargeDetailOfCommande[]>()

  for (const [article, demands] of demandsByArticle) {
    const stockQty = stock.get(article) ?? 0
    const ofFlows = ofFlowsByArticle.get(article) ?? []
    const supply =
      stockQty > 0
        ? [
            ...ofFlows,
            {
              article,
              quantity: stockQty,
              direction: 'supply' as const,
              date: null,
              origin: { type: 'stock' as const, subType: 'strict' as const, pmp: null },
            },
          ]
        : ofFlows
    const matcher = new CommandeOFMatcher(supply, articlesMap, new Map(), 30)
    for (const r of matcher.matchCommandes(demands)) {
      const o = r.demandFlow.origin
      if (o.type !== 'order' && o.type !== 'forecast') continue
      const isOrder = o.type === 'order'
      resultByKey.set(
        needKey(
          r.demandFlow.article,
          o.id,
          isOrder ? (o.ligne ?? null) : null,
          r.demandFlow.date ?? new Date(),
          o.type === 'forecast'
        ),
        r
      )

      for (const alloc of r.ofAllocations) {
        const ofOrigin = alloc.ofFlow.origin
        if (ofOrigin.type !== 'of' || !ofOrigin.id) continue
        const ofId = ofOrigin.id
        const numCommande = o.id ?? ''
        const ligne = isOrder ? (o.ligne ?? null) : null
        const clientCode = isOrder ? o.customer || null : null
        const dateLivraisonIso = r.demandFlow.date ? isoDay(r.demandFlow.date) : null

        let list = commandesByOf.get(ofId)
        if (!list) {
          list = []
          commandesByOf.set(ofId, list)
        }
        const existing = list.find((c) => c.numCommande === numCommande && c.ligne === ligne)
        if (existing) {
          existing.quantite += alloc.qteAllouee
        } else {
          list.push({
            numCommande,
            ligne,
            client: clientCode,
            clientCode,
            quantite: alloc.qteAllouee,
            dateLivraisonIso,
            raison: alloc.matchReason,
            type: isOrder ? 'order' : 'forecast',
          })
        }
      }
    }
  }

  // Repli contremarque X3 directe (ORDERS.VCRNUMORI_0 / reservePour) si non matchée
  for (const mo of inputs.mos) {
    if (!mo.reservePour) continue
    const list = commandesByOf.get(mo.numOf) ?? []
    if (!list.some((c) => c.numCommande === mo.reservePour)) {
      const ol = inputs.orderLines.find((l) => l.numCommande === mo.reservePour)
      list.unshift({
        numCommande: mo.reservePour,
        ligne: ol?.ligne ?? null,
        client: ol?.clientCode ?? null,
        clientCode: ol?.clientCode ?? null,
        quantite: mo.quantity,
        dateLivraisonIso: ol?.dateLivraison ? isoDay(ol.dateLivraison) : null,
        raison: 'contremarque X3',
        type: 'order',
      })
      commandesByOf.set(mo.numOf, list)
    }
  }

  // Tri des commandes par OF : contremarques d'abord, puis par date de livraison au plus tôt
  for (const list of commandesByOf.values()) {
    list.sort((a, b) => {
      const aPeg = a.raison.toLowerCase().includes('contremarque')
      const bPeg = b.raison.toLowerCase().includes('contremarque')
      if (aPeg && !bPeg) return -1
      if (!aPeg && bPeg) return 1
      return (a.dateLivraisonIso ?? '9999').localeCompare(b.dateLivraisonIso ?? '9999')
    })
  }

  // Noms clients : une seule requête BPARTNER, sur tous les codes de l'horizon.
  const clientCodes = [
    ...new Set([
      ...needs.map((n) => n.source?.client).filter((c): c is string => !!c),
      ...inputs.orderLines.map((l) => l.clientCode).filter((c): c is string => !!c),
      ...[...commandesByOf.values()]
        .flatMap((cmds) => cmds.map((c) => c.clientCode))
        .filter((c): c is string => !!c),
    ]),
  ]
  const clientNames = clientCodes.length
    ? await repo.resolveClientNames(clientCodes).catch(() => new Map<string, string>())
    : new Map<string, string>()

  // Dates des commandes : date de commande (ORDDAT), expédition demandée (X4HSHIDAT/DEMDLVDAT), expédition acceptée (SHIDAT)
  const orderNums = [
    ...new Set([
      ...[...commandesByOf.values()]
        .flatMap((cmds) => cmds.map((c) => c.numCommande))
        .filter(Boolean),
      ...(p.view === 'commande'
        ? inputs.orderLines.map((l) => l.numCommande).filter((n): n is string => !!n)
        : []),
    ]),
  ]
  const orderDates = orderNums.length
    ? await repo.resolveOrderDates(orderNums).catch(() => new Map<string, OrderDates>())
    : new Map<string, OrderDates>()

  // Résolution des raisons sociales et des dates sur les commandes des OF
  for (const list of commandesByOf.values()) {
    for (const c of list) {
      if (c.clientCode) {
        c.client = clientNames.get(c.clientCode) ?? c.clientCode
      }
      if (c.numCommande && c.type === 'order') {
        const d =
          (c.ligne ? orderDates.get(`${c.numCommande}#${c.ligne}`) : null) ??
          orderDates.get(c.numCommande)
        if (d) {
          c.dateCommandeIso = d.dateCommandeIso ?? null
          c.dateDemandeeIso = d.dateDemandeeIso ?? null
          c.dateAccepteeIso = d.dateAccepteeIso ?? null
        }
      }
    }
  }

  if (p.view === 'of') {
    const ofRows: ChargeDetailOfRowT[] = []
    for (const mo of inputs.mos) {
      const ops = inputs.gammeMap.get(mo.article) ?? []
      const moDate = ofDateForMode(mo, p.ofDate)
      if (!moDate) continue
      const qty = ofResteAProduire(mo, inputs.avancementByOf)
      for (const gamme of ops) {
        const wst = gamme.workstation
        if (!wst) continue
        const hours = chargeHoursWithEfficiency(hoursForQuantity(gamme, qty), wstByCode.get(wst))
        if (hours <= 0) continue
        ofRows.push({
          poste: wst,
          numOf: mo.numOf,
          article: mo.article,
          designation: mo.designation,
          statutLabel: mo.statutLabel,
          // Reste à produire, pas RMNEXTQTY : la qté affichée doit être celle dont
          // les heures de la ligne sont issues, sinon la table s'explique mal.
          quantite: qty,
          dateIso: isoDay(dayOf(wst, moDate)),
          field: ofSegment(mo.status),
          hours,
          commandes: commandesByOf.get(mo.numOf) ?? [],
        })
      }
    }
    ofRows.sort((a, b) => b.hours - a.hours)
    return { ofRows, cmdRows: [] }
  }

  // Date X3 d'origine de chaque ligne de commande, AVANT substitution
  // locale. `inputs.orderLines` porte la date telle que X3 la donne ;
  // `inputs.lineDateOverrides` porte celle qu'on lui a substituée. Les deux
  // sont nécessaires pour que l'écran puisse proposer le retour en arrière.
  const dateX3ParLigne = new Map<string, string>()
  for (const l of inputs.orderLines) {
    if (l.nature !== 'COMMANDE' || !l.numCommande) continue
    dateX3ParLigne.set(`${l.numCommande}#${l.ligne ?? ''}`, isoDay(l.dateLivraison))
  }

  const rowOfs = (n: ChargeNeed): ChargeDetailRowOf[] => {
    const r = resultByKey.get(
      needKey(
        n.article,
        n.source?.numCommande ?? null,
        n.source?.ligne ?? null,
        n.date,
        n.nature === 'prevision'
      )
    )
    if (!r) return []
    return r.ofAllocations
      .map((a) => {
        const o = a.ofFlow.origin
        if (o.type !== 'of') return null
        return {
          numOf: o.id,
          statutLabel: o.statutLabel,
          quantite: a.qteAllouee,
          dateIso: a.ofFlow.date ? isoDay(a.ofFlow.date) : null,
          raison: a.matchReason,
          reservePour: o.reservePour ?? null,
        }
      })
      .filter((x): x is ChargeDetailRowOf => x !== null)
  }

  const cmdRows: ChargeDetailCmdRowT[] = needs.map((n) => {
    const code = n.source?.client ?? null
    const cleLigne = n.source?.numCommande
      ? `${n.source.numCommande}#${n.source.ligne ?? ''}`
      : null
    // Une ligne INDUITE (composant, depth > 0) n'a pas de date propre à
    // négocier : elle suit son produit fini. Elle hérite donc de la mobilité
    // du client de tête, ce qui est exactement ce qu'on veut dire à l'écran —
    // « bougera si on bouge le PF », pas « intouchable ».
    const mob = mobiliteDeLigne(code)
    const d = n.source?.numCommande
      ? ((n.source.ligne ? orderDates.get(`${n.source.numCommande}#${n.source.ligne}`) : null) ??
        orderDates.get(n.source.numCommande))
      : null
    return {
      poste: n.wst,
      article: n.article,
      designation: desByArticle.get(n.article) ?? null,
      depth: n.depth,
      path: n.path,
      pfArticle: n.source?.pfArticle ?? n.article,
      numCommande: n.source?.numCommande ?? null,
      ligne: n.source?.ligne ?? null,
      // Prévision : X3 ne porte pas de client, on laisse null (l'UI le dit).
      client: code ? (clientNames.get(code) ?? code) : null,
      clientCode: code,
      mobilite: mob.mobilite,
      motifMobilite: mob.motif,
      dateIso: isoDay(dayOf(n.wst, n.date)),
      dateX3Iso: cleLigne ? (dateX3ParLigne.get(cleLigne) ?? null) : null,
      dateOverrideIso: cleLigne ? (inputs.lineDateOverrides.get(cleLigne) ?? null) : null,
      dateCommandeIso: d?.dateCommandeIso ?? null,
      dateDemandeeIso: d?.dateDemandeeIso ?? null,
      dateAccepteeIso: d?.dateAccepteeIso ?? null,
      field: chargeSegment(n.depth, n.nature),
      brutQty: n.brutQty,
      netQty: n.netQty,
      resteQty: n.resteQty,
      encoursQty: n.encoursQty,
      brutHours: chargeHoursWithEfficiency(n.brutHours, wstByCode.get(n.wst)),
      netHours: chargeHoursWithEfficiency(n.netHours, wstByCode.get(n.wst)),
      resteHours: chargeHoursWithEfficiency(n.resteHours, wstByCode.get(n.wst)),
      ofs: rowOfs(n),
    }
  })
  cmdRows.sort((a, b) => b.brutHours - a.brutHours)

  return { ofRows: [], cmdRows }
}

/** Ce qui détermine les lignes brutes — rien du poste ni du bucket. */
export interface LoadChargeDetailRowsParams {
  start?: string
  /** Version du snapshot (`?v=`), déjà nettoyée par l'appelant ; null = live. */
  version: string | null
  view: ChargeDetailView
  ofDate: OfDateMode
  applyDemandHorizon: boolean
  refresh?: boolean
}

export interface LoadChargeDetailRowsResult {
  ofRows: ChargeDetailOfRowT[]
  cmdRows: ChargeDetailCmdRowT[]
  wstByCode: Map<string, Workstation>
  wstLabels: Map<string, string>
  x3Error: string | null
}

/**
 * Base commune au détail et à l'export : les lignes de l'horizon ENTIER,
 * derrière un cache PARTAGÉ.
 *
 * La clé ne porte ni poste ni bucket, que `buildChargeDetailRows` ignore : sa
 * sortie est la même pour tous. Sans ce partage, ouvrir les barres d'un même
 * écran — et exporter derrière — relancerait autant de fois l'explosion de
 * nomenclature, le poste le plus cher de la page. C'est ce que faisait
 * auparavant le détail, mais par bucket : à mesure qu'on l'ouvre plus large,
 * le calcul unique et partagé devient le seul montage qui tienne.
 */
export async function loadChargeDetailRows(
  p: LoadChargeDetailRowsParams
): Promise<LoadChargeDetailRowsResult> {
  const { monthStart, horizonEnd } = chargeHorizon(p.start)
  const ofDate: OfDateMode = p.ofDate === 'end' ? 'end' : 'start'
  const force = !!p.refresh
  // Empreinte des overrides de date : sur la branche « live », les lignes
  // redatent la demande comme la barre — une clé qui ignorerait l'état des
  // overrides servirait le détail d'avant le déplacement.
  const ovSig = await new OrderLineOverrideStore().signature().catch(() => 'none')
  const cacheKey = `rows:charge:s3:${isoDay(monthStart)}:${p.version ?? 'live'}:${p.view}:${ofDate}:h${p.applyDemandHorizon ? 1 : 0}:ov${ovSig}`
  if (force) await cacheNs('charge').delete({ key: cacheKey })

  return cacheNs('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<LoadChargeDetailRowsResult> => {
      // Version connue : on relit les entrées et le stock figés par LE factory
      // qui a produit la barre, pas les caches SWR de boardDataset qui ont pu
      // tourner depuis — c'est toute la différence entre une table alignée et
      // le bug 14 h ≠ 9,9 h. Le `force` n'y change rien : la version est le
      // refresh.
      const pinned = p.version ? await getPinnedChargeInputs(p.version) : null
      const inputs: ChargeInputs = pinned
        ? pinned.inputs
        : await fetchChargeInputs(monthStart, horizonEnd, force)

      const calendar = await capacityCalendar
        .buildCalendar(monthStart.getFullYear(), horizonEnd.getFullYear())
        .catch(() => null)
      const wstByCode = new Map(inputs.workstations.map((w) => [w.code, w]))

      const built = await buildChargeDetailRows({
        inputs,
        view: p.view,
        ofDate,
        applyDemandHorizon: p.applyDemandHorizon,
        calendar,
        wstByCode,
        monthStart,
        horizonEnd,
        stock: pinned?.stock,
      })

      return {
        ofRows: built.ofRows,
        cmdRows: built.cmdRows,
        wstByCode,
        wstLabels: inputs.wstLabels,
        x3Error: inputs.x3Error,
      }
    }),
  })
}

export async function loadChargeDetail(params: ChargeDetailParams): Promise<ChargeDetail> {
  const poste = params.poste.trim()
  if (!poste) throw new ChargeDetailBadRequest('Poste manquant')

  // Version nettoyée : c'est un fragment de clé de cache, pas une donnée métier.
  const version = params.version && /^[a-z0-9]{4,24}$/i.test(params.version) ? params.version : null

  const range = chargeBucketRange(params.gran, params.bucket)
  if (!range) throw new ChargeDetailBadRequest(`Période illisible : ${params.bucket}`)

  const { monthStart, horizonEnd } = chargeHorizon(params.start)

  const ofDate = params.ofDate === 'end' ? 'end' : 'start'
  const applyDemandHorizon = params.applyDemandHorizon ?? true
  // Empreinte des overrides de date : sur la branche « live » (sans version),
  // le détail redate la demande comme la barre — une clé qui ignorerait l'état
  // des overrides servirait la table d'avant le déplacement. Sur la branche
  // versionnée, la version fige déjà le jeu d'overrides dans le snapshot ; la
  // porter aussi ne coûte rien et évite d'avoir à se souvenir de la nuance.
  const ovSig = await new OrderLineOverrideStore().signature().catch(() => 'none')
  const cacheKey = `detail:charge:s4:${isoDay(monthStart)}:${version ?? 'live'}:${params.view}:${poste}:${params.gran}:${params.bucket}:${ofDate}:h${applyDemandHorizon ? 1 : 0}:ov${ovSig}`
  const force = !!params.refresh
  if (force) await cacheNs('charge').delete({ key: cacheKey })
  return cacheNs('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<ChargeDetail> => {
      // Base partagée avec l'export : mêmes entrées X3 (celles du snapshot si
      // `version` est connue), même explosion, MÊME cache. Rien de ce que le
      // poste ou le bucket ajoutent ne se calcule ici.
      const base = await loadChargeDetailRows({
        start: params.start,
        version,
        view: params.view,
        ofDate,
        applyDemandHorizon,
        refresh: force,
      })

      const bucket = {
        key: params.bucket,
        gran: params.gran,
        label: range.label,
        fromIso: isoDay(range.from),
        toIso: isoDay(range.to),
      }
      const posteLabel = base.wstLabels.get(poste) ?? poste

      // Capacité jour par jour — MÊME calcul que les barres du graphe
      // (`capDay` × facteur calendrier, sentinelle X3 écartée par `isOpenDay`).
      // Recopier une autre formule ici ferait qu'un jour affiché à 100 % dans le
      // panneau ne le serait pas dans le graphe.
      const calendar = await capacityCalendar
        .buildCalendar(monthStart.getFullYear(), horizonEnd.getFullYear())
        .catch(() => null)
      const posteWst = base.wstByCode.get(poste)
      const capaciteParJour: ChargeDetailDayCapacity[] = []
      for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) {
        const iso = isoDay(d)
        if (!posteWst) {
          capaciteParJour.push({ dateIso: iso, capaciteH: 0 })
          continue
        }
        const factor = calendar ? calendar.factor(posteWst, iso) : 1
        const open = isOpenDay(posteWst, d, factor)
        capaciteParJour.push({
          dateIso: iso,
          capaciteH: open ? Math.round(capDay(posteWst, d) * factor * 10) / 10 : 0,
        })
      }

      // Bornes du bucket en ISO : le `dateIso` d'une ligne est déjà le jour de
      // rattachement décalé par `chargeDay`, la comparaison lexicographique sur
      // `YYYY-MM-DD` équivaut donc au test d'intervalle sur les Dates.
      const inBucketIso = (dateIso: string): boolean =>
        dateIso >= bucket.fromIso && dateIso <= bucket.toIso

      return {
        view: params.view,
        poste: { code: poste, label: posteLabel },
        bucket,
        capaciteParJour,
        ofRows: base.ofRows.filter((r) => r.poste === poste && inBucketIso(r.dateIso)),
        cmdRows: base.cmdRows.filter((r) => r.poste === poste && inBucketIso(r.dateIso)),
        x3Error: base.x3Error,
      }
    }),
  })
}
