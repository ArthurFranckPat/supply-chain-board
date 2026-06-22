import { test } from '@japa/runner'
import { performance } from 'node:perf_hooks'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { OfOverride } from '#app/domain/planning_board'
import { evaluateOrderImpacts } from '#app/domain/order-impacts'

/**
 * Garde anti-régression perf (issue #33) — chemin de calcul PUR, sans X3.
 *
 * `evaluateOrderImpacts` est le cœur de calcul partagé par board / suivi / ruptures. Ce test
 * l'alimente avec un jeu synthétique de taille réaliste et assure un budget : toute régression
 * algorithmique (boucle quadratique introduite, copie inutile…) fait échouer la CI, sans dépendre
 * du réseau X3. Le budget est volontairement large (machine CI lente) — il attrape les explosions
 * d'ordre de grandeur, pas les micro-variations.
 */

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

function daysFromNow(n: number): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code, description: `Desc ${code}`, category: 'PF3', supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

/** Construit un dataset réaliste : N PF, chacun 1 OF + 1 commande + 1 composant ACHAT en BOM. */
function buildDataset(n: number) {
  const supply: Flow[] = []
  const demands: Flow[] = []
  const nomenclatures = new Map<string, Nomenclature>()
  const articles = new Map<string, Article>()

  for (let i = 0; i < n; i++) {
    const pf = `PF${i}`
    const comp = `C${i}`
    articles.set(pf, makeArticle(pf))
    articles.set(comp, makeArticle(comp, 'ACHAT'))

    supply.push({
      article: pf, quantity: 60, direction: 'supply', date: daysFromNow(8),
      origin: { type: 'of', id: `OF-${i}`, status: 1, designation: '', typeOfLabel: '', statutLabel: '' } as any,
    })
    supply.push({ article: comp, quantity: 1000, direction: 'supply', date: null, origin: { type: 'stock', pmp: null } })
    demands.push({
      article: pf, quantity: 60, direction: 'demand', date: daysFromNow(10),
      origin: { type: 'order', id: `CMD-${i}`, orderType: 'NOR', client: 'ACME', description: '' } as any,
    })
    nomenclatures.set(pf, {
      article: pf, description: '', components: [
        { parentArticle: pf, parentDescription: '', level: 5, componentArticle: comp, componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
      ],
    })
  }

  return { supply, demands, nomenclatures, articles }
}

test.group('evaluateOrderImpacts perf (issue #33)', () => {
  test('500 OF/commandes restent sous le budget', ({ assert }) => {
    const { supply, demands, nomenclatures, articles } = buildDataset(500)
    const overrides = new Map<string, OfOverride>()
    const window = { from: daysFromNow(-7), to: daysFromNow(42) }

    // Warm-up (JIT) hors mesure.
    evaluateOrderImpacts(demands, supply, nomenclatures, articles, overrides, window)

    const start = performance.now()
    const result = evaluateOrderImpacts(demands, supply, nomenclatures, articles, overrides, window)
    const elapsed = performance.now() - start

    // Sanity : le calcul a bien tourné sur tout le dataset.
    assert.equal(result.stats.nbCommandes, 500)

    // Budget large (~ordre de grandeur). Ajuster seulement si le hardware CI change.
    const BUDGET_MS = 1000
    assert.isBelow(
      elapsed,
      BUDGET_MS,
      `evaluateOrderImpacts(500) a pris ${elapsed.toFixed(0)}ms (budget ${BUDGET_MS}ms) — régression perf probable`
    )
  })
})
