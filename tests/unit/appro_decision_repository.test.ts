import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ApproDecisionRepository } from '#app/repositories/appro_decision_repository'

/**
 * Ledger de décisions (#134) : append-only (chaque action = une ligne neuve),
 * la plus récente non expirée fait foi, expiration après 3 JOURS sans voir la
 * clé dans la file complète (#112).
 *
 * L'unité est le jour, pas le nombre de chargements de page : la v1 comptait
 * des requêtes HTTP, si bien que trois rafraîchissements expiraient une
 * décision. Les tests d'ancienneté écrivent donc `last_seen_at` directement.
 *
 * Clés sentinelles `TEST-…` pour ne jamais toucher une vraie décision ; la
 * table est nettoyée à la fin de chaque test.
 */

const repo = new ApproDecisionRepository()
const conn = db.connection()

const nettoyer = async () => {
  await conn.from('appro_decision_ledger').where('cle_logique', 'like', 'TEST-%').delete()
}

const jourIso = (decalage: number): string =>
  new Date(Date.now() + decalage * 86_400_000).toISOString().slice(0, 10)

const vueLe = async (cle: string, jour: string) => {
  await conn.from('appro_decision_ledger').where('cle_logique', cle).update({ last_seen_at: jour })
}

test.group('ApproDecisionRepository — record', (group) => {
  group.each.setup(nettoyer)
  group.each.teardown(nettoyer)

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
    // Décidée depuis la file : elle y est, donc vue aujourd'hui.
    assert.equal(row.lastSeenAt, jourIso(0))
    const count = await conn
      .from('appro_decision_ledger')
      .where('cle_logique', 'TEST-1')
      .count('* as n')
    assert.equal(Number((count[0] as { n: number }).n), 1)
  })
})

test.group('ApproDecisionRepository — latestParCle', (group) => {
  group.each.setup(nettoyer)
  group.each.teardown(nettoyer)

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

  test('rend l’instantané (échéance, quantité) qui sert la tolérance #112', async ({ assert }) => {
    await repo.record({
      cleLogique: 'TEST-2b',
      nature: 'suggestion',
      statut: 'a_passer',
      article: 'A1',
      fournisseur: 'F1',
      quantite: 3024,
      echeance: '2026-09-01',
    })
    const parCle = await repo.latestParCle(['TEST-2b'])
    const row = parCle.get('TEST-2b')
    assert.equal(row?.quantite, 3024)
    assert.equal(row?.echeance, '2026-09-01')
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

test.group('ApproDecisionRepository — présence et expiration', (group) => {
  group.each.setup(nettoyer)
  group.each.teardown(nettoyer)

  const decide = (cle: string) =>
    repo.record({
      cleLogique: cle,
      nature: 'suggestion',
      statut: 'vu',
      article: 'A1',
      fournisseur: null,
      quantite: 10,
      echeance: null,
    })

  test('trois chargements le même jour n’expirent rien (régression du compteur de runs)', async ({
    assert,
  }) => {
    await decide('TEST-4')
    for (let i = 0; i < 3; i += 1) {
      await repo.marqueVues(['AUTRE-CLE'], jourIso(0))
      await repo.expireNonVues(jourIso(0))
    }
    const apres = await repo.latestParCle(['TEST-4'])
    assert.equal(apres.get('TEST-4')?.statut, 'vu')
  })

  test('expire une clé qu’on n’a plus vue depuis 3 jours', async ({ assert }) => {
    await decide('TEST-5')
    await vueLe('TEST-5', jourIso(-4))
    const expirees = await repo.expireNonVues(jourIso(0))
    assert.isAbove(expirees, 0)
    const parCle = await repo.latestParCle(['TEST-5'])
    assert.isUndefined(parCle.get('TEST-5'))
  })

  test('garde une clé absente depuis moins de 3 jours', async ({ assert }) => {
    await decide('TEST-6')
    await vueLe('TEST-6', jourIso(-2))
    await repo.expireNonVues(jourIso(0))
    const parCle = await repo.latestParCle(['TEST-6'])
    assert.equal(parCle.get('TEST-6')?.statut, 'vu')
  })

  test('une clé revue repart de zéro', async ({ assert }) => {
    await decide('TEST-7')
    await vueLe('TEST-7', jourIso(-2))
    await repo.marqueVues(['TEST-7'], jourIso(0))
    await repo.expireNonVues(jourIso(0))
    const parCle = await repo.latestParCle(['TEST-7'])
    assert.equal(parCle.get('TEST-7')?.statut, 'vu')
  })

  test('marquer une clé n’affecte pas les autres', async ({ assert }) => {
    await decide('TEST-8')
    await decide('TEST-9')
    await vueLe('TEST-8', jourIso(-4))
    await vueLe('TEST-9', jourIso(-4))
    await repo.marqueVues(['TEST-9'], jourIso(0))
    await repo.expireNonVues(jourIso(0))
    const parCle = await repo.latestParCle(['TEST-8', 'TEST-9'])
    assert.isUndefined(parCle.get('TEST-8'))
    assert.equal(parCle.get('TEST-9')?.statut, 'vu')
  })
})

test.group('ApproDecisionRepository — dernieresNonExpirees (auto-évaluation lot 2)', (group) => {
  group.each.setup(nettoyer)
  group.each.teardown(nettoyer)

  const record = (cle: string, statut: 'vu' | 'ignorer', cause?: string) =>
    repo.record({
      cleLogique: cle,
      nature: 'message',
      statut,
      article: 'A1',
      fournisseur: 'F1',
      quantite: 10,
      echeance: null,
      causePredit: cause ?? null,
      confiancePredit: cause === undefined ? null : 0.9,
      verdictPredit: 'replanifier',
    })

  test('une clé re-décidée n’est comptée qu’une fois, avec sa DERNIÈRE décision', async ({
    assert,
  }) => {
    await record('TEST-AE-1', 'vu', 'stock')
    await record('TEST-AE-1', 'ignorer', 'stock')

    const lignes = await repo.dernieresNonExpirees()
    const ae1 = lignes.filter((l) => l.cleLogique === 'TEST-AE-1')

    // Append-only : deux lignes en base, mais une seule décision courante.
    assert.equal(ae1.length, 1)
    assert.equal(ae1[0].statut, 'ignorer')
    assert.equal(ae1[0].causePredit, 'stock')
  })

  test('les clés distinctes sont toutes rendues', async ({ assert }) => {
    await record('TEST-AE-2', 'vu', 'stock')
    await record('TEST-AE-3', 'ignorer', 'appro')

    const lignes = await repo.dernieresNonExpirees()

    assert.equal(lignes.filter((l) => l.cleLogique === 'TEST-AE-2').length, 1)
    assert.equal(lignes.filter((l) => l.cleLogique === 'TEST-AE-3').length, 1)
  })
})
