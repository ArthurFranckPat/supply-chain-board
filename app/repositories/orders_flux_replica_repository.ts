import db from '@adonisjs/lucid/services/db'
import type { OrdersSourceRow } from '#repositories/combined_orders_repository'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineForLoad, OrderLineRow } from '#repositories/order_line_repository'
import type { NeedNature, OrderType } from '#app/domain/models/flow'
import { resteAFabriquer } from '#app/domain/models/orders_qty'

/**
 * Lecture read-only d'`orders_flux_replica` (#98, #105) — miroir de la SOURCE
 * `ORDERS`, jointures de contexte comprises.
 *
 * Ne décide RIEN sur la confiance : passer par
 * `replicaGate.canRead('orders_flux_replica')` en amont, comme les autres
 * répliques.
 *
 * Rend des `OrdersSourceRow`, le type normalisé de
 * `combined_orders_repository` — pas des `Flow`. La mise en forme reste chez
 * `splitOrdersFlows()`, partagée avec la voie X3 directe : une seule règle de
 * mapping, un seul endroit. Si la réplique fabriquait ses propres `Flow`, les
 * deux voies pourraient diverger sans que rien ne le signale — les deux
 * rendraient des objets bien formés.
 */

type ReplicaRow = {
  wiptyp: number
  wipsta: number
  vcrnum: string
  vcrlin: string
  vcrseq: string
  article: string
  designation: string | null
  date_echeance: string | null
  qte_restante: number
  qte_commandee: number
  qte_allouee: number
  partner_nom: string | null
  pays: string | null
  date_commande: string | null
  contremarque: string | null
  bpcord: string | null
  cusordref: string | null
  itmrefbpc: string | null
  sohtyp: string | null
  qte_realisee: number | null
  date_debut: string | null
  stofcy: string | null
  bprnum: string | null
}

/** Ligne de commande ferme telle que `RetardRepository` la consomme. */
export interface RetardReplicaLine {
  numCommande: string
  ligne: string
  client: string | null
  article: string
  designation: string | null
  dateExpedition: Date
  qteRestante: number
  qteCommandee: number
  qteAllouee: number
  contremarque: string | null
  orderType: OrderType | null
}

const OF_STATUS_LABELS: Record<number, string> = { 1: 'Ferme', 2: 'Planifié', 3: 'Suggéré' }

/** `YYYY-MM-DD` local — même format que l'ingestion (`isoDay`). */
function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/**
 * Date en heure LOCALE, contrairement à `toDate()` ci-dessus qui force UTC.
 *
 * L'asymétrie est voulue et reprend celle des deux tables fusionnées :
 * `orders_replica` parsait ses dates en local (`parseLocalDay`), la lecture des
 * flux les veut en UTC pour ses seaux de période. Les aligner ferait décaler
 * l'un ou l'autre d'un jour — donc chaque vue garde la convention de la table
 * qu'elle remplace.
 */
function parseLocalDay(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toManufacturingOrder(r: ReplicaRow): ManufacturingOrder {
  const status = (r.wipsta >= 1 && r.wipsta <= 3 ? r.wipsta : 3) as 1 | 2 | 3
  return {
    numOf: r.vcrnum,
    article: r.article,
    designation: r.designation,
    status,
    statutLabel: OF_STATUS_LABELS[status] ?? null,
    typeOfLabel: null,
    // `qte_commandee` porte `EXTQTY_0`, que `ManufacturingOrder` appelle
    // `quantityLaunched` — même champ X3, deux noms selon le contexte.
    quantity: r.qte_restante,
    quantityLaunched: r.qte_commandee,
    quantityDone: r.qte_realisee ?? 0,
    unit: null,
    startDate: parseLocalDay(r.date_debut),
    endDate: parseLocalDay(r.date_echeance),
  }
}

function toOrderLine(r: ReplicaRow): OrderLineRow {
  return {
    numCommande: r.vcrnum,
    ligne: r.vcrlin,
    client: r.partner_nom,
    article: r.article,
    designation: r.designation,
    // Reste à FABRIQUER, dérivé à la lecture et jamais stocké : c'est la
    // correction de `1783300000011`, la table garde les trois quantités brutes
    // et chaque lecteur compose la sienne. Via `resteAFabriquer()` et non une
    // soustraction recopiée — `orders_qty.ts` est le seul endroit où « ce qu'il
    // reste à faire » se définit, clamp à 0 compris.
    quantite: resteAFabriquer(r.qte_restante, r.qte_allouee),
    dateLivraison: parseLocalDay(r.date_echeance) ?? new Date(0),
    contremarque: r.contremarque,
    unite: null,
    orderType: (r.sohtyp as OrderType | null) ?? null,
    nature: r.wipsta === 3 ? 'PREVISION' : 'COMMANDE',
  }
}

/**
 * `T00:00:00Z` et NON heure locale. Les dates d'`ORDERS` alimentent des
 * comparaisons de jour et des seaux de période côté appelants, qui travaillent
 * en UTC (même convention que `parseX3Date`, zone UTC forcée, côté X3 direct).
 * Minuit LOCAL en UTC+1/+2 vaut la veille en UTC — parser en heure locale
 * ferait reculer chaque échéance d'un jour, donc parfois d'une période entière
 * à la frontière d'un mois ou d'une semaine ISO.
 */
function toDate(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null
}

function toOwn(r: ReplicaRow): OrdersSourceRow {
  return {
    wiptyp: r.wiptyp,
    wipsta: r.wipsta,
    vcrnum: r.vcrnum,
    // Chaînes vides à la relecture : la table est STRICT et NOT NULL sur ces
    // trois colonnes (elles composent la clé), mais le contrat du type
    // normalisé les rend nullables — X3 peut ne rien porter.
    vcrlin: r.vcrlin || null,
    vcrseq: r.vcrseq || null,
    article: r.article,
    designation: r.designation,
    date: toDate(r.date_echeance),
    qteRestante: r.qte_restante,
    qteCommandee: r.qte_commandee,
    qteAllouee: r.qte_allouee,
    partnerNom: r.partner_nom,
    pays: r.pays,
    dateCommande: toDate(r.date_commande),
    contremarque: r.contremarque,
    bpcord: r.bpcord,
    cusordref: r.cusordref,
    itmrefbpc: r.itmrefbpc,
    sohtyp: r.sohtyp,
    stofcy: r.stofcy,
    bprnum: r.bprnum,
  }
}

/** Fenêtre réellement ingérée, telle que `syncOrdersFlux` la journalise. */
export interface OrdersFluxCoverage {
  from: string
  to: string
}

/**
 * La réplique couvre-t-elle la plage demandée ?
 *
 * **Question distincte de la fraîcheur**, et le portail ne la traite pas : un run
 * parfait d'il y a trente secondes ne dit rien de ce qu'il a RAMENÉ. Même
 * séparation que pour `stock_flux_replica` (`replicaCoversFluxRange`), et elle
 * mord bien plus fort ici : la fenêtre de `/suivi` est choisie au CALENDRIER par
 * l'utilisateur, donc arbitraire, quand celle de la valorisation est un défaut
 * glissant rarement modifié.
 *
 * Sans ce contrôle, demander mars 2029 rendrait une population vide et
 * plausible : aucune erreur, aucun écran vide, juste un plan amputé.
 *
 * **Inclusion STRICTE des deux côtés**, alors que WIPTYP=2 (réceptions) n'a pas
 * de borne basse à l'ingestion et resterait complet sous `from`. Les trois
 * familles sortent d'une seule lecture et alimentent une seule vue : en servir
 * une complète et deux tronquées donnerait un `/suivi` où l'appro existe sans la
 * demande qu'il couvre. Tout ou rien, comme `replicaServesRetard()`.
 *
 * Pure et exportée : c'est une règle, elle se teste sans base.
 */
export function replicaCoversOrdersRange(
  coverage: OrdersFluxCoverage | null,
  fromIso: string,
  toIso: string
): boolean {
  if (!coverage) return false
  return coverage.from <= fromIso && coverage.to >= toIso
}

export class OrdersFluxReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Fenêtre du dernier run COMPLET réussi, relue depuis `ingestion_log.note`.
   *
   * Pourquoi la note et non `MIN/MAX(date_echeance)` de la table : ces bornes-là
   * décrivent les données TROUVÉES, pas la plage DEMANDÉE. Si aucune commande
   * n'a d'échéance au-delà de mars 2027 alors que l'ingestion couvrait jusqu'en
   * juillet, un `MAX` ferait repartir en voie directe une plage pourtant
   * couverte — dégradé sans raison. La note dit l'intention du run, qui est la
   * bonne réponse à « qu'est-ce qui a été balayé ».
   *
   * Tout ce qui n'est pas une note lisible vaut « non couvert » : une couverture
   * indémontrable ne doit jamais valoir couverture, même principe que l'âge
   * indémontrable dans `ReplicaGate`.
   */
  async getCoverage(): Promise<OrdersFluxCoverage | null> {
    const row = await this.conn
      .from('ingestion_log')
      .where('table_name', 'orders_flux_replica')
      .where('status', 'ok')
      .where('scope', 'full')
      .orderBy('id', 'desc')
      .first()

    if (!row?.note) return null
    try {
      const parsed = JSON.parse(row.note)
      return typeof parsed?.from === 'string' && typeof parsed?.to === 'string'
        ? { from: parsed.from, to: parsed.to }
        : null
    } catch {
      return null
    }
  }

  /**
   * Population de `fetchLive(from, to)`, rejouée depuis la réplique.
   *
   * Les bornes reproduisent `buildOrdersSql` **par WIPTYP**, et l'asymétrie est
   * volontaire, pas un oubli :
   *  - WIPTYP 1 et 5 : fenêtre `[from, to]` fermée ;
   *  - WIPTYP 2 : borne HAUTE seule. Une réception achat en retard (échéance
   *    passée, reliquat > 0) reste attendue — lui poser une borne basse la
   *    ferait disparaître de l'appro tout en la laissant peser sur le plan.
   *
   * Bornes INCLUSIVES des deux côtés, comme le `BETWEEN` implicite du SQL
   * (`>= from AND <= to`).
   *
   * Les WIPSTA sont filtrés à l'INGESTION et pas ici : ils ne dépendent pas des
   * paramètres d'appel, et les rejouer à la lecture ferait vivre la même règle
   * à deux endroits — la classe de bug de `getOrdersForWindow`.
   */
  async getLiveRows(
    fromIso: string,
    toIso: string,
    /**
     * Familles à ramener. Défaut = les trois (`fetchLive`).
     * `[1, 2]` sert `fetchDemandAndReception`, qui a la même population sans les
     * OF — inutile de rapatrier 13 500 lignes WIPTYP=5 pour les jeter ensuite.
     */
    wiptyps: Array<1 | 2 | 5> = [1, 2, 5]
  ): Promise<OrdersSourceRow[]> {
    const windowed = wiptyps.filter((w) => w !== 2)
    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where((q) => {
        if (windowed.length > 0) {
          q.orWhere((w) =>
            w
              .whereIn('wiptyp', windowed)
              .andWhere('date_echeance', '>=', fromIso)
              .andWhere('date_echeance', '<=', toIso)
          )
        }
        if (wiptyps.includes(2)) {
          q.orWhere((w) => w.where('wiptyp', 2).andWhere('date_echeance', '<=', toIso))
        }
      })
    return (rows as ReplicaRow[]).map(toOwn)
  }

  /**
   * VUE « ordres de fabrication » — remplace `orders_replica`.
   *
   * `WIPTYP=5` est la tranche OF de la source. Les filtres de population
   * (`WIPSTA 1/2/3`, `RMNEXTQTY > 0`, lookback `ENDDAT ≥ J-90`) sont appliqués à
   * l'INGESTION, comme ils l'étaient dans `syncOrders` — donc rien à rejouer ici.
   *
   * `unit` et `typeOfLabel` valent `null` : `X3OfRepository.getManufacturingOrders()`
   * ne les renseigne pas davantage, aucune perte face à la voie directe.
   */
  async getManufacturingOrders(): Promise<ManufacturingOrder[]> {
    const rows = await this.conn.from('orders_flux_replica').select('*').where('wiptyp', 5)
    return (rows as ReplicaRow[]).map(toManufacturingOrder)
  }

  /**
   * VUE « ordres de fabrication » bornée par date de DÉBUT — remplace
   * `orders_replica.getManufacturingOrdersForWindow()`.
   *
   * Borne sur `date_debut` (`STRDAT_0`) et NON sur l'échéance : c'est la date de
   * lancement qui positionne un OF sur `/programme` et `/charge`. Bornes
   * inclusives, comme le `>= from AND <= to` de `buildWindowSql`.
   */
  async getManufacturingOrdersForWindow(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where('wiptyp', 5)
      .andWhere('date_debut', '>=', isoLocal(from))
      .andWhere('date_debut', '<=', isoLocal(to))
    return (rows as ReplicaRow[]).map(toManufacturingOrder)
  }

  /**
   * VUE « lignes de commande ouvertes » — remplace `order_lines_replica`.
   *
   * `WIPTYP=1` est la tranche demande de la source. Le filtre
   * `resteAFabriquer > 0` reste appliqué ICI et non à l'ingestion : c'est
   * exactement la correction de `1783300000011` — une ligne entièrement allouée
   * a un reste à fabriquer nul mais reste dans le périmètre du KPI retard, qui
   * la lit par `getRetardLines()`.
   */
  async getOpenOrderLines(opts?: { from?: string; to?: string }): Promise<OrderLineRow[]> {
    let query = this.conn.from('orders_flux_replica').select('*').where('wiptyp', 1)
    if (opts?.from && opts?.to) {
      query = query
        .andWhere('date_echeance', '>=', opts.from)
        .andWhere('date_echeance', '<=', opts.to)
    }
    const rows = await query
    return (rows as ReplicaRow[]).map(toOrderLine).filter((l) => l.quantite > 0)
  }

  /**
   * VUE « lignes allégées pour /charge » — remplace la lecture directe de
   * `X3OrderLineRepository.getOrderLinesForLoad()`.
   *
   * Même population que la vue ci-dessus (WIPTYP=1, WIPSTA 1/3), mêmes bornes de
   * fenêtre INCLUSIVES sur l'échéance. `quantite` = `resteAFabriquer`, le filtre
   * de la vue directe, calculé ici.
   *
   * Le SQL direct porte `WIPSTA_0 IN (1, 3)` ; ce n'est PAS rejoué ici. Les
   * WIPSTA sont filtrés à l'INGESTION (`WIPSTA_BY_WIPTYP[1]`), et les rejouer à
   * la lecture ferait vivre la même règle à deux endroits — la classe de bug de
   * `getOrdersForWindow`, déjà écartée pour `getLiveRows()` juste au-dessus.
   *
   * `clientCode` est `bprnum`, le code tiers BRUT — la résolution du nom reste à
   * la demande via `resolveClientNames`, comme la voie directe (#39). Une ligne
   * ingérée avant `1783300000017` n'a pas de code : `null`, identique à la voie
   * directe sur une ligne sans BPRNUM.
   */
  async getOrderLinesForLoad(fromIso: string, toIso: string): Promise<OrderLineForLoad[]> {
    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where('wiptyp', 1)
      .andWhere('date_echeance', '>=', fromIso)
      .andWhere('date_echeance', '<=', toIso)

    return (rows as ReplicaRow[])
      .map((r) => ({
        article: r.article,
        designation: r.designation,
        quantite: resteAFabriquer(r.qte_restante, r.qte_allouee),
        dateLivraison: parseLocalDay(r.date_echeance),
        nature: (r.wipsta === 1 ? 'COMMANDE' : 'PREVISION') as NeedNature,
        numCommande: r.vcrnum || null,
        // Une prévision porte VCRLIN_0 = 0 : pas de ligne, pas un « 0 » à afficher.
        ligne: r.vcrlin && r.vcrlin !== '0' ? r.vcrlin : null,
        clientCode: r.bprnum,
      }))
      .filter((l): l is OrderLineForLoad => l.dateLivraison !== null && l.quantite > 0)
  }

  /**
   * VUE « lignes en retard » — remplace `order_lines_replica.getRetardLines()`.
   *
   * Filtre `qte_restante > 0` et NON `quantite > 0` : le KPI retard déduit
   * lui-même le stock alloué, donc une ligne entièrement allouée doit lui
   * parvenir pour être écartée en connaissance de cause. C'est toute la raison
   * d'être de `1783300000011`.
   *
   * `wipsta = 1` ≡ commandes FERMES, les prévisions n'entrent pas dans le retard.
   * Borne haute EXCLUSIVE, comme le `< toStr` du SQL d'origine.
   */
  async getRetardLines(fromIso: string, toIso: string): Promise<RetardReplicaLine[]> {
    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where('wiptyp', 1)
      .andWhere('wipsta', 1)
      .andWhere('qte_restante', '>', 0)
      .andWhere('date_echeance', '>=', fromIso)
      .andWhere('date_echeance', '<', toIso)
      .orderBy('date_echeance')

    return (rows as ReplicaRow[]).map((r) => ({
      numCommande: r.vcrnum,
      ligne: r.vcrlin,
      client: r.partner_nom,
      article: r.article,
      designation: r.designation,
      dateExpedition: parseLocalDay(r.date_echeance) ?? new Date(0),
      qteRestante: r.qte_restante,
      qteCommandee: r.qte_commandee,
      qteAllouee: r.qte_allouee,
      contremarque: r.contremarque,
      orderType: (r.sohtyp as OrderType | null) ?? null,
    }))
  }

  /**
   * VUE « OF mobilisables pour le matching » (#99) — remplace
   * `orders_replica.getManufacturingOrdersForMatching()`.
   *
   * OF démarrés hors de la fenêtre mais qui s'y terminent, sur un article ayant
   * de la demande dedans. Sans eux, un OF ferme déjà lancé sort du pool et sa
   * commande est ré-allouée à une suggestion plus tardive.
   *
   * La consolidation SIMPLIFIE cette lecture : demande (WIPTYP=1) et OF
   * (WIPTYP=5) vivent désormais dans la même table, donc la sous-requête des
   * articles devient une simple auto-jointure au lieu de deux allers séparés.
   */
  async getManufacturingOrdersForMatching(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    const fromIso = isoLocal(from)
    const toIso = isoLocal(to)

    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where('wiptyp', 5)
      .andWhere('date_echeance', '<=', toIso)
      .andWhere((q) => q.where('date_debut', '<', fromIso).orWhere('date_debut', '>', toIso))
      .whereIn('article', (sub) =>
        sub
          .from('orders_flux_replica')
          .where('wiptyp', 1)
          .andWhere('date_echeance', '>=', fromIso)
          .andWhere('date_echeance', '<=', toIso)
          .select('article')
      )
    return (rows as ReplicaRow[]).map(toManufacturingOrder)
  }
}

const ordersFluxReplicaRepository = new OrdersFluxReplicaRepository()
export default ordersFluxReplicaRepository
