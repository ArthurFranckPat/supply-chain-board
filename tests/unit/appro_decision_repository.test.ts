import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ApproDecisionRepository } from '#app/repositories/appro_decision_repository'

/**
 * Ledger de décisions (#134) : append-only (chaque action = une ligne neuve),
 * la plus récente non expirée fait foi, expiration par absence à 3 runs (#112).
 *
 * Clés sentinelles `TEST-…` pour ne jamais toucher une vraie décision ; la
 * table est nettoyée à la fin de chaque test.
 */

const repo = new ApproDecisionRepository()
const conn = db.connection()

const nettoyer = async () => {
  await conn.from('appro_decision_ledger').where('cle_logique', 'like', 'TEST-%').delete()
}

test.group('ApproDecisionRepository — record', (group) => {
  group.each.setup(async () => {
    await nettoyer()
  })
  group.each.teardown(async () => {
    await nettoyer()
  })

  test('enregistre une décision (append-only)', async ({ assert }) => {
    const row = await repo.record({
      cleLogique: 'TEST-1',
      nature: 'suggestion',
      statut: 'ignorer',
      article: 'A1',
      fournisseur: 'F1',
      quantite: 100,
      echeance: '2026-09-01',
    })
    assert.equal(row.statut, 'ignorer')
    assert.equal(row.cleLogique, 'TEST-1')
    const count = await conn
      .from('appro_decision_ledger')
      .where('cle_logique', 'TEST-1')
      .count('* as n')
    assert.equal(Number((count[0] as { n: number }).n), 1)
  })
})

test.group('ApproDecisionRepository — latestParCle', (group) => {
  group.each.setup(async () => {
    await nettoyer()
  })
  group.each.teardown(async () => {
    await nettoyer()
  })

  test('rend la décision la plus récente par clé', async ({ assert }) => {
    await repo.record({
      cleLogique: 'TEST-2',
      nature: 'suggestion',
      statut: 'vu',
      article: 'A1',
      fournisseur: null,
      quantite: 10,
      echeance: null,
    })
    await repo.record({
      cleLogique: 'TEST-2',
      nature: 'suggestion',
      statut: 'ignorer',
      article: 'A1',
      fournisseur: null,
      quantite: 10,
      echeance: null,
    })
    const parCle = await repo.latestParCle(['TEST-2'])
    assert.equal(parCle.get('TEST-2')?.statut, 'ignorer')
  })

  test('ignore les décisions expirées', async ({ assert }) => {
    await repo.record({
      cleLogique: 'TEST-3',
      nature: 'message',
      statut: 'vu',
      article: 'A1',
      fournisseur: null,
      quantite: 0,
      echeance: null,
    })
    await conn
      .from('appro_decision_ledger')
      .where('cle_logique', 'TEST-3')
      .update({ expiree: true })
    const parCle = await repo.latestParCle(['TEST-3'])
    assert.isUndefined(parCle.get('TEST-3'))
  })
})

test.group('ApproDecisionRepository — expireAbsents', (group) => {
  group.each.setup(async () => {
    await nettoyer()
  })
  group.each.teardown(async () => {
    await nettoyer()
  })

  test('incrémente absent_runs, expire à 3 absences consécutives', async ({ assert }) => {
    await repo.record({
      cleLogique: 'TEST-4',
      nature: 'suggestion',
      statut: 'vu',
      article: 'A1',
      fournisseur: null,
      quantite: 10,
      echeance: null,
    })
    // 1ʳᵉ absence
    await repo.expireAbsents(['AUTRE-CLE'])
    const apres1 = await repo.latestParCle(['TEST-4'])
    assert.equal(apres1.get('TEST-4')?.statut, 'vu')
    // 2ᵉ absence
    await repo.expireAbsents([])
    const apres2 = await repo.latestParCle(['TEST-4'])
    assert.equal(apres2.get('TEST-4')?.statut, 'vu')
    // 3ᵉ absence → expirée
    await repo.expireAbsents([])
    const apres3 = await repo.latestParCle(['TEST-4'])
    assert.isUndefined(apres3.get('TEST-4'))
  })

  test('une clé présente réinitialise le compteur', async ({ assert }) => {
    await repo.record({
      cleLogique: 'TEST-5',
      nature: 'suggestion',
      statut: 'vu',
      article: 'A1',
      fournisseur: null,
      quantite: 10,
      echeance: null,
    })
    await repo.expireAbsents([]) // absence 1
    await repo.expireAbsents(['TEST-5']) // retour → reset
    await repo.expireAbsents([]) // absence 1 (recomptée)
    await repo.expireAbsents([]) // absence 2
    const apres = await repo.latestParCle(['TEST-5'])
    assert.equal(apres.get('TEST-5')?.statut, 'vu')
  })
})
