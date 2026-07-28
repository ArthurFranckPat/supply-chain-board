import { test } from '@japa/runner'
import type { OperationRecord } from '#repositories/operation_repository'
import { computeAvancement, estOfFantome, resteAProduire } from '#app/domain/of_avancement'

function op(
  mfgnum: string,
  openum: number,
  cplqty: number,
  opesta = ' ',
  extqty = 100
): OperationRecord {
  return { mfgnum, openum, cplqty, opesta, extqty }
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

  test('gammes mono-opération → estDebuté false (angle mort documenté)', ({ assert }) => {
    const records: OperationRecord[] = [
      op('OF-4', 10, 720), // seule op = dernière = déclaration stock
    ]
    const result = computeAvancement(records)
    assert.isFalse(result.get('OF-4')!.estDebuté)
    assert.equal(result.get('OF-4')!.nbOperations, 0)
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
