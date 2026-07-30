import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import replicaSyncService from '#services/replica_sync_service'
import replicaGate from '#services/replica_gate'
import ordersReplicaRepository from '#repositories/orders_replica_repository'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'

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
 * `--compare` (#98, lot 2) : appelle X3 ET lit la réplique pour `orders_replica`,
 * diffe les deux jeux, n'écrit rien. C'est la « comparaison en parallèle » du lot 2 —
 * volontairement hors du chemin de lecture chaud (`board_dataset.ts` ne fait jamais
 * les deux appels), pour ne pas repayer le coût X3 qu'on cherche à éliminer sur
 * chaque requête utilisateur.
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

  async run() {
    if (this.status) return this.printStatus()
    if (this.compare) return this.printCompare()

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

    if (stableOk && suggOk) {
      this.logger.success(
        'Réplique et voie directe cohérentes (fermes/planifiés exacts, suggestions par agrégat)'
      )
    } else {
      this.exitCode = 1
    }
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
}

function dayKey(d: ManufacturingOrder['endDate']): string {
  return d ? d.toISOString().slice(0, 10) : ''
}
