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
 * `--compare` (#98, lot 2) : appelle X3 ET lit la réplique pour les trois tables,
 * diffe les deux jeux, n'écrit rien. C'est la « comparaison en parallèle » du lot 2 —
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
    'Ingère ORDERS / lignes de commande / STOCK depuis X3 vers la réplique SQLite'

  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: "Affiche l'âge de chaque table sans rien ingérer" })
  declare status: boolean

  @flags.boolean({
    description: 'Compare réplique vs voie directe X3 sur orders_replica, sans rien ingérer',
  })
  declare compare: boolean

  @flags.array({
    description: 'Tables à ingérer (orders, order-lines, stock). Défaut : toutes',
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
    if (all || only.has('order-lines')) results.push(await replicaSyncService.syncOrderLines('cli'))
    if (all || only.has('stock')) results.push(await replicaSyncService.syncStock('cli'))

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

    if (ordersOk && linesOk && stockOk && deltaOk) {
      this.logger.success(
        'Réplique et voie directe cohérentes sur les trois tables + le delta matching'
      )
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
}

function dayKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}
