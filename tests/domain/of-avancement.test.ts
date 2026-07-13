import { test } from '@japa/runner'
import type { OperationRecord } from '#repositories/operation_repository'
import { computeAvancement } from '#app/domain/of-avancement'

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
