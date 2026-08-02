import { test } from '@japa/runner'
import { buildOrdersSql } from '#repositories/combined_orders_repository'

/**
 * Ré-ingestion CIBLÉE d'`orders_flux_replica` (#98, read-after-write) : après une
 * écriture X3, on relit les ordres NOMMÉS, sans fenêtre de dates.
 *
 * L'invariant que ces tests protègent n'est pas la forme du SQL — c'est que la
 * relecture ciblée porte sur la MÊME population que le swap complet. Si les deux
 * variantes divergeaient sur les `WIPSTA`, une ligne réécrite après un
 * affermissement serait aussitôt effacée (ou ressuscitée) par le run suivant, et
 * l'écart ne se verrait que sur l'écran d'un planificateur.
 *
 * D'où `WIPSTA_BY_WIPTYP`, déclaré une fois et lu par les deux branches : ces
 * tests comparent les deux SQL entre eux, jamais à une liste recopiée ici — une
 * constante recopiée dans le test ne protégerait que d'elle-même.
 */

const BASE = {
  from: '20260503',
  to: '20270801',
  includeOf: true,
  includeContremarque: true,
  includeCustomerRef: true,
  forReplica: true,
} as const

/** `WIPSTA_0 IN (…)` de chaque condition, dans l'ordre du SQL. */
function wipstaClauses(sql: string): string[] {
  return [...sql.matchAll(/WIPSTA_0 IN \(([^)]*)\)/g)].map((m) => m[1])
}

test.group('SQL ORDERS — ré-ingestion ciblée par VCRNUM', () => {
  test('même population de statuts que la variante fenêtrée, WIPTYP par WIPTYP', ({ assert }) => {
    for (const wiptyp of [1, 2, 5] as const) {
      const windowed = buildOrdersSql({ ...BASE, onlyWiptyp: wiptyp })
      const targeted = buildOrdersSql({ ...BASE, onlyWiptyp: wiptyp, vcrnums: ['F126-44429'] })

      assert.deepEqual(
        wipstaClauses(targeted),
        wipstaClauses(windowed),
        `WIPTYP ${wiptyp} : les deux variantes doivent retenir les mêmes statuts`
      )
    }
  })

  test('les bornes de dates disparaissent — un ordre écrit peut échoir hors fenêtre', ({
    assert,
  }) => {
    const targeted = buildOrdersSql({ ...BASE, onlyWiptyp: 5, vcrnums: ['F126-44429'] })

    assert.notInclude(targeted, 'TO_DATE')
    assert.include(targeted, "O.VCRNUM_0 IN ('F126-44429')")
  })

  test('la variante fenêtrée reste bornée', ({ assert }) => {
    // Garde-fou du test précédent : sans lui, une régression qui supprimerait
    // TOUTES les bornes le laisserait passer.
    assert.include(buildOrdersSql({ ...BASE, onlyWiptyp: 5 }), 'TO_DATE')
  })

  test('plusieurs numéros → une seule liste `IN`', ({ assert }) => {
    const sql = buildOrdersSql({ ...BASE, onlyWiptyp: 5, vcrnums: ['F126-1', 'SGAE-2'] })
    assert.include(sql, "O.VCRNUM_0 IN ('F126-1', 'SGAE-2')")
  })

  test('quote doublée dans le littéral — pas de quote, pas d’injection', ({ assert }) => {
    // Les VCRNUM X3 sont alphanumériques ; la valeur vient malgré tout d'une
    // requête HTTP (`/planning/orders/:orderNum/firm`), donc jamais interpolée
    // brute.
    const sql = buildOrdersSql({ ...BASE, onlyWiptyp: 5, vcrnums: ["F1' OR '1'='1"] })
    assert.include(sql, "'F1'' OR ''1''=''1'")
  })
})
