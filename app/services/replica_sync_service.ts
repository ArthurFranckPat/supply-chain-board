import db from '@adonisjs/lucid/services/db'
import { X3StockRepository } from '#repositories/stock_repository'
import { StockFluxRepository } from '#repositories/stock_flux_repository'
import { defaultStockRange } from '#repositories/stock_valuation_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3LatencyRepository } from '#repositories/supplier_latency_repository'
import {
  CombinedOrdersRepository,
  type OrdersSourceRow,
} from '#repositories/combined_orders_repository'
import { X3OperationRepository } from '#repositories/operation_repository'
import { ConditionnementRepository } from '#repositories/conditionnement_repository'
import replicaGate, { type ReplicaTable } from '#services/replica_gate'
import { getActiveX3EnvName } from '#config/x3'

/**
 * Ingestion X3 → réplique SQLite locale (issue #98, lot 1).
 *
 * Un seul écrivain (ce service), beaucoup de lecteurs. L'app ne lit PAS encore la
 * réplique : ce lot la remplit et la rend observable, rien d'autre. La bascule des
 * lectures est le lot 2.
 *
 * ## Pourquoi un service distinct de `StaticSyncService`
 *
 * L'issue dit « étendre StaticSyncService ». Elle dit aussi « deux fichiers, pas
 * un » — et les deux exigences se contredisent : `StaticSyncService` écrit sur la
 * connexion `sqlite` (base applicative), la réplique vit sur la connexion
 * `replica` (fichier séparé, cf. `config/database.ts`). Les mélanger rendrait
 * invisible l'invariant qui justifie le second fichier : un écrivain par fichier.
 * Le motif d'origine (swap complet, tableau de lignes, chunks d'insert) est
 * conservé.
 *
 * ## Pourquoi un swap complet et non un merge incrémental
 *
 * Pas d'abord pour la vitesse : pour la COHÉRENCE. `ORDERS` est un produit de
 * batch — l'essentiel de la tranche utile est constitué de suggestions, c'est-à-dire
 * la sortie du CBN, reconstruites à chaque run et sans identité stable. Un merge
 * incrémental sur une table régénérée par lots donne une vue déchirée, moitié run
 * N moitié run N+1. Un swap donne un instantané attribuable à un run.
 *
 * ## Pourquoi les repositories plutôt que du SQL neuf
 *
 * Les repositories portent les règles durement acquises — lookback 90 j,
 * `ROUALT_0 = 1`, exclusion des composants Z, sémantique WIPTYP × WIPSTA,
 * redécoupage des lots sur `resultXml is nil`. Réécrire le SQL ici les
 * réintroduirait une par une, sous forme de bugs.
 */

/** Taille des lots d'insert. Au-delà, SQLite dépasse sa limite de variables liées. */
const INSERT_CHUNK = 400

/**
 * Fenêtre d'ingestion d'`orders_flux_replica`, en jours autour d'aujourd'hui.
 *
 * Le lookback reprend `RETARD_LOOKBACK_DAYS` (défaut 90 j), la même variable que
 * `of_repository` et `RetardRepository` : les trois doivent couvrir la même
 * profondeur de passé, sinon un OF répliqué n'a pas sa ligne de commande, ou le
 * KPI retard voit des lignes sans OF.
 *
 * L'horizon avant est fixé à un an. Les lignes plus lointaines existent mais
 * aucun écran ne les demande — `/programme` et `/ruptures` travaillent à 14 j,
 * `/charge` à 6 mois. Répliquer au-delà coûterait du temps X3 pour rien.
 */
const ORDER_LINES_LOOKBACK_DAYS = Number.parseInt(process.env.RETARD_LOOKBACK_DAYS ?? '90', 10)
const ORDER_LINES_FORWARD_DAYS = 365

/** Fenêtre d'ingestion courante, en ISO. Exportée pour être lisible côté lecture. */
export function orderLinesReplicaWindow(now = new Date()): { from: string; to: string } {
  const from = new Date(now)
  from.setDate(from.getDate() - ORDER_LINES_LOOKBACK_DAYS)
  const to = new Date(now)
  to.setDate(to.getDate() + ORDER_LINES_FORWARD_DAYS)
  // `isoDay` local est nullable (il sert aussi à des dates X3 absentes) ; ici les
  // deux bornes sont construites, jamais nulles.
  return { from: isoDay(from)!, to: isoDay(to)! }
}

export type IngestionStatus = 'ok' | 'failed'

export interface TableIngestionResult {
  table: string
  status: IngestionStatus
  rows: number
  durationMs: number
  error?: string
}

export interface ReplicaSyncResult {
  results: TableIngestionResult[]
  durationMs: number
}

export interface ReplicaFreshness {
  table: string
  status: IngestionStatus
  startedAt: string
  finishedAt: string | null
  rows: number | null
  durationMs: number | null
  ageMs: number | null
}

type Row = Record<string, string | number | null>

/** ISO local `YYYY-MM-DD`, ou null. Voir la note « dates » des migrations. */
function isoDay(date: Date | null | undefined): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * `OrdersSourceRow` → ligne d'`orders_flux_replica`.
 *
 * Partagé par le swap complet (`syncOrdersFlux`) et la ré-ingestion ciblée
 * (`reingestOrders`) : deux mappers séparés finiraient par écrire des lignes
 * subtilement différentes selon le chemin, et une ligne réécrite après une
 * écriture X3 doit être indiscernable de celle qu'un swap produirait.
 */
function toFluxRow(r: OrdersSourceRow): Row {
  return {
    wiptyp: r.wiptyp,
    wipsta: r.wipsta,
    vcrnum: r.vcrnum,
    // Composantes de la clé primaire : `''` et non `null`, la table est
    // NOT NULL dessus. Une ligne X3 sans `VCRLIN`/`VCRSEQ` reste ainsi
    // ingérable, et se relit en `null` (cf. `toOwn`).
    vcrlin: r.vcrlin ?? '',
    vcrseq: r.vcrseq ?? '',
    article: r.article,
    designation: r.designation,
    date_echeance: isoDay(r.date),
    qte_restante: r.qteRestante,
    qte_commandee: r.qteCommandee,
    qte_allouee: r.qteAllouee,
    partner_nom: r.partnerNom,
    pays: r.pays,
    date_commande: isoDay(r.dateCommande),
    contremarque: r.contremarque,
    bpcord: r.bpcord,
    cusordref: r.cusordref,
    itmrefbpc: r.itmrefbpc,
    sohtyp: r.sohtyp,
    // Sans objet pour WIPTYP 1 et 2 (pas d'avancement de production) :
    // `null` et non 0, qui ferait passer « sans objet » pour « rien de
    // réalisé ».
    qte_realisee: r.qteRealisee ?? null,
    date_debut: isoDay(r.dateDebut ?? null),
    stofcy: r.stofcy ?? null,
    bprnum: r.bprnum ?? null,
    // Statut de l'article. L'ingestion ne filtre PLUS dessus (cf. migration
    // `1783300000018`) : elle le porte, et les vues demande le rappliquent.
    itmsta: r.itmsta ?? null,
  }
}

export class ReplicaSyncService {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Rejoue toutes les tables.
   *
   * SÉQUENTIEL et non parallèle : `ZSOAPSQL` est en O(n²) côté serveur X3 et le
   * coût est CPU — trois extractions concurrentes se ralentissent mutuellement.
   * La parallélisation des chunks SOAP a déjà été mesurée sans gain sur ce projet.
   *
   * Une table qui échoue n'interrompt pas les suivantes : `ingest` capture ses
   * erreurs et rend un résultat `failed` au lieu de lever. Une réplique
   * partiellement fraîche reste utilisable, ce qui n'est pas le cas d'une réplique
   * vide. Chaque échec laisse une ligne dans `ingestion_log`.
   */
  async syncAll(source = 'manual'): Promise<ReplicaSyncResult> {
    const start = Date.now()
    const results: TableIngestionResult[] = []

    // `orders_flux_replica` REMPLACE `syncOrders` + `syncOrderLines` : elle mire
    // la même source `ORDERS` et contient leurs deux tranches (WIPTYP 5 et 1).
    // Les garder toutes les trois ferait chercher deux fois la même donnée dans
    // X3, et laisserait deux tables alimentées séparément diverger en silence.
    //
    //   avant  orders 21,6 + order_lines 16,5 + stock 2,5 + receptions 0,9 = 41,5 s
    //          (+ orders-flux 60 s à la main)                              = 101,5 s
    //   après  orders-flux 60 + stock 2,5 + receptions 0,9                 =  63,4 s
    results.push(await this.syncOrdersFlux(source))
    results.push(await this.syncStock(source))
    results.push(await this.syncReceptions(source))

    return { results, durationMs: Date.now() - start }
  }

  /**
   * `orders_flux_replica` — miroir de la SOURCE `ORDERS`, en TROIS passes.
   *
   * Le découpage par `WIPTYP` n'est pas un filtre de consommateur mais une
   * PARTITION : les trois passes réunies rendent exactement la population de
   * `fetchLive`, et `buildOrdersSql` n'a qu'UNE condition par `WIPTYP`, réutilisée
   * telle quelle (cf. `conditionByWiptyp`) — l'ingestion ne peut donc pas dériver
   * de l'appel groupé.
   *
   * Pourquoi ne PAS faire un seul appel : `ZSOAPSQL` est en O(n²) sur les lignes
   * et les colonnes, donc découper coûte MOINS cher que regrouper. Mesuré en PROD
   * sur la fenêtre : 9 208 + 895 + 13 536 = 23 639 lignes ; en un appel unique,
   * 23 639² vaut ~2× la somme des carrés. Le constat était déjà posé lors du
   * travail perf sur `/suivi` : ne pas combiner WIPTYP=1+5.
   *
   * Les trois passes écrivent dans la MÊME table, donc un seul swap : `ingest()`
   * reçoit les lignes déjà concaténées. Une table à moitié remplie parce qu'une
   * passe a échoué serait pire qu'une table périmée — le portail ne saurait pas
   * la distinguer d'une table complète.
   *
   * Dans `syncAll()` depuis `57941a8` (tick 5 min) : mesuré à ~60 s en PROD à la
   * main, absorbé par le tick sans chevauchement grâce à la garde `running`.
   */
  async syncOrdersFlux(source = 'manual'): Promise<TableIngestionResult> {
    const window = orderLinesReplicaWindow()
    return this.ingest(
      'orders_flux_replica',
      source,
      async () => {
        const { from, to } = window
        const repo = new CombinedOrdersRepository()
        const out: Row[] = []
        // Séquentiel : même motif que `syncAll()`, le coût de ZSOAPSQL est CPU
        // côté X3 et trois extractions concurrentes se ralentissent mutuellement.
        for (const wiptyp of [1, 2, 5] as const) {
          const rows = await repo.fetchForReplica(from, to, wiptyp)
          for (const r of rows) out.push(toFluxRow(r))
        }
        return out
      },
      // La fenêtre RÉELLEMENT ingérée, relue par `getCoverage()`. Sans elle, une
      // plage demandée hors de ces bornes serait servie tronquée, sans erreur.
      JSON.stringify(window)
    )
  }

  async syncStock(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('stock_replica', source, async () => {
      const levels = await new X3StockRepository().getStockLevels()
      return levels.map((s): Row => ({
        article: s.article,
        physique: s.physique,
        controle_qual: s.controleQual,
        rebut: s.rebut,
        alloue_phys: s.allouePhys,
        alloue_global: s.alloueGlobal,
        pmp: s.pmp,
      }))
    })
  }

  /**
   * Lignes PORDERQ ouvertes (réceptions attendues) — swap complet, DANS
   * `syncAll()` (#98, suite lot 3). Un seul appel X3 non chunké, déjà servi live
   * toutes les 2 min sans incident connu (contrairement à `syncStockDetail()`
   * ci-dessous) — pas de raison de le tenir hors du tick 5 min comme
   * `syncStockFlux`/`syncOperations`/`syncStockDetail`.
   */
  async syncReceptions(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('receptions_replica', source, async () => {
      const rows = await new X3ReceptionRepository().getReceptionRows()
      return rows.map((r): Row => ({
        uuid: r.uuid,
        num_commande: r.numCommande,
        article: r.article,
        quantity: r.quantity,
        date: isoDay(r.date),
        supplier: r.supplier,
        designation: r.designation,
        date_commande: isoDay(r.dateCommande),
        qte_commandee: r.qteCommandee,
      }))
    })
  }

  /**
   * Événements de réception PORDERQ clôturés (latence fournisseur, #105) — swap
   * complet, PAS dans `syncAll()` : cadence propre déclarée dans `SCHEDULE`
   * (`replica_sync_provider`).
   *
   * La requête est pourtant bornée et peu chère (180 jours, ROWNUM ≤ 5000, ~1 s
   * sur CLTEST) — ce n'est pas le coût unitaire qui l'exclut du tick, c'est le
   * RAPPORT : douze passages par heure pour une moyenne glissante sur 180 jours,
   * dont le seul consommateur (`getSupplierLatency`) cache 2 h. Un jour de dérive
   * déplace la moyenne d'environ 1/5000 de l'échantillon. Payer 288 extractions
   * X3 par jour pour ça n'achète rien.
   *
   * La moyenne par article se calcule à la LECTURE, la table mire la source brute.
   */
  async syncLatency(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('latency_replica', source, async () => {
      const events = await new X3LatencyRepository().getLatencyEvents()
      // `isoDay` est nullable (il sert aussi à des dates X3 absentes) ; ici les
      // deux dates viennent d'événements déjà filtrés par `getLatencyEvents`,
      // qui écarte toute réception dont une date est illisible. Même `!` que
      // dans `orderLinesReplicaWindow()`.
      return events.map((e): Row => ({
        article: e.article,
        date_prevue: isoDay(e.prevu)!,
        date_reelle: isoDay(e.reel)!,
      }))
    })
  }

  /**
   * MFGOPE (pointages d'opérations), scopée aux OF déjà dans
   * `orders_flux_replica` — relus depuis la réplique elle-même (écrite plus tôt
   * dans le même `syncAll()`, donc à jour) plutôt que via un nouvel appel X3.
   *
   * Le périmètre venait d'`orders_replica` jusqu'à ce que `57941a8` la sorte de
   * `syncAll()` : la liste d'OF se figeait alors au dernier `--only=orders`
   * manuel, et se vidait avec elle si personne n'en lançait — `operations_replica`
   * aurait rétréci sans erreur, sur sa cadence de 10 min.
   *
   * PAS dans `syncAll()`/le tick 5 min : ~14 chunks séquentiels (limite IN à 1000,
   * cf. `X3OperationRepository`) sur la tranche utile complète. Cadence propre de
   * 10 min depuis le 31/07/2026, déclarée dans `SCHEDULE`
   * (`replica_sync_provider.ts`) — un tiers du seuil de 30 min du portail, pour
   * que deux runs manqués ne fassent pas basculer la table en voie directe.
   * Mesuré à 2,3 s constant sur 3 runs consécutifs (CLTEST).
   */
  async syncOperations(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('operations_replica', source, async () => {
      const numOfs = await this.replicatedOfNums()
      const ops = await new X3OperationRepository().getOperations(numOfs)
      return ops.map((o): Row => ({
        num_of: o.mfgnum,
        openum: o.openum,
        cplqty: o.cplqty,
        opesta: o.opesta,
        extqty: o.extqty,
      }))
    })
  }

  /**
   * Numéros d'OF présents dans la réplique — périmètre des tables qui se scopent
   * sur elle plutôt que sur un appel X3 (`operations_replica`, et le `--compare`
   * correspondant).
   *
   * Publique et unique : la comparaison DOIT interroger exactement la même
   * population que l'ingestion, sinon la voie directe voit des OF hors périmètre
   * répliqué et fait apparaître un écart qui n'en est pas un.
   */
  async replicatedOfNums(): Promise<string[]> {
    const rows = await this.conn
      .from('orders_flux_replica')
      .where('wiptyp', 5)
      .distinct('vcrnum')
      .select('vcrnum')
    return (rows as { vcrnum: string }[]).map((r) => r.vcrnum)
  }

  /**
   * STOCK au grain ligne (article × emplacement), filtré SM* / S*P / CLP — source de
   * `ConditionnementRepository.getStockSrmParArticle()`.
   *
   * PAS dans `syncAll()`/le tick 5 min : ~45k lignes en PROD, `ZSOAPSQL` O(n²),
   * CONNUE pour timeout côté X3 (cf. dégradation `Promise.allSettled` documentée
   * dans `ConditionnementRepository.getObservations()`).
   *
   * Ne pas en attendre le gain sur le préchauffage « estimateur conditionnement » :
   * mesuré à 20 ms depuis la réplique contre 19 697 ms pour `getStojouRangements()`
   * qui tourne en parallèle et reste directe. Cf. la note sur
   * `ConditionnementRepository.getStockSrmParArticle()`. Cadence propre de 2 h
   * depuis le 31/07/2026, déclarée dans `SCHEDULE` (`replica_sync_provider.ts`) —
   * un tiers du seuil de 6 h du portail. Mesuré à 1,9-2,0 s sur 3 runs consécutifs,
   * mais sur CLTEST où la table ne fait que 4 683 lignes : compter un ordre de
   * grandeur de plus en PROD, et resserrer la cadence si les timeouts reviennent.
   */
  async syncStockDetail(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('stock_detail_replica', source, async () => {
      const rows = await new ConditionnementRepository().getStockDetailRows()
      return rows.map((r): Row => ({
        uuid: r.uuid,
        article: r.article,
        loc: r.loc,
        qte: r.qte,
      }))
    })
  }

  /**
   * Flux STOJOU dédoublonné par document, fenêtre `defaultStockRange('mois', …)`
   * (12 mois glissants — #98, lot 3, scoping du 30/07/2026). PAS dans `syncAll()` :
   * ~122 appels SOAP chunkés (trois jours à la fois, cf. `StockFluxRepository`)
   * contre 1 à 3 pour les autres tables. Cadence QUOTIDIENNE depuis le 31/07/2026,
   * ancrée sur 03 h locale (`SCHEDULE`, `replica_sync_provider.ts`) : à ~3-4 min
   * par run, ça se place dans un creux, pas à un intervalle quelconque.
   */
  async syncStockFlux(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('stock_flux_replica', source, async () => {
      const { from, to } = defaultStockRange('mois', new Date())
      const rows = await new StockFluxRepository().getFluxNetByDocument(from, to)
      return rows.map((r): Row => ({
        article: r.article,
        jour: isoDay(r.jour) ?? '',
        vcrtyp: r.vcrtyp,
        vcrnum: r.vcrnum,
        net_doc: r.netDoc,
      }))
    })
  }

  /**
   * Fraîcheur de chaque table : le dernier run journalisé, avec son âge.
   *
   * C'est ce qui rend la péremption interrogeable. La situation actuelle en a une
   * aussi (TTL 2–5 min + grâce 12 h) mais aucune requête ne peut la lire.
   */
  async freshness(): Promise<ReplicaFreshness[]> {
    // `scope = 'full'` DANS LES DEUX clauses, y compris la sous-requête : sans le
    // filtre côté `MAX(id)`, une ré-ingestion partielle plus récente gagnerait
    // l'agrégat puis serait écartée par la jointure, et la table ressortirait
    // « jamais ingérée » alors qu'un run complet a bien eu lieu.
    const rows = await this.conn.rawQuery(
      `SELECT l.table_name, l.status, l.started_at, l.finished_at, l.rows, l.duration_ms
         FROM ingestion_log l
         JOIN (
           SELECT table_name, MAX(id) AS id
             FROM ingestion_log
            WHERE scope = 'full'
            GROUP BY table_name
         ) last ON last.id = l.id
        WHERE l.scope = 'full'
        ORDER BY l.table_name`
    )

    const now = Date.now()
    return (rows as any[]).map((r) => {
      const finished = r.finished_at ? Date.parse(r.finished_at) : null
      return {
        table: r.table_name,
        status: r.status as IngestionStatus,
        startedAt: r.started_at,
        finishedAt: r.finished_at ?? null,
        rows: r.rows ?? null,
        durationMs: r.duration_ms ?? null,
        ageMs: finished === null ? null : now - finished,
      }
    })
  }

  /**
   * Derniers runs COMPLETS d'une table : la dernière tentative quelle qu'en soit
   * l'issue, et le dernier succès. Deux horodatages parce qu'ils répondent à deux
   * questions d'une planification quotidienne (`replica_sync_provider.ts`) :
   *
   * - `lastSuccessAt` dit si le travail du jour est FAIT. C'est lui qui décide de
   *   déclencher, et il est lu en base plutôt que gardé en mémoire : un
   *   `setInterval` de 24 h remet son compte à zéro à chaque redémarrage, donc un
   *   déploiement quotidien avant l'heure de synchro l'empêcherait de partir, pour
   *   toujours et sans rien signaler.
   * - `lastAttemptAt` borne les REPRISES. Sans lui, une journée où X3 refuse
   *   relancerait ~3-4 min d'ingestion à chaque tick de 5 min, toute la journée.
   *
   * `MAX(finished_at)` est correct sur ces colonnes : `log()` n'y écrit que des
   * ISO 8601 UTC produits par `toISOString()` — largeur fixe, donc l'ordre
   * lexicographique est l'ordre chronologique.
   */
  async lastFullRuns(
    table: ReplicaTable
  ): Promise<{ lastAttemptAt: string | null; lastSuccessAt: string | null }> {
    const rows = await this.conn.rawQuery(
      `SELECT MAX(finished_at) AS last_attempt,
              MAX(CASE WHEN status = 'ok' THEN finished_at END) AS last_success
         FROM ingestion_log
        WHERE table_name = ? AND scope = 'full'`,
      [table]
    )
    const row = (rows as any[])[0] ?? {}
    return {
      lastAttemptAt: row.last_attempt ?? null,
      lastSuccessAt: row.last_success ?? null,
    }
  }

  /**
   * Ré-ingestions partielles récentes.
   *
   * `freshness()` ne retient que les runs complets — c'est la bonne règle pour
   * juger de la fraîcheur d'une table, mais ça rend les partiels invisibles. Les
   * exposer à part évite de conclure qu'ils n'ont pas eu lieu.
   */
  async recentPartialRuns(
    limit = 5
  ): Promise<{ table: string; startedAt: string; note: string | null }[]> {
    const rows = await this.conn
      .from('ingestion_log')
      .select('table_name', 'started_at', 'note')
      .where('scope', 'partial')
      .orderBy('id', 'desc')
      .limit(limit)

    return rows.map((r) => ({
      table: r.table_name,
      startedAt: r.started_at,
      note: r.note ?? null,
    }))
  }

  /**
   * Extraction hors transaction, swap dedans.
   *
   * L'extraction X3 dure des dizaines de secondes ; la tenir dans la transaction
   * retiendrait le verrou d'écriture SQLite tout ce temps pour rien. Le
   * `DELETE` + `INSERT` transactionnel, lui, prend une centaine de millisecondes :
   * les lecteurs voient l'ancienne version jusqu'au COMMIT, donc jamais de table
   * vide — c'est toute la raison d'être du swap transactionnel.
   *
   * `protected` et non `private` : c'est la seule méthode du service qui porte une
   * logique non triviale (swap, rollback, journalisation des échecs) et la seule
   * qu'un test peut exercer sans X3 en face. Le test la rejoue sur une table
   * jetable, cf. `tests/unit/replica_sync.test.ts`.
   */
  protected async ingest(
    table: string,
    source: string,
    fetch: () => Promise<Row[]>,
    /**
     * Note journalisée sur un run RÉUSSI. Sert aux tables dont la lecture porte
     * sur une plage arbitraire : elle y consigne la fenêtre réellement ingérée,
     * seule façon de répondre ensuite à « la réplique couvre-t-elle CE que
     * l'utilisateur demande ? » — question distincte de la fraîcheur, et que le
     * portail ne traite pas (cf. `OrdersFluxReplicaRepository.getCoverage`).
     */
    note?: string
  ): Promise<TableIngestionResult> {
    const start = Date.now()
    const startedAt = new Date().toISOString()

    try {
      const rows = await fetch()

      const trx = await this.conn.transaction()
      try {
        await trx.from(table).delete()
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await trx.table(table).insert(rows.slice(i, i + INSERT_CHUNK))
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const durationMs = Date.now() - start
      await this.log({
        table,
        status: 'ok',
        scope: 'full',
        startedAt,
        rows: rows.length,
        durationMs,
        source,
        note,
      })

      // Le run a démontré avoir vu tout ce qui était écrit avant son démarrage :
      // le marquage `dirty` de cette table n'a plus d'objet.
      //
      // Seul un run COMPLET peut lever le marquage. Une ré-ingestion partielle le
      // lève aussi, mais sous une condition plus étroite, cf. `reingestOrders`.
      await replicaGate.clearDirty([table as ReplicaTable])

      return { table, status: 'ok', rows: rows.length, durationMs }
    } catch (error) {
      const durationMs = Date.now() - start
      const message = (error as Error)?.message ?? String(error)
      await this.log({
        table,
        status: 'failed',
        scope: 'full',
        startedAt,
        durationMs,
        source,
        error: message,
      })
      return { table, status: 'failed', rows: 0, durationMs, error: message }
    }
  }

  /**
   * Ré-ingestion CIBLÉE de quelques OF, par numéro (#98, read-after-write).
   *
   * À appeler juste après une écriture X3 sur ces OF. Referme la fenêtre de voie
   * directe en ~1 s au lieu d'attendre le prochain run complet : un `IN (...)` sur
   * les numéros écrits, sans le lookback 90 j, donc quelques lignes ZSOAPSQL au
   * lieu de 11 000.
   *
   * ## Upsert et non swap
   *
   * Évident mais à dire : un `DELETE` complet viderait la table pour ne réécrire
   * que les OF nommés. Les lignes réécrites ici seront de toute façon remplacées
   * au prochain swap complet — c'est auto-réparateur, pas un conflit.
   *
   * ## Un OF disparu de la tranche est SUPPRIMÉ
   *
   * Si X3 ne rend plus l'OF (clos, supprimé, sorti du périmètre WIPTYP=5), sa ligne
   * est retirée de la réplique. Sans ça un OF clos y resterait vivant jusqu'au
   * prochain run complet — exactement le genre de fantôme que le board ne doit pas
   * afficher.
   *
   * ## Pourquoi ça peut lever le marquage `dirty`
   *
   * L'hypothèse est explicite : une écriture X3 ne modifie que les OF qu'elle
   * nomme. Sous cette hypothèse, relire ces OF suffit à remettre
   * `orders_flux_replica` en accord avec X3.
   *
   * L'hypothèse ne s'étend PAS aux autres tables : un affermissement consomme des
   * allocations, donc `stock_replica` reste suspecte jusqu'à un run complet. C'est
   * à l'appelant de marquer les tables qu'il salit ; celle-ci n'en lave qu'une.
   *
   * ## Cible : `orders_flux_replica`
   *
   * Elle visait `orders_replica` jusqu'à ce que `57941a8` la remplace. La table
   * visée n'était alors plus lue par personne, et `orders_flux_replica` — celle
   * qui sert `/suivi` et `/programme` — n'était ni marquée ni rafraîchie : après
   * un affermissement, le board servait l'ancien statut jusqu'au tick suivant,
   * sans le moindre signal.
   */
  async reingestOrders(numOfs: string[], source = 'writeback'): Promise<TableIngestionResult> {
    const table = 'orders_flux_replica'
    const start = Date.now()
    const startedAt = new Date().toISOString()
    const asked = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]

    if (asked.length === 0) {
      return { table, status: 'ok', rows: 0, durationMs: 0 }
    }

    try {
      const orders = await new CombinedOrdersRepository().fetchForReplicaByNums(asked)
      const found = new Set(orders.map((o) => o.vcrnum))
      const vanished = asked.filter((n) => !found.has(n))

      const trx = await this.conn.transaction()
      try {
        // Scopé à `wiptyp = 5` : la table porte aussi les commandes client et
        // fournisseur, et rien ne garantit qu'un numéro d'OF ne collisionne
        // jamais avec l'une d'elles. Effacer large ici retirerait des lignes que
        // la relecture, elle, ne réécrit pas.
        await trx.from(table).where('wiptyp', 5).whereIn('vcrnum', asked).delete()
        const rows = orders.map(toFluxRow)
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await trx.table(table).insert(rows.slice(i, i + INSERT_CHUNK))
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const durationMs = Date.now() - start
      await this.log({
        table,
        status: 'ok',
        scope: 'partial',
        startedAt,
        rows: orders.length,
        durationMs,
        source,
        // Sans ça une ligne `partial` est illisible : 3 lignes sur 11 000, mais
        // lesquelles ? Les OF demandés d'un côté, les LIGNES relues de l'autre :
        // un OF peut en porter plusieurs, les deux comptes ne se recoupent pas.
        note: `${asked.length} demandés, ${found.size} trouvés (${orders.length} lignes)${
          vanished.length ? `, ${vanished.length} disparus : ${vanished.join(', ')}` : ''
        }`,
      })

      await replicaGate.clearDirty([table])

      return { table, status: 'ok', rows: orders.length, durationMs }
    } catch (error) {
      const durationMs = Date.now() - start
      const message = (error as Error)?.message ?? String(error)
      await this.log({
        table,
        status: 'failed',
        scope: 'partial',
        startedAt,
        durationMs,
        source,
        error: message,
      })
      // Pas de `clearDirty` : l'échec laisse la table suspecte, donc les lectures
      // restent sur la voie directe. C'est le comportement voulu.
      return { table, status: 'failed', rows: 0, durationMs, error: message }
    }
  }

  /**
   * Le journal s'écrit HORS de la transaction de swap : un rollback ne doit pas
   * emporter la trace de l'échec avec lui. C'est précisément quand le swap échoue
   * que la ligne de journal a de la valeur.
   */
  private async log(entry: {
    table: string
    status: IngestionStatus
    scope: 'full' | 'partial'
    startedAt: string
    rows?: number
    durationMs: number
    source: string
    error?: string | null
    note?: string
  }): Promise<void> {
    await this.conn.table('ingestion_log').insert({
      table_name: entry.table,
      status: entry.status,
      scope: entry.scope,
      started_at: entry.startedAt,
      finished_at: new Date().toISOString(),
      rows: entry.rows ?? null,
      duration_ms: entry.durationMs,
      source: entry.source,
      error: entry.error ?? null,
      note: entry.note ?? null,
      // PROVENANCE de la donnée, pas une décoration : `ReplicaGate` s'en sert
      // pour refuser de servir du CLTEST à une session prod. Cf. la migration
      // `add_x3_env_to_ingestion_log`.
      x3_env: getActiveX3EnvName(),
    })
  }
}

const replicaSyncService = new ReplicaSyncService()
export default replicaSyncService
