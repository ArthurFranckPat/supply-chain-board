import { test } from '@japa/runner'
import { buildFeasibilityMap } from '../../inertia-react/lib/board/feasibility-parse.js'

/**
 * Traduction du payload `board-feasibility` en badges. Le parseur vit côté client mais il
 * est pur : il se teste ici comme une fonction de domaine, importé en relatif — l'alias
 * `@r/*` n'est câblé que pour le bundle Vite (cf. diff_flash.test.ts).
 *
 * Ce qui se joue : les QUANTITÉS manquantes étaient jetées (`Object.keys`), et le board ne
 * pouvait dire que « rupture », jamais de combien. Le tooltip du badge les rend.
 */
test.group('buildFeasibilityMap', () => {
  test('OF bloqué : conserve les quantités, pas seulement les références', ({ assert }) => {
    const { map, nbBlocked } = buildFeasibilityMap([
      { numOf: 'OF1', feasible: false, missingComponents: { C1: 1400, C2: 3 } },
    ])
    assert.equal(nbBlocked, 1)
    assert.deepEqual(map.OF1.missing, ['C1', 'C2'])
    assert.deepEqual(map.OF1.missingQty, { C1: 1400, C2: 3 })
  })

  test('OF bloqué sans manque direct : pas de champ quantités vide', ({ assert }) => {
    // Manque plus bas dans la BOM — le tooltip renvoie alors vers le diagnostic de l'OF.
    const { map } = buildFeasibilityMap([{ numOf: 'OF1', feasible: false, missingComponents: {} }])
    assert.equal(map.OF1.st, 'blocked')
    assert.isUndefined(map.OF1.missingQty)
  })

  test('faisable sous CQ : quantités Q portées, aucun manque', ({ assert }) => {
    const { map, nbQc, nbOk } = buildFeasibilityMap([
      { numOf: 'OF1', feasible: true, qcComponents: { C1: 591 } },
      { numOf: 'OF2', feasible: true },
    ])
    assert.equal(nbQc, 1)
    assert.equal(nbOk, 1)
    assert.equal(map.OF1.st, 'qc')
    assert.deepEqual(map.OF1.qcComponents, { C1: 591 })
    assert.isUndefined(map.OF1.missingQty)
    assert.equal(map.OF2.st, 'ok')
  })

  test('verdict inconnu (null) : OF absent de la map, jamais badgé à tort', ({ assert }) => {
    const { map } = buildFeasibilityMap([{ numOf: 'OF1' }])
    assert.isUndefined(map.OF1)
  })
})
