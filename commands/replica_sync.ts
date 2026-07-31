import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import replicaSyncService from '#services/replica_sync_service'
import replicaGate from '#services/replica_gate'
import ordersReplicaRepository from '#repositories/orders_replica_repository'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import orderLinesReplicaRepository from '#repositories/order_lines_replica_repository'
import { X3OrderLineRepository, type OrderLineRow } from '#repositories/order_line_repository'
import stockReplicaRepository from '#repositories/stock_replica_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import stockFluxReplicaRepository from '#repositories/stock_flux_replica_repository'
import { StockFluxRepository } from '#repositories/stock_flux_repository'
import { defaultStockRange } from '#repositories/stock_valuation_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import {
  CombinedOrdersRepository,
  splitOrdersFlows,
  LIVE_MAP_OPTS,
} from '#repositories/combined_orders_repository'
import ordersFluxReplicaRepository from '#repositories/orders_flux_replica_repository'
import operationsReplicaRepository from '#repositories/operations_replica_repository'
import { X3OperationRepository, type OperationRecord } from '#repositories/operation_repository'
import stockDetailReplicaRepository from '#repositories/stock_detail_replica_repository'
import { ConditionnementRepository } from '#repositories/conditionnement_repository'
import db from '@adonisjs/lucid/services/db'
import type { Flow } from '#app/domain/models/flow'

/**
 * `node ace replica:sync` — ingestion X3 → réplique SQLite locale (#98, lot 1).
 *
 * Commande manuelle, PAS de planification automatique à ce lot. L'app ne lit pas
 * encore la réplique : la déclencher n'a donc aucun effet sur les écrans, et un
 * worker qui tournerait tout seul contre X3 prod sans lecteur en face serait de la
 * charge SOAP gratuite. La planification vient avec la bascule des lectures
 * (lot 2), quand la fraîcheur commence à compter pour quelqu'un.
 *
 * `--status` n'interroge que le journal — aucun appel X3.
 *
 * `--compare` (#98) : appelle X3 ET lit la réplique pour chaque table (orders,
 * order-lines, stock, stock-flux, receptions, operations, stock-detail), diffe les
 * deux jeux, n'écrit rien. C'est la « comparaison en parallèle » du lot 2 —
 * volontairement hors du chemin de lecture chaud (`board_dataset.ts` ne fait jamais
 * les deux appels), pour ne pas repayer le coût X3 qu'on cherche à éliminer sur
 * chaque requête utilisateur.
 *
 * Couvre aussi le delta matching (#99, `getOrdersForMatchingDelta`) sur une fenêtre
 * `--from`/`--to` (défaut J → J+14) : c'est le filet qui manquait avant d'envisager
 * `REPLICA_READS=true` en réel — sans lui une divergence entre
 * `X3OfRepository.getManufacturingOrdersForMatching()` et son miroir réplique
 * passerait inaperçue jusqu'à l'usage, comme la régression du 30/07/2026 sur
 * `getOrdersForWindow()`.
 */
export default class ReplicaSync extends BaseCommand {
  static commandName = 'replica:sync'
  static description =
    'Ingère ORDERS / lignes de commande / STOCK / réceptions / MFGOPE / STOCK détail depuis X3 vers la réplique SQLite'

  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: "Affiche l'âge de chaque table sans rien ingérer" })
  declare status: boolean

  @flags.boolean({
    description: 'Compare réplique vs voie directe X3 sur orders_replica, sans rien ingérer',
  })
  declare compare: boolean

  @flags.array({
    description:
      'Tables à ingérer (orders, order-lines, stock, receptions, stock-flux, operations, stock-detail). ' +
      'Défaut : orders/order-lines/stock/receptions SEULEMENT — stock-flux/operations/stock-detail ' +
      'demandent un --only explicite (charge X3 non arbitrée, cf. syncStockFlux/syncOperations/syncStockDetail)',
  })
  declare only: string[]

  @flags.string({
    description: 'Borne basse (YYYY-MM-DD) du delta matching comparé par --compare. Défaut : J',
  })
  declare from: string

  @flags.string({
    description: 'Borne haute (YYYY-MM-DD) du delta matching comparé par --compare. Défaut : J+14',
  })
  declare to: string

  async run() {
    if (this.status) {
      await this.printStatus()
    } else if (this.compare) {
      await this.printCompare()
    } else {
      await this.runSync()
    }

    // `X3Database` (derrière X3OfRepository/X3StockRepository/…) ouvre un pool knex
    // jamais fermé — son timer d'éviction interne (tarn) garde le process vivant
    // indéfiniment après la fin du travail. Sans effet sur le serveur web (qui ne
    // termine jamais de toute façon) mais fatal pour une commande one-shot : sans
    // cette sortie explicite, `replica:sync`/`--status`/`--compare` finissent leur
    // rapport puis ne rendent jamais la main au shell.
    process.exit(this.exitCode ?? 0)
  }

  private async runSync() {
    const only = new Set(this.only ?? [])
    const all = only.size === 0

    const results = []
    if (all || only.has('orders')) results.push(await replicaSyncService.syncOrders('cli'))
    // Hors `syncAll()` comme stock-flux/operations/stock-detail : variante grasse
    // (contremarque + réfs client), coût sur un tick de 5 min non encore mesuré.
    if (only.has('orders-flux')) results.push(await replicaSyncService.syncOrdersFlux('cli'))
    if (all || only.has('order-lines')) results.push(await replicaSyncService.syncOrderLines('cli'))
    if (all || only.has('stock')) results.push(await replicaSyncService.syncStock('cli'))
    if (all || only.has('receptions')) results.push(await replicaSyncService.syncReceptions('cli'))
    // JAMAIS via `all` : ~50 appels SOAP chunkés, cf. syncStockFlux(). Nommer
    // explicitement `--only=stock-flux`.
    if (only.has('stock-flux')) results.push(await replicaSyncService.syncStockFlux('cli'))
    // JAMAIS via `all` non plus : ~14 chunks séquentiels sur toute la tranche
    // utile, jamais mesurés en charge répétée (cf. syncOperations).
    if (only.has('operations')) results.push(await replicaSyncService.syncOperations('cli'))
    // JAMAIS via `all` : ~45k lignes connues pour timeout côté X3 (cf. syncStockDetail).
    if (only.has('stock-detail')) results.push(await replicaSyncService.syncStockDetail('cli'))

    if (results.length === 0) {
      this.logger.error(`Aucune table reconnue dans --only=${[...only].join(',')}`)
      this.exitCode = 1
      return
    }

    for (const r of results) {
      const seconds = (r.durationMs / 1000).toFixed(1)
      if (r.status === 'ok') {
        this.logger.success(`${r.table} : ${r.rows} lignes en ${seconds} s`)
      } else {
        this.logger.error(`${r.table} : ÉCHEC après ${seconds} s — ${r.error}`)
      }
    }

    // Sortie non nulle si une seule table a échoué : la commande est destinée à
    // être appelée par un ordonnanceur au lot 2, qui doit pouvoir le détecter.
    if (results.some((r) => r.status === 'failed')) this.exitCode = 1
  }

  /**
   * Fraîcheur ET verdict du portail. Les deux sont nécessaires pour comprendre ce
   * que voit l'app : une table peut être fraîche de 30 secondes et servie en voie
   * directe quand même (écriture X3 depuis, ou `REPLICA_READS` fermé). L'âge seul
   * répondrait à côté de la question.
   */
  private async printStatus() {
    const [freshness, verdicts] = await Promise.all([
      replicaSyncService.freshness(),
      replicaGate.verdicts(),
    ])

    const byTable = new Map(freshness.map((f) => [f.table, f]))

    for (const v of verdicts) {
      const f = byTable.get(v.table)
      const age = !f || f.ageMs === null ? 'jamais ingérée' : `${Math.round(f.ageMs / 60000)} min`
      const rows = !f || f.rows === null ? '—' : `${f.rows} lignes`
      const why = v.reason ? ` (${v.reason})` : ''
      const line = `${v.table} : lecture ${v.source}${why} · ${rows} · âge ${age}`

      if (v.source === 'replica') this.logger.info(line)
      else this.logger.warning(line)
    }

    // Les runs partiels n'apparaissent pas ci-dessus (freshness ne retient que le
    // complet). Les lister à part évite de croire qu'ils n'ont pas eu lieu.
    const partials = await replicaSyncService.recentPartialRuns()
    for (const p of partials) {
      this.logger.info(`  ↳ partiel ${p.table} : ${p.note ?? '—'} (${p.startedAt})`)
    }
  }

  /**
   * Diff X3 (voie directe) vs `orders_replica`, sur les champs qui comptent pour le
   * board (statut, quantités, date de fin). X3 est la référence.
   *
   * Deux populations, deux méthodes — l'issue #98 posait la question en suspens
   * (« à vérifier : que le VCRNUM_0 d'une suggestion soit bien instable entre deux
   * CBN ») et une première mesure en a apporté la réponse : oui, instable. Sur
   * ~14 000 OF, ~12 200 sont des suggestions (WIPSTA=3) — sortie du CBN, régénérées
   * à chaque run AVEC UN NOUVEAU NUMÉRO. Comparer `orders_replica` (ingérée à T) à
   * X3 en direct (lu à T+Δ) par `numOf` fait donc apparaître un roulement quasi
   * total sur ce sous-ensemble — pas un défaut de la réplique, juste la mauvaise
   * clé de comparaison pour une donnée sans identité stable.
   *
   * - Fermes (WIPSTA=1) et planifiés (WIPSTA=2) : identité stable → diff exact par
   *   `numOf`, écarts attendus proches de zéro.
   * - Suggérés (WIPSTA=3) : diff par agrégat `article → {count, quantité}`, seule
   *   comparaison qui ait un sens sur une donnée régénérée entre les deux lectures.
   */
  private async printCompare() {
    this.logger.info('=== orders_replica ===')
    const ordersOk = await this.compareOrders()

    this.logger.info('=== order_lines_replica ===')
    const linesOk = await this.compareOrderLines()

    this.logger.info('=== stock_replica ===')
    const stockOk = await this.compareStock()

    const { from, to } = this.resolveMatchingWindow()
    this.logger.info(`=== delta matching (#99, ${dayKey(from)} → ${dayKey(to)}) ===`)
    const deltaOk = await this.compareMatchingDelta(from, to)

    this.logger.info('=== stock_flux_replica (#98, lot 3) ===')
    const fluxOk = await this.compareStockFlux()

    this.logger.info('=== receptions_replica ===')
    const receptionsOk = await this.compareReceptions()

    this.logger.info('=== operations_replica ===')
    const operationsOk = await this.compareOperations()

    this.logger.info('=== stock_detail_replica ===')
    const stockDetailOk = await this.compareStockDetail()

    this.logger.info(`=== orders_flux_replica (#105, ${dayKey(from)} → ${dayKey(to)}) ===`)
    const ordersFluxOk = await this.compareOrdersFlux(from, to)

    if (
      ordersOk &&
      linesOk &&
      stockOk &&
      deltaOk &&
      fluxOk &&
      receptionsOk &&
      operationsOk &&
      stockDetailOk &&
      ordersFluxOk
    ) {
      this.logger.success('Réplique et voie directe cohérentes sur toutes les tables')
    } else {
      this.exitCode = 1
    }
  }

  /** `--from`/`--to`, défaut J → J+14 (horizon planning typique de /programme). */
  private resolveMatchingWindow(): { from: Date; to: Date } {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const from = this.from ? new Date(`${this.from}T00:00:00`) : today
    const to = this.to
      ? new Date(`${this.to}T00:00:00`)
      : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000)
    return { from, to }
  }

  /**
   * Diff `fetchLive()` X3 direct vs `orders_flux_replica` — les trois familles
   * de flux qui alimentent `/suivi` (#105).
   *
   * Comparaison sur le résultat FINAL (`Flow[]`), pas sur les lignes de table :
   * c'est ce que consomment les écrans, et les deux voies partagent
   * `splitOrdersFlows()`, donc un écart ici ne peut venir que de la population
   * ou des colonnes ingérées — exactement ce qu'on veut mesurer.
   *
   * Même précaution que `compareOrders()` sur l'identité : les OF SUGGÉRÉS
   * (WIPSTA=3) sont régénérés par chaque run CBN avec un nouveau numéro, donc
   * ~12 000 des 13 500 lignes WIPTYP=5 n'ont pas d'identité stable entre deux
   * lectures. Les diffuser par `id` produirait un roulement quasi total qui ne
   * dit rien de la réplique. On les compare donc en AGRÉGAT par article, comme
   * `compareSuggested()`.
   *
   * Demande (WIPTYP=1) et réceptions (WIPTYP=2) ont, elles, une identité stable
   * (numéro de commande + ligne) : diff exact.
   */
  private async compareOrdersFlux(from: Date, to: Date): Promise<boolean> {
    const fromIso = dayKey(from)!
    const toIso = dayKey(to)!
    const started = Date.now()
    const [direct, replicaRows] = await Promise.all([
      new CombinedOrdersRepository().fetchLive(fromIso, toIso),
      ordersFluxReplicaRepository.getLiveRows(fromIso, toIso),
    ])
    const replica = splitOrdersFlows(replicaRows, LIVE_MAP_OPTS)
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)

    this.logger.info(
      `X3 : ${direct.demandFlows.length} demande / ${direct.receptionFlows.length} réception / ${direct.ofFlows.length} OF` +
        ` · réplique : ${replica.demandFlows.length} / ${replica.receptionFlows.length} / ${replica.ofFlows.length}` +
        ` · ${elapsed} s`
    )

    // Identité d'un flux de demande/réception : le couple (numéro, ligne) rendu
    // par le mapper. Suffisant ici — deux échéances d'une même ligne (VCRSEQ)
    // portent des dates différentes, incluses dans la signature.
    const sig = (f: Flow) =>
      `${f.origin.type}|${'id' in f.origin ? f.origin.id : ''}|${
        'ligne' in f.origin ? (f.origin.ligne ?? '') : ''
      }|${dayKey(f.date) ?? ''}|${f.quantity}`

    const exact = (label: string, a: Flow[], b: Flow[]): boolean => {
      const sa = new Set(a.map(sig))
      const sb = new Set(b.map(sig))
      const onlyA = [...sa].filter((s) => !sb.has(s))
      const onlyB = [...sb].filter((s) => !sa.has(s))
      if (onlyA.length === 0 && onlyB.length === 0) {
        this.logger.info(`  ${label} : identiques (${a.length})`)
        return true
      }
      this.logger.warning(
        `  ${label} : ${onlyA.length} en X3 seulement, ${onlyB.length} en réplique seulement`
      )
      for (const s of [...onlyA.slice(0, 3), ...onlyB.slice(0, 3)]) this.logger.warning(`    ${s}`)
      return false
    }

    const demandOk = exact('demande (WIPTYP=1)', direct.demandFlows, replica.demandFlows)
    const recepOk = exact('réception (WIPTYP=2)', direct.receptionFlows, replica.receptionFlows)

    // OF : fermes/planifiés en exact, suggérés en agrégat par article.
    const isStable = (f: Flow) =>
      f.origin.type === 'of' && (f.origin.status === 1 || f.origin.status === 2)
    const ofStableOk = exact(
      'OF fermes/planifiés',
      direct.ofFlows.filter(isStable),
      replica.ofFlows.filter(isStable)
    )

    const agg = (flows: Flow[]) => {
      const m = new Map<string, { n: number; q: number }>()
      for (const f of flows) {
        const cur = m.get(f.article) ?? { n: 0, q: 0 }
        m.set(f.article, { n: cur.n + 1, q: cur.q + f.quantity })
      }
      return m
    }
    const da = agg(direct.ofFlows.filter((f) => !isStable(f)))
    const ra = agg(replica.ofFlows.filter((f) => !isStable(f)))
    const articles = new Set([...da.keys(), ...ra.keys()])
    const drifted: string[] = []
    for (const a of articles) {
      const d = da.get(a) ?? { n: 0, q: 0 }
      const r = ra.get(a) ?? { n: 0, q: 0 }
      if (d.n !== r.n || Math.abs(d.q - r.q) > 0.01) {
        drifted.push(`${a} : X3 ${d.n}×${d.q} ≠ réplique ${r.n}×${r.q}`)
      }
    }
    if (drifted.length === 0) {
      this.logger.info(`  OF suggérés : agrégats identiques sur ${articles.size} articles`)
    } else {
      this.logger.warning(`  OF suggérés : ${drifted.length}/${articles.size} articles divergents`)
      for (const d of drifted.slice(0, 5)) this.logger.warning(`    ${d}`)
    }

    return demandOk && recepOk && ofStableOk && drifted.length === 0
  }

  private async compareOrders(): Promise<boolean> {
    const started = Date.now()
    const [direct, replica] = await Promise.all([
      new X3OfRepository().getManufacturingOrders(),
      ordersReplicaRepository.getManufacturingOrders(),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(`X3 : ${direct.length} OF · réplique : ${replica.length} OF · ${elapsed} s`)

    const isStable = (o: ManufacturingOrder) => o.status === 1 || o.status === 2
    const stableOk = this.compareStable(direct.filter(isStable), replica.filter(isStable))
    const suggOk = this.compareSuggested(
      direct.filter((o) => o.status === 3),
      replica.filter((o) => o.status === 3)
    )
    return stableOk && suggOk
  }

  /** Fermes + planifiés : identité stable, diff exact par numOf. */
  private compareStable(direct: ManufacturingOrder[], replica: ManufacturingOrder[]): boolean {
    this.logger.info(`Fermes/planifiés — X3 : ${direct.length} · réplique : ${replica.length}`)

    const byNum = new Map(direct.map((o) => [o.numOf, o]))
    const replicaNums = new Set(replica.map((o) => o.numOf))
    const onlyDirect = direct.filter((o) => !replicaNums.has(o.numOf))
    const onlyReplica = replica.filter((o) => !byNum.has(o.numOf))

    const fieldDiffs: string[] = []
    for (const r of replica) {
      const d = byNum.get(r.numOf)
      if (!d) continue
      const mismatches: string[] = []
      if (d.status !== r.status) mismatches.push(`status ${d.status}≠${r.status}`)
      if (d.quantity !== r.quantity) mismatches.push(`quantity ${d.quantity}≠${r.quantity}`)
      if (d.quantityLaunched !== r.quantityLaunched) mismatches.push('quantityLaunched')
      if (d.quantityDone !== r.quantityDone) mismatches.push('quantityDone')
      if (dayKey(d.endDate) !== dayKey(r.endDate)) mismatches.push('endDate')
      if (mismatches.length > 0) fieldDiffs.push(`${r.numOf} : ${mismatches.join(', ')}`)
    }

    if (onlyDirect.length > 0) {
      this.logger.warning(
        `  ${onlyDirect.length} OF présents en X3 seulement (ex. ${onlyDirect
          .slice(0, 5)
          .map((o) => o.numOf)
          .join(', ')})`
      )
    }
    if (onlyReplica.length > 0) {
      this.logger.warning(
        `  ${onlyReplica.length} OF présents en réplique seulement (ex. ${onlyReplica
          .slice(0, 5)
          .map((o) => o.numOf)
          .join(', ')})`
      )
    }
    if (fieldDiffs.length > 0) {
      this.logger.warning(`  ${fieldDiffs.length} OF avec un champ divergent :`)
      for (const line of fieldDiffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    }
    const ok = onlyDirect.length === 0 && onlyReplica.length === 0 && fieldDiffs.length === 0
    if (ok) this.logger.success('  fermes/planifiés identiques')
    return ok
  }

  /** Suggestions : numOf instable entre deux CBN, diff par agrégat article. */
  private compareSuggested(direct: ManufacturingOrder[], replica: ManufacturingOrder[]): boolean {
    this.logger.info(`Suggestions — X3 : ${direct.length} · réplique : ${replica.length}`)

    const aggregate = (list: ManufacturingOrder[]) => {
      const m = new Map<string, { count: number; qty: number }>()
      for (const o of list) {
        const cur = m.get(o.article) ?? { count: 0, qty: 0 }
        cur.count += 1
        cur.qty += o.quantity
        m.set(o.article, cur)
      }
      return m
    }

    const directAgg = aggregate(direct)
    const replicaAgg = aggregate(replica)
    const articles = new Set([...directAgg.keys(), ...replicaAgg.keys()])

    const diffs: string[] = []
    for (const article of articles) {
      const d = directAgg.get(article) ?? { count: 0, qty: 0 }
      const r = replicaAgg.get(article) ?? { count: 0, qty: 0 }
      if (d.count !== r.count || Math.abs(d.qty - r.qty) > 0.01) {
        diffs.push(`${article} : count ${d.count}≠${r.count}, qty ${d.qty}≠${r.qty}`)
      }
    }

    if (diffs.length > 0) {
      this.logger.warning(`  ${diffs.length} articles avec un agrégat de suggestions divergent :`)
      for (const line of diffs.slice(0, 10)) this.logger.warning(`    ${line}`)
      this.logger.info(
        '  Un écart isolé peut venir du CBN qui a tourné entre le sync et la comparaison — relancer replica:sync juste avant --compare pour réduire la fenêtre.'
      )
    } else {
      this.logger.success('  suggestions identiques par article (count + quantité)')
    }
    return diffs.length === 0
  }

  /**
   * Delta matching (#99) : même population que `orders_replica` (WIPTYP=5, WIPSTA
   * 1/2/3) donc même instabilité d'identité sur les suggestions — réutilise
   * `compareStable`/`compareSuggested`. Scopé à une fenêtre (contrairement aux OF
   * qui portent tout le lookback) : le delta dépend aussi de `order_lines_replica`
   * pour son sous-filtre WIPTYP=1, donc une divergence ici peut venir de l'une ou
   * l'autre table.
   */
  private async compareMatchingDelta(from: Date, to: Date): Promise<boolean> {
    const started = Date.now()
    const [direct, replica] = await Promise.all([
      new X3OfRepository().getManufacturingOrdersForMatching(from, to),
      ordersReplicaRepository.getManufacturingOrdersForMatching(from, to),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(`X3 : ${direct.length} OF · réplique : ${replica.length} OF · ${elapsed} s`)

    const isStable = (o: ManufacturingOrder) => o.status === 1 || o.status === 2
    const stableOk = this.compareStable(direct.filter(isStable), replica.filter(isStable))
    const suggOk = this.compareSuggested(
      direct.filter((o) => o.status === 3),
      replica.filter((o) => o.status === 3)
    )
    return stableOk && suggOk
  }

  /**
   * `stock_flux_replica` n'est PAS dans le sync par défaut (`--only=stock-flux`
   * requis, cf. `syncStockFlux`) — une table vide ici veut dire « pas encore
   * ingérée », pas « divergente ». Skip informatif plutôt qu'échec.
   *
   * Diff par agrégat ARTICLE (somme `net_doc`) et non par ligne exacte : les
   * derniers jours de la fenêtre peuvent encore recevoir des écritures X3 entre
   * l'ingestion et cette comparaison (STOJOU n'est pas figé comme un snapshot
   * CBN) — l'agrégat absorbe ce bruit de bord tout en vérifiant exactement ce
   * que le KPI consomme (`SUM(net_doc)` par article et par période).
   */
  private async compareStockFlux(): Promise<boolean> {
    const { from, to } = defaultStockRange('mois', new Date())
    const replica = await stockFluxReplicaRepository.getFluxNetByDocument(from, to)
    if (replica.length === 0) {
      this.logger.info(
        '  stock_flux_replica vide — pas encore ingérée (node ace replica:sync --only=stock-flux). Skip.'
      )
      return true
    }

    const started = Date.now()
    const direct = await new StockFluxRepository().getFluxNetByDocument(from, to)
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} lignes document · réplique : ${replica.length} lignes document · ${elapsed} s`
    )

    const aggregate = (rows: { article: string; netDoc: number }[]) => {
      const m = new Map<string, number>()
      for (const r of rows) m.set(r.article, (m.get(r.article) ?? 0) + r.netDoc)
      return m
    }
    const directAgg = aggregate(direct)
    const replicaAgg = aggregate(replica)
    const articles = new Set([...directAgg.keys(), ...replicaAgg.keys()])

    const diffs: string[] = []
    for (const article of articles) {
      const d = directAgg.get(article) ?? 0
      const r = replicaAgg.get(article) ?? 0
      if (Math.abs(d - r) > 0.01) diffs.push(`${article} : ${d}≠${r}`)
    }

    if (diffs.length > 0) {
      this.logger.warning(`  ${diffs.length} articles avec un net_doc cumulé divergent :`)
      for (const line of diffs.slice(0, 10)) this.logger.warning(`    ${line}`)
      this.logger.info(
        '  Un écart isolé peut venir de STOJOU écrit entre le sync et cette comparaison — relancer --only=stock-flux juste avant --compare pour réduire la fenêtre.'
      )
    } else {
      this.logger.success('  net_doc cumulé identique par article')
    }
    return diffs.length === 0
  }

  /**
   * Lignes de commande — identité STABLE (`numCommande#ligne`, pas de régénération
   * CBN contrairement aux suggestions d'OF), diff exact comme les OF fermes/planifiés.
   */
  private async compareOrderLines(): Promise<boolean> {
    const started = Date.now()
    const [direct, replica] = await Promise.all([
      new X3OrderLineRepository().getOpenOrderLines(),
      orderLinesReplicaRepository.getOpenOrderLines(),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} lignes · réplique : ${replica.length} lignes · ${elapsed} s`
    )

    const key = (l: OrderLineRow) => `${l.numCommande}#${l.ligne}`
    const byKey = new Map(direct.map((l) => [key(l), l]))
    const replicaKeys = new Set(replica.map(key))
    const onlyDirect = direct.filter((l) => !replicaKeys.has(key(l)))
    const onlyReplica = replica.filter((l) => !byKey.has(key(l)))

    const fieldDiffs: string[] = []
    for (const r of replica) {
      const d = byKey.get(key(r))
      if (!d) continue
      const mismatches: string[] = []
      if (d.quantite !== r.quantite) mismatches.push(`quantite ${d.quantite}≠${r.quantite}`)
      if (dayKey(d.dateLivraison) !== dayKey(r.dateLivraison)) mismatches.push('dateLivraison')
      if (d.nature !== r.nature) mismatches.push(`nature ${d.nature}≠${r.nature}`)
      if (d.contremarque !== r.contremarque) mismatches.push('contremarque')
      if (mismatches.length > 0) fieldDiffs.push(`${key(r)} : ${mismatches.join(', ')}`)
    }

    if (onlyDirect.length > 0) {
      this.logger.warning(
        `  ${onlyDirect.length} lignes présentes en X3 seulement (ex. ${onlyDirect
          .slice(0, 5)
          .map(key)
          .join(', ')})`
      )
    }
    if (onlyReplica.length > 0) {
      this.logger.warning(
        `  ${onlyReplica.length} lignes présentes en réplique seulement (ex. ${onlyReplica
          .slice(0, 5)
          .map(key)
          .join(', ')})`
      )
    }
    if (fieldDiffs.length > 0) {
      this.logger.warning(`  ${fieldDiffs.length} lignes avec un champ divergent :`)
      for (const line of fieldDiffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    }
    const ok = onlyDirect.length === 0 && onlyReplica.length === 0 && fieldDiffs.length === 0
    if (ok) this.logger.success('  lignes de commande identiques')
    return ok
  }

  /**
   * Stock — pas d'identité de ligne (`Flow[]` sans id), diff par agrégat
   * `article#subType → quantité`. Sans filtre d'articles des deux côtés (comme
   * l'ingestion) : coûteux côté X3 (« sans articles → toute la base, lourd », cf.
   * `X3StockRepository.getStockFlows`), assumé pour une commande de validation
   * manuelle, jamais sur le chemin de lecture chaud.
   */
  private async compareStock(): Promise<boolean> {
    const started = Date.now()
    const [direct, replica] = await Promise.all([
      new X3StockRepository().getStockFlows(),
      stockReplicaRepository.getStockFlows(),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} flux · réplique : ${replica.length} flux · ${elapsed} s`
    )

    const aggregate = (flows: Flow[]) => {
      const m = new Map<string, number>()
      for (const f of flows) {
        const subType = f.origin.type === 'stock' ? (f.origin.subType ?? '?') : '?'
        const k = `${f.article}#${subType}`
        m.set(k, (m.get(k) ?? 0) + f.quantity)
      }
      return m
    }

    const directAgg = aggregate(direct)
    const replicaAgg = aggregate(replica)
    const keys = new Set([...directAgg.keys(), ...replicaAgg.keys()])

    const diffs: string[] = []
    for (const k of keys) {
      const d = directAgg.get(k) ?? 0
      const r = replicaAgg.get(k) ?? 0
      if (Math.abs(d - r) > 0.01) diffs.push(`${k} : ${d}≠${r}`)
    }

    if (diffs.length > 0) {
      this.logger.warning(`  ${diffs.length} article#sous-type avec une quantité divergente :`)
      for (const line of diffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    } else {
      this.logger.success('  stock identique par article et sous-type')
    }
    return diffs.length === 0
  }
  /**
   * Réceptions — identité STABLE (`AUUID_0`, cf. migration `receptions_replica`),
   * diff exact comme les lignes de commande.
   */
  private async compareReceptions(): Promise<boolean> {
    const started = Date.now()
    const [direct, replicaFlows] = await Promise.all([
      new X3ReceptionRepository().getReceptionRows(),
      db.connection('replica').from('receptions_replica').select('*'),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} lignes · réplique : ${replicaFlows.length} lignes · ${elapsed} s`
    )

    const byUuid = new Map(direct.map((r) => [r.uuid, r]))
    const replicaUuids = new Set(replicaFlows.map((r) => r.uuid as string))
    const onlyDirect = direct.filter((r) => !replicaUuids.has(r.uuid))
    const onlyReplica = replicaFlows.filter((r) => !byUuid.has(r.uuid as string))

    const fieldDiffs: string[] = []
    for (const r of replicaFlows as { uuid: string; quantity: number; article: string }[]) {
      const d = byUuid.get(r.uuid)
      if (!d) continue
      const mismatches: string[] = []
      if (Math.abs(d.quantity - r.quantity) > 0.01)
        mismatches.push(`quantity ${d.quantity}≠${r.quantity}`)
      if (d.article !== r.article) mismatches.push(`article ${d.article}≠${r.article}`)
      if (mismatches.length > 0) fieldDiffs.push(`${r.uuid} : ${mismatches.join(', ')}`)
    }

    if (onlyDirect.length > 0) {
      this.logger.warning(`  ${onlyDirect.length} lignes présentes en X3 seulement`)
    }
    if (onlyReplica.length > 0) {
      this.logger.warning(`  ${onlyReplica.length} lignes présentes en réplique seulement`)
    }
    if (fieldDiffs.length > 0) {
      this.logger.warning(`  ${fieldDiffs.length} lignes avec un champ divergent :`)
      for (const line of fieldDiffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    }
    const ok = onlyDirect.length === 0 && onlyReplica.length === 0 && fieldDiffs.length === 0
    if (ok) this.logger.success('  réceptions identiques')
    return ok
  }

  /**
   * MFGOPE — scopée aux `num_of` déjà dans `orders_replica` des deux côtés (même
   * périmètre que `syncOperations`), sinon la voie directe verrait des OF hors du
   * périmètre répliqué et ferait apparaître un écart qui n'en est pas un.
   */
  private async compareOperations(): Promise<boolean> {
    const numOfRows = await db.connection('replica').from('orders_replica').select('num_of')
    const numOfs = (numOfRows as { num_of: string }[]).map((r) => r.num_of)
    if (numOfs.length === 0) {
      this.logger.info('  orders_replica vide — rien à comparer. Skip.')
      return true
    }

    const started = Date.now()
    const [direct, replica] = await Promise.all([
      new X3OperationRepository().getOperations(numOfs),
      operationsReplicaRepository.getOperations(numOfs),
    ])
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} opérations · réplique : ${replica.length} opérations · ${elapsed} s`
    )

    const key = (o: OperationRecord) => `${o.mfgnum}#${o.openum}`
    const byKey = new Map(direct.map((o) => [key(o), o]))
    const replicaKeys = new Set(replica.map(key))
    const onlyDirect = direct.filter((o) => !replicaKeys.has(key(o)))
    const onlyReplica = replica.filter((o) => !byKey.has(key(o)))

    const fieldDiffs: string[] = []
    for (const r of replica) {
      const d = byKey.get(key(r))
      if (!d) continue
      const mismatches: string[] = []
      if (Math.abs(d.cplqty - r.cplqty) > 0.01) mismatches.push('cplqty')
      if (d.opesta !== r.opesta) mismatches.push('opesta')
      if (mismatches.length > 0) fieldDiffs.push(`${key(r)} : ${mismatches.join(', ')}`)
    }

    if (onlyDirect.length > 0) {
      this.logger.warning(`  ${onlyDirect.length} opérations présentes en X3 seulement`)
    }
    if (onlyReplica.length > 0) {
      this.logger.warning(`  ${onlyReplica.length} opérations présentes en réplique seulement`)
    }
    if (fieldDiffs.length > 0) {
      this.logger.warning(`  ${fieldDiffs.length} opérations avec un champ divergent :`)
      for (const line of fieldDiffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    }
    const ok = onlyDirect.length === 0 && onlyReplica.length === 0 && fieldDiffs.length === 0
    if (ok) this.logger.success('  opérations identiques')
    return ok
  }

  /**
   * STOCK détail — pas d'identité de ligne exploitée (même choix que `compareStock`,
   * cf. sa note), diff par agrégat `article#loc → quantité`.
   */
  private async compareStockDetail(): Promise<boolean> {
    const replica = await stockDetailReplicaRepository.getRows()
    if (replica.length === 0) {
      this.logger.info(
        '  stock_detail_replica vide — pas encore ingérée (node ace replica:sync --only=stock-detail). Skip.'
      )
      return true
    }

    const started = Date.now()
    const direct = await new ConditionnementRepository().getStockDetailRows()
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)
    this.logger.info(
      `X3 : ${direct.length} lignes · réplique : ${replica.length} lignes · ${elapsed} s`
    )

    const aggregate = (rows: { article: string; loc: string; qte: number }[]) => {
      const m = new Map<string, number>()
      for (const r of rows) {
        const k = `${r.article}#${r.loc}`
        m.set(k, (m.get(k) ?? 0) + r.qte)
      }
      return m
    }
    const directAgg = aggregate(direct)
    const replicaAgg = aggregate(replica)
    const keys = new Set([...directAgg.keys(), ...replicaAgg.keys()])

    const diffs: string[] = []
    for (const k of keys) {
      const d = directAgg.get(k) ?? 0
      const r = replicaAgg.get(k) ?? 0
      if (Math.abs(d - r) > 0.01) diffs.push(`${k} : ${d}≠${r}`)
    }

    if (diffs.length > 0) {
      this.logger.warning(`  ${diffs.length} article#emplacement avec une quantité divergente :`)
      for (const line of diffs.slice(0, 10)) this.logger.warning(`    ${line}`)
    } else {
      this.logger.success('  stock détail identique par article et emplacement')
    }
    return diffs.length === 0
  }
}

function dayKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}
