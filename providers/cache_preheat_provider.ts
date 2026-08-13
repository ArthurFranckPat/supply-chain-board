import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import boardDataset from '#services/board_dataset'
import { defaultStockRange } from '#repositories/stock_valuation_repository'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'
import { replicaReadsEnabled } from '#services/replica_gate'

/**
 * Préchauffage + maintien à chaud du cache X3.
 *
 * ## Ce provider n'appartient QU'AU MODE DIRECT
 *
 * `REPLICA_READS` choisit entre deux architectures, pas entre deux réglages
 * (#98) :
 *
 * - **fermé — mode direct** : les écrans lisent X3 à travers bentocache. Tout ce
 *   qui suit s'applique : sans préchauffage le premier utilisateur paie ~18-22 s.
 * - **ouvert — mode réplique** : les écrans lisent SQLite. Il n'y a plus de cold
 *   start à amortir, et le cache est devenu plus LENT que ce qu'il enveloppe —
 *   lecture indexée ~4 ms contre 22-93 ms de `SuperJSON.parse` par hit L1.
 *   Préchauffer y revient à recopier la réplique en mémoire pour la relire moins
 *   vite.
 *
 * D'où la sortie immédiate de `ready()` en mode réplique : ni préchauffage ni
 * warmer. Les deux modes restent entiers et exclusifs, jamais superposés.
 *
 * 1. PREHEAT (boot) : les entrées coûteuses de `tasks()` — vue ORDERS
 *    (~18-20 s SOAP à froid, partagée par /programme, /ordonnancement,
 *    /ruptures, engagement poste…), les deux KPI du dashboard (retard 23 s,
 *    valorisation stock 9 s) et l'estimateur de conditionnement (STOCK +
 *    STOJOU sur 6 mois). Sans préchauffage, le PREMIER utilisateur subit le
 *    cold start (~22 s mesuré sur le panneau engagement ; jusqu'à 86 s avant
 *    optimisation du conditionnement). Chaque tâche logue sa durée.
 * 2. WARMER (tick 4 min) : ces entrées ont un TTL de 2 à 5 min + grâce 12 h.
 *    Une nuit / un week-end sans trafic épuise la grâce → le 1er utilisateur du
 *    matin repayait le mur froid synchrone. Le tick garde la valeur vivante en
 *    permanence : fraîche → no-op ; en grâce → le SWR bentocache (timeout 0)
 *    déclenche le refresh X3 en arrière-plan. Hors requête, les creds X3 =
 *    compte de service `.env` (getX3EnvConfig).
 *    Multi-instance : le lock bentocache évite le dogpile sur la factory.
 *
 * PRÉREQUIS : un store qui SURVIT au process. La grâce de 12 h invoquée ci-dessus
 * n'existe que si son support existe encore au redémarrage — L2 Redis en prod,
 * L2 fichier en dev (`CACHE_STORE=file`, cf. config/cache.ts). Avec un store L1
 * seule, tout ce préchauffage est repayé intégralement à chaque `node ace serve`
 * et à chaque redémarrage HMR.
 *
 * PRÉREQUIS : ne chauffer que des clés STABLES. Une clé qui embarque le jour
 * courant (`…:2026-07-26`) est neuve chaque matin — le warmer alimenterait
 * celle d'hier pendant que l'utilisateur en demande une autre. C'était le cas
 * de stock-valuation avant le passage aux buckets de période.
 *
 * Fire-and-forget (non bloquant), log-only en cas d'échec (X3 injoignable au
 * boot = non fatal, le cache se remplit à la 1re requête via SWR). Rien en
 * environnement `repl`/`test`.
 *
 * NB : le hook `ready()` (pas `boot()`) est utilisé car `cache` (@adonisjs/cache
 * services/main) n'est assigné qu'après les hooks `app.booted()`, exécutés
 * après le `boot()` de tous les providers — l'appeler depuis `boot()` lève
 * "Cannot read properties of undefined (reading 'namespace')".
 */

// Sous le TTL de board:orders (5 min, cf. board_dataset.ORDERS_TTL) : à chaque
// tick la valeur est soit fraîche (no-op) soit en grâce (refresh SWR background)
// → elle ne meurt jamais entre deux utilisateurs. Les entrées à TTL 2 min
// (stock) expirent entre deux ticks : la grâce 12 h les couvre, le tick les
// rafraîchit — c'est le comportement voulu, pas un trou.
const WARM_INTERVAL_MS = 4 * 60 * 1000

export default class CachePreheatProvider {
  private warmTimer: ReturnType<typeof setInterval> | null = null
  private warmRunning = false

  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de préchauffage en repl/test.
    if (!this.app.getEnvironment().startsWith('web')) return

    // MODE RÉPLIQUE : ni préchauffage ni warmer (#98).
    //
    // Ce provider existe pour amortir un cold start X3 de ~18 s. En mode
    // réplique il n'y a plus de cold start à amortir : les écrans lisent SQLite,
    // et préchauffer revient à recopier la réplique en mémoire pour la relire
    // PLUS LENTEMENT — lecture indexée ~4 ms contre 22-93 ms de `SuperJSON.parse`
    // par hit L1. Le préchauffage mesuré à 285 ms sur `board:orders` en mode
    // réplique n'était pas un gain, c'était du travail perdu.
    //
    // Les deux modes restent entiers et exclusifs : `REPLICA_READS` fermé = X3
    // direct AVEC préchauffage, ouvert = réplique SANS. Pas de troisième
    // configuration où les deux couches se superposent.
    if (replicaReadsEnabled()) {
      const logger = await this.app.container.make('logger')
      logger.info('[cache-preheat] mode réplique (REPLICA_READS) — préchauffage désactivé')
      return
    }

    // ATTENTION au timing : `cache` (@adonisjs/cache/services/main) n'est
    // instancié qu'à l'intérieur d'un hook `app.booted()`. L'appeler pendant
    // boot() d'un provider (ici) → cache encore `undefined` →
    // "Cannot read properties of undefined (reading 'namespace')".
    // On reporte donc le préchauffage APRÈS le boot complet de l'app.
    void this.app.booted(async () => {
      const logger = await this.app.container.make('logger')
      // Fire-and-forget : on n'attend pas (le serveur doit rester responsive).
      void this.preheat(logger)
      this.startWarmer(logger)
    })
  }

  async shutdown() {
    if (this.warmTimer) clearInterval(this.warmTimer)
  }

  /**
   * Entrées maintenues chaudes, dans l'ordre de préchauffage : orders d'abord (le
   * plus partagé), puis les deux KPI du dashboard, puis l'estimateur de
   * conditionnement.
   *
   * SÉQUENTIEL par défaut prudent, pas par démonstration. Le graphe de dépendances
   * ne compte qu'un lien (retard-kpi appelle getOrders), donc deux chaînes
   * indépendantes semblent gratuites :
   *
   *   orders ──▶ retard-kpi        |     stock-valuation ──▶ conditionnement
   *
   * Essayé sur X3 prod : 110 s de mur total en `Promise.all` contre ~94 s en
   * séquentiel. MAIS ce chiffre ne conclut rien — `board:orders` seul a été mesuré
   * à 26,3 / 36,5 / 72,7 / 104,4 s selon la charge X3 et le nombre de serveurs de
   * dev concurrents. La variance d'une seule tâche dépasse l'écart entre les deux
   * stratégies : l'A/B demanderait plusieurs runs appariés, pas un de chaque.
   *
   * Donc : si quelqu'un veut re-tenter, qu'il mesure sérieusement d'abord. En
   * attendant, le séquentiel est retenu parce qu'il ne peut pas dégrader une
   * requête utilisateur concurrente, ce que la contention SOAP, elle, peut faire.
   * Le vrai gain n'est de toute façon pas ici mais en amont, en sortant X3 du
   * chemin de lecture (#98).
   *
   * DEUX FAMILLES, deux règles — c'est ce qui empêche cette liste de redevenir un
   * assortiment arbitraire :
   *
   * 1. Les DATASETS X3 partagés (`board:*`) — `warm: true`. Plusieurs pages en
   *    dépendent, leurs clés sont stables, le warmer les garde vivants en
   *    permanence pour que personne ne repaie le mur froid.
   * 2. Les PAYLOADS DE PAGE (`programme:*`, `engagement:*`, `ruptures:*`,
   *    `charge:*`, `suivi:*`) — `warm: false`. Un par point d'entrée, à ses
   *    paramètres PAR DÉFAUT (= la clé d'une requête sans query string, donc
   *    celle de l'arrivée à froid). Le warmer ne les reprend pas : les maintenir
   *    tièdes coûterait une reconstruction complète toutes les 4 à 8 min, page
   *    consultée ou non. Après le boot, c'est le trafic réel qui les rafraîchit
   *    via le SWR — le refresh suit l'usage, pas un minuteur.
   *
   * La leçon qui a produit cette règle : chauffer les datasets ne suffit PAS.
   * /programme a été mesuré à 22,6 s et /sequenceur à 27,6 s alors que `board:*`
   * était chaud, parce que chaque page assemble son propre payload derrière sa
   * propre clé. Toute page absente de cette liste paie son mur froid en entier.
   * Une page ajoutée à l'app doit donc être ajoutée ici.
   *
   * Une plage choisie par l'utilisateur (calendrier, horizon custom) produit une
   * clé qu'on ne peut pas deviner : elle restera froide à sa première ouverture.
   * C'est assumé — seul le chemin par défaut est préchauffable.
   *
   * Les deux KPI du dashboard sont les murs restants mesurés en requête :
   * retard 23 s (3 requêtes SOAP séquentielles), valorisation stock 9 s
   * (1 requête base + ~6 chunks STOJOU). Leurs clés de cache sont stables
   * (cf. boardDataset.getRetardKpi / getStockValuation) : le warmer les tient
   * donc vraiment à chaud, au lieu d'alimenter une clé neuve chaque jour.
   */
  private tasks(): Array<{ label: string; run: () => Promise<unknown>; warm: boolean }> {
    return [
      { label: 'board:orders', warm: true, run: () => boardDataset.getOrders() },
      {
        // Dépend de board:orders — doit rester APRÈS lui, sinon les deux
        // déclenchent la même factory ORDERS.
        label: 'retard-kpi (dashboard)',
        warm: true,
        run: () => boardDataset.getRetardKpi(new Date(), RETARD_LOOKBACK_DAYS),
      },
      {
        label: 'stock-valuation (dashboard)',
        warm: true,
        run: () => {
          // Mêmes valeurs par défaut que le contrôleur (grain mois, 12 périodes
          // glissantes) → même clé de cache, sinon on chaufferait à côté.
          const refDate = new Date()
          const { from, to } = defaultStockRange('mois', refDate)
          return boardDataset.getStockValuation('mois', from, to, refDate)
        },
      },
      {
        label: 'estimateur conditionnement',
        warm: true,
        run: () => boardDataset.getConditionnementEstimator(),
      },
      {
        // Payload assemblé de /programme — la page d'entrée, et le seul mur qui
        // restait après la persistance disque : 22,6 s mesurées sur un premier
        // chargement. Le préchauffage `board:*` ne l'atteignait pas, /programme
        // dépendant de clés que personne ne chauffait (`orders-window:*`,
        // `demand-recep:*`, `orders-matching-delta:*`, `bom`, `mfgmat:*`,
        // `stock:*`), puis du payload assemblé lui-même. Le chauffer chauffe
        // toute la chaîne, puisque c'est elle qui le construit.
        //
        // Fenêtre PAR DÉFAUT uniquement (aujourd'hui, 14 j) : c'est la clé du
        // chargement sans paramètre, donc celle de l'arrivée à froid sur la page.
        // Une plage choisie au calendrier produit une clé propre — impossible à
        // deviner, elle reste froide à sa première ouverture.
        //
        // `warm: false` : cf. la règle des payloads de page ci-dessus.
        label: 'payload /programme (14 j)',
        warm: false,
        run: async () => {
          // Import dynamique : le contrôleur tire toute la chaîne de chargement
          // du board. En statique, ce provider l'importerait au boot de l'app.
          const { default: SchedulerController } = await import('#controllers/scheduler_controller')
          return new SchedulerController().loadProgrammeData({ days: 14 }, '/programme', 'combined')
        },
      },
      {
        // /sequenceur — clé `engagement:summaries:v7`, STABLE (aucune date).
        label: 'payload /sequenceur',
        warm: false,
        run: async () => {
          const { loadPosteSummaries } = await import('#services/poste_engagement_loader')
          return loadPosteSummaries()
        },
      },
      {
        // /ruptures — clé `ruptures:payload:<jour>:14`. `{}` reproduit exactement
        // les défauts d'une requête sans paramètre (aujourd'hui, horizon 14).
        label: 'payload /ruptures (14 j)',
        warm: false,
        run: async () => {
          const { loadShortageRowsData } = await import('#services/shortage_payload_loader')
          return loadShortageRowsData({})
        },
      },
      {
        // /charge — clé `charge:payload:charge:<1er du mois>:<NB_MONTHS>`.
        label: 'payload /charge',
        warm: false,
        run: async () => {
          const { loadChargePayloadData } = await import('#services/load_payload_loader')
          return loadChargePayloadData({})
        },
      },
      {
        // /suivi — clé `suivi:context`, STABLE. `buildContext` réassemble les ports
        // à chaque appel ; seul le snapshot X3 est caché, et c'est lui qui coûte.
        label: 'contexte /suivi',
        warm: false,
        run: async () => {
          const { SuiviService } = await import('#services/suivi_service')
          return new SuiviService().buildContext()
        },
      },
    ]
  }

  /**
   * Préchauffage séquentiel, chaque tâche logguant sa DURÉE.
   *
   * La durée va dans le MESSAGE, pas seulement dans les bindings : le transport
   * pretty du dev (config/logger.ts) n'affiche que `msg`, un `{ ms }` structuré y
   * serait invisible — or c'est précisément en dev que ce log sert. Sans elle il
   * fallait soustraire à la main deux timestamps pour savoir où passait le mur de
   * boot, et rien n'était comparable d'un démarrage à l'autre.
   */
  private async preheat(logger: LoggerService) {
    const startedAt = Date.now()
    for (const task of this.tasks()) {
      const taskStartedAt = Date.now()
      try {
        logger.info(`[cache-preheat] préchauffage ${task.label}…`)
        await task.run()
        const ms = Date.now() - taskStartedAt
        logger.info({ ms }, `[cache-preheat] ${task.label} prêt en ${ms} ms`)
      } catch (e) {
        // Non fatal : X3 peut être indispo au boot. Le cache se remplira à la 1re requête.
        const ms = Date.now() - taskStartedAt
        logger.warn(
          { err: e, ms },
          `[cache-preheat] échec préchauffage ${task.label} après ${ms} ms (non fatal)`
        )
      }
    }
    const total = Date.now() - startedAt
    logger.info({ ms: total }, `[cache-preheat] préchauffage terminé en ${total} ms`)
  }

  /**
   * Maintien à chaud : un appel périodique à chaque entrée (sans force).
   * Fraîche → retour instantané ; en grâce → SWR, le refresh part en
   * arrière-plan (erreurs avalées par bentocache) ; hors grâce → recalcul
   * synchrone DANS le warmer, jamais dans une requête utilisateur.
   *
   * Séquentiel volontairement (pas de Promise.all) : ces factories tapent
   * toutes le même pool SOAP, les lancer ensemble allonge chaque requête.
   * Un tick ne se chevauche pas avec le précédent (garde `warmRunning`).
   *
   * Seules les entrées `warm: true` sont reprises. Le préchauffage au boot est
   * ponctuel — on peut y payer cher une fois ; le warmer, lui, rejoue toutes les
   * 4 min, indéfiniment. Une entrée dont le refresh coûte une reconstruction
   * complète n'a rien à y faire tant que personne ne consulte la page.
   */
  private startWarmer(logger: LoggerService) {
    this.warmTimer = setInterval(() => {
      if (this.warmRunning) return
      this.warmRunning = true
      void (async () => {
        for (const task of this.tasks().filter((t) => t.warm)) {
          try {
            await task.run()
          } catch (e) {
            logger.warn({ err: e }, `[cache-warmer] échec refresh ${task.label} (non fatal)`)
          }
        }
        this.warmRunning = false
      })()
    }, WARM_INTERVAL_MS)
    // Ne jamais retenir le process vivant pour ce timer (tests, shutdown).
    this.warmTimer.unref()
  }
}
