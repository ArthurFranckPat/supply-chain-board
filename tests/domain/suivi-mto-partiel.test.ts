import { test } from '@japa/runner'
import { assignStatuses } from '#app/domain/suivi'
import type { OrderLine } from '#app/domain/suivi'

/**
 * Règle MTO : pas d'expédition partielle.
 * Une commande MTO n'est expédiable que si TOUTES ses lignes sont prêtes. On CONSERVE
 * le statut de base (A_EXPEDIER…) mais on lève le signal `attenteLignesMto` sur les
 * lignes A_EXPEDIER d'une commande MTO incomplète (≥ 1 ligne avec besoin net > 0).
 */
function makeLine(overrides: Partial<OrderLine> & { numCommande: string; article: string }): OrderLine {
  return {
    ligne: '1000',
    designation: '', nomClient: '', typeCommande: 'MTO',
    dateExpedition: null, dateLivPrevu: null,
    qteCommandee: 100, qteAllouee: 0, qteRestante: 100,
    isFabrique: false, isHardPegged: false,
    ...overrides,
  }
}

const ZERO = { strict: 0, qc: 0, total: 0 }

test.group('MTO — pas d\'expédition partielle', () => {
  const refDate = new Date('2026-06-10')

  test('commande MTO complète → aucune ligne en attente', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({ numCommande: 'C1', article: 'A', qteRestante: 50, qteAllouee: 50 }),
      makeLine({ numCommande: 'C1', article: 'B', qteRestante: 30, qteAllouee: 30 }),
    ]
    const stock = new Map<string, typeof ZERO>([
      ['A', ZERO],
      ['B', ZERO],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.isTrue(results.every((r) => r.status === 'A_EXPEDIER'))
    assert.isFalse(results[0].attenteLignesMto)
    assert.isFalse(results[1].attenteLignesMto)
  })

  test('commande MTO incomplète → ligne prête en attente, statut conservé', ({ assert }) => {
    const lines: OrderLine[] = [
      // Ligne prête (besoin net = 0).
      makeLine({ numCommande: 'C1', ligne: '1000', article: 'A', qteRestante: 50, qteAllouee: 50 }),
      // Ligne non prête (besoin net = 30).
      makeLine({ numCommande: 'C1', ligne: '2000', article: 'B', qteRestante: 30, qteAllouee: 0 }),
    ]
    const stock = new Map<string, typeof ZERO>([
      ['A', ZERO],
      ['B', ZERO],
    ])
    const results = assignStatuses(lines, stock, refDate)
    const prete = results.find((r) => r.line.article === 'A')!
    const nonPrete = results.find((r) => r.line.article === 'B')!

    // Le statut de base est conservé : la ligne prête reste A_EXPEDIER.
    assert.equal(prete.status, 'A_EXPEDIER')
    assert.isTrue(prete.attenteLignesMto)

    // La ligne non prête n'est pas A_EXPEDIER et ne porte pas le signal d'attente.
    assert.notEqual(nonPrete.status, 'A_EXPEDIER')
    assert.isFalse(nonPrete.attenteLignesMto)
  })

  test('commande MTS incomplète → pas de signal (règle MTO uniquement)', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({ numCommande: 'C1', article: 'A', typeCommande: 'MTS', qteRestante: 50, qteAllouee: 50 }),
      makeLine({ numCommande: 'C1', article: 'B', typeCommande: 'MTS', qteRestante: 30, qteAllouee: 0 }),
    ]
    const stock = new Map<string, typeof ZERO>([
      ['A', ZERO],
      ['B', ZERO],
    ])
    const results = assignStatuses(lines, stock, refDate)
    for (const r of results) assert.isFalse(r.attenteLignesMto)
  })

  test('commande MTO mono-ligne non prête → pas de signal', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({ numCommande: 'C1', article: 'A', qteRestante: 50, qteAllouee: 0 }),
    ]
    const stock = new Map<string, typeof ZERO>([['A', ZERO]])
    const results = assignStatuses(lines, stock, refDate)
    assert.notEqual(results[0].status, 'A_EXPEDIER')
    assert.isFalse(results[0].attenteLignesMto)
  })
})
