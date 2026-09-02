import { test } from '@japa/runner'
import type { OperationRecord } from '#repositories/operation_repository'
import {
  computeAvancement,
  ecartDeclarationQty,
  estEcartDeclaration,
  estOfFantome,
  resteAProduire,
} from '#app/domain/of_avancement'

function op(
  mfgnum: string,
  openum: number,
  cplqty: number,
  opesta = ' ',
  extqty = 100
): OperationRecord {
  return { mfgnum, openum, cplqty, opesta, extqty, cplwst: null, extwst: null }
}

test.group('computeAvancement', () => {
  test('OF avec pointages intermédiaires → estDebuté true', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-1', 10, 720), // intermédiaire pointée
      op('OF-1', 20, 0), // intermédiaire non pointée
      op('OF-1', 30, 0), // dernière op (déclaration stock) — exclue
    ]
    const result = computeAvancement(records)
    const avancement = result.get('OF-1')!
    assert.isTrue(avancement.estDebuté)
    assert.equal(avancement.derniereOpPointée, 10)
    assert.equal(avancement.derniereOpGamme, 30)
    assert.equal(avancement.nbOperations, 2) // 2 intermédiaires
    assert.equal(avancement.nbOperationsPointées, 1)
  })

  test('OF sans pointages intermédiaires → estDebuté false', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-2', 10, 0),
      op('OF-2', 20, 0),
      op('OF-2', 30, 720), // seule la dernière a un pointage (entrée stock)
    ]
    const result = computeAvancement(records)
    const avancement = result.get('OF-2')!
    assert.isFalse(avancement.estDebuté)
    assert.isNull(avancement.derniereOpPointée)
  })

  test('la dernière opération (déclaration stock) est exclue du calcul', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-3', 10, 0),
      op('OF-3', 20, 0),
      op('OF-3', 30, 720), // dernière — déclarée mais pas un avancement réel
    ]
    const result = computeAvancement(records)
    assert.isFalse(result.get('OF-3')!.estDebuté)
  })

  test('gammes mono-opération pointée → estDebuté + qtyRealisee (plus d’angle mort)', ({
    assert,
  }) => {
    const records: OperationRecord[] = [
      op('OF-4', 10, 720), // seule op = poste atelier, pas d'op stock séparée
    ]
    const result = computeAvancement(records)
    const a = result.get('OF-4')!
    assert.isTrue(a.estDebuté)
    assert.equal(a.qtyRealisee, 720)
    assert.equal(a.qtyPrevueOp, 100)
    assert.equal(a.nbOperations, 1)
    assert.equal(a.derniereOpPointée, 10)
    assert.equal(a.derniereOpGamme, 10)
  })

  test('gammes mono-opération non pointée → estDebuté false', ({ assert }) => {
    const records: OperationRecord[] = [op('OF-4b', 10, 0)]
    const a = computeAvancement(records).get('OF-4b')!
    assert.isFalse(a.estDebuté)
    assert.equal(a.qtyRealisee, 0)
  })

  test('plusieurs OFs traités indépendamment', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-A', 10, 300),
      op('OF-A', 20, 0),
      op('OF-A', 30, 0),
      op('OF-B', 10, 0),
      op('OF-B', 20, 0),
    ]
    const result = computeAvancement(records)
    assert.isTrue(result.get('OF-A')!.estDebuté)
    assert.isFalse(result.get('OF-B')!.estDebuté)
  })

  test('records vides → map vide', ({ assert }) => {
    assert.equal(computeAvancement([]).size, 0)
  })

  test('position dans la gamme = dernière op intermédiaire pointée', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-5', 10, 720),
      op('OF-5', 20, 500),
      op('OF-5', 30, 300),
      op('OF-5', 40, 0), // dernière non pointée
    ]
    const result = computeAvancement(records)
    const a = result.get('OF-5')!
    assert.equal(a.derniereOpPointée, 30)
    assert.equal(a.nbOperationsPointées, 3)
    assert.equal(a.nbOperations, 3)
    // qtyRealisee = cplqty du poste le plus avancé pointé (op 30), pas op 10 ni op 20.
    assert.equal(a.qtyRealisee, 300)
  })

  test('qtyRealisee = 0 quand non débuté', ({ assert }) => {
    const records: OperationRecord[] = [op('OF-6', 10, 0), op('OF-6', 20, 720)]
    const a = computeAvancement(records).get('OF-6')!
    assert.isFalse(a.estDebuté)
    assert.equal(a.qtyRealisee, 0)
  })

  test('qtyRealisee cumule les lignes partagant le même openum (sous-lots)', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-7', 10, 200),
      op('OF-7', 10, 150), // 2e ligne, même opération (ex. postes différents)
      op('OF-7', 20, 0),
    ]
    const a = computeAvancement(records).get('OF-7')!
    assert.equal(a.derniereOpPointée, 10)
    assert.equal(a.qtyRealisee, 350)
  })
})

test.group('resteAProduire', () => {
  test("EXTQTY === RMNEXTQTY → X3 n'a rien netté, on déduit les pièces pointées", ({ assert }) => {
    // Cas réel F426-39752 : 67 lancées, 67 restantes, 38 pointées → 29 restent.
    assert.equal(resteAProduire(67, 67, 38), 29)
  })

  test('EXTQTY > RMNEXTQTY → X3 a déjà netté, ne pas déduire une 2e fois', ({ assert }) => {
    // Cas réel F426-39527 : 480 lancées, 120 restantes, 360 pointées. Déduire
    // donnerait 0 h de charge alors que 120 pièces restent réellement à produire.
    assert.equal(resteAProduire(120, 480, 360), 120)
  })

  test('gamme pointée à 100 % mais X3 nette sur la DÉCLARATION → reste atelier 0', ({ assert }) => {
    // Cas réel F426-47506 (EBH1257AL, 01/09/2026) : 2016 lancées, op. 10 et 20
    // pointées 2016/2016, 1082 seulement déclarées en stock → RMNEXTQTY = 934.
    // L'ancien discriminant rendait 934 et chargeait 2,3 h fantômes sur PP_127
    // pour des pièces déjà passées au poste.
    assert.equal(resteAProduire(934, 2016, 2016), 0)
  })

  test('déclaration en avance sur le pointage → borné par RMNEXTQTY, jamais au-dessus', ({
    assert,
  }) => {
    // Écart de déclaration (issue #95) : 480 lancées, 300 pointées, 400 déclarées
    // → RMNEXTQTY = 80. Le reste atelier brut (180) surestimerait la charge.
    assert.equal(resteAProduire(80, 480, 300), 80)
  })

  test('launched inconnu → repli sans déduction (surestimer plutôt que taire du travail)', ({
    assert,
  }) => {
    assert.equal(resteAProduire(67, null, 38), 67)
    assert.equal(resteAProduire(67, undefined, 38), 67)
  })

  test('OF non pointé → reste inchangé', ({ assert }) => {
    assert.equal(resteAProduire(67, 67, 0), 67)
  })

  test('pointage supérieur au reste → planché à 0, jamais de charge négative', ({ assert }) => {
    assert.equal(resteAProduire(67, 67, 100), 0)
  })
})

/**
 * OF fantôme : gamme pointée à 100 %, mais ORDERS annonce encore un reste. Les trois cas
 * ci-dessous sont les OF réels de `VAM813GM` relevés en PROD le 29/07/2026 — `F126-44429`
 * a été soldé à la main dans la foulée, sans aucune entrée en stock : les 7 pièces qu'il
 * promettait n'existaient pas.
 */
test.group('estOfFantome', () => {
  const avancementDe = (records: OperationRecord[], numOf: string) =>
    computeAvancement(records).get(numOf)

  test('F126-44429 (op. 5 pointée 84/84, ORDERS reste 7) → fantôme', ({ assert }) => {
    const a = avancementDe(
      [op('F126-44429', 5, 84, '4', 84), op('F126-44429', 10, 84, '4', 84)],
      'F126-44429'
    )
    assert.equal(a!.qtyRealisee, 84)
    assert.equal(a!.qtyPrevueOp, 84)
    assert.isTrue(estOfFantome(a, 7))
  })

  test('F126-48957 (op. 5 pointée 28/46, ORDERS reste 18 = 46 − 28) → sain', ({ assert }) => {
    const a = avancementDe(
      [op('F126-48957', 5, 28, '4', 46), op('F126-48957', 10, 28, '4', 46)],
      'F126-48957'
    )
    assert.isFalse(estOfFantome(a, 18))
  })

  test('F126-49177 (rien de pointé) → pas fantôme, juste pas démarré', ({ assert }) => {
    const a = avancementDe(
      [op('F126-49177', 10, 0, '1', 1080), op('F126-49177', 20, 0, '1', 1080)],
      'F126-49177'
    )
    assert.isFalse(estOfFantome(a, 1080))
  })

  test('OF soldé (reste 0) → jamais fantôme', ({ assert }) => {
    const a = avancementDe([op('OF-X', 5, 84, '4', 84), op('OF-X', 10, 84, '4', 84)], 'OF-X')
    assert.isFalse(estOfFantome(a, 0))
  })

  test('gamme mono-opération ou OF inconnu → on ne conclut pas', ({ assert }) => {
    const a = avancementDe([op('OF-MONO', 10, 50, '4', 50)], 'OF-MONO')
    assert.isFalse(estOfFantome(a, 10))
    assert.isFalse(estOfFantome(undefined, 10))
  })

  test('sur-pointage (105/100) compte comme gamme soldée', ({ assert }) => {
    const a = avancementDe([op('OF-Y', 5, 105, '4', 100), op('OF-Y', 10, 0, '4', 100)], 'OF-Y')
    assert.isTrue(estOfFantome(a, 5))
  })
})

/**
 * Écart déclaration PF vs pointage (issue #95) : DONE > qtyRealisee sur ops intermédiaires.
 * Cas de référence `F326-02036` — déclaré 480, pointé 370.
 */
test.group('estEcartDeclaration', () => {
  const avancementDe = (records: OperationRecord[], numOf: string) =>
    computeAvancement(records).get(numOf)

  test('F326-02036-like (déclaré 480, pointé 370) → écart 110', ({ assert }) => {
    const a = avancementDe(
      [
        op('F326-02036', 10, 370, '4', 1716),
        op('F326-02036', 20, 370, '4', 1716),
        op('F326-02036', 999, 0, '2', 1716),
      ],
      'F326-02036'
    )
    assert.equal(a!.qtyRealisee, 370)
    assert.equal(ecartDeclarationQty(a, 480), 110)
    assert.isTrue(estEcartDeclaration(a, 480))
  })

  test('DONE aligné sur pointage → pas d’écart', ({ assert }) => {
    const a = avancementDe([op('OF-OK', 10, 200, '4', 500), op('OF-OK', 999, 0, '2', 500)], 'OF-OK')
    assert.equal(ecartDeclarationQty(a, 200), 0)
    assert.isFalse(estEcartDeclaration(a, 200))
  })

  test('gamme mono-opération → indécidable, pas d’écart', ({ assert }) => {
    const a = avancementDe([op('OF-MONO', 10, 50, '4', 100)], 'OF-MONO')
    assert.isFalse(estEcartDeclaration(a, 80))
    assert.equal(ecartDeclarationQty(a, 80), 0)
  })

  test('OF non débuté (rien pointé) → pas d’écart même si DONE > 0', ({ assert }) => {
    const a = avancementDe([op('OF-ND', 10, 0, '1', 100), op('OF-ND', 999, 0, '1', 100)], 'OF-ND')
    assert.isFalse(estEcartDeclaration(a, 50))
  })

  test('avancement undefined ou DONE ≤ 0 → pas d’écart', ({ assert }) => {
    assert.isFalse(estEcartDeclaration(undefined, 100))
    assert.equal(ecartDeclarationQty(undefined, 100), 0)
    const a = avancementDe([op('OF-Z', 10, 50, '4', 100), op('OF-Z', 999, 0, '2', 100)], 'OF-Z')
    assert.isFalse(estEcartDeclaration(a, 0))
  })
})
