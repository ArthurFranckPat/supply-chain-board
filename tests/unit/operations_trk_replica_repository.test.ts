import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import operationsTrkReplicaRepository from '#repositories/operations_trk_replica_repository'
import { operationsTrkWindow } from '#services/replica_sync_service'

/**
 * Lecture `operations_trk_replica` (#119, lot 1). Même discipline que les autres
 * tests réplique : `num_of` de test préfixés `TESTOF-TRK-`, nettoyés en sortie.
 * La connexion `replica` pointe le même fichier en test qu'en dev (pas de
 * `.env.test` dans ce dépôt) et peut contenir des DONNÉES RÉELLES ingérées :
 * les assertions filtrent donc sur les lignes de test, jamais sur un compte de
 * lignes total. Postes fictifs `ZZ_*` pour la même raison.
 */

const NUMS = ['TESTOF-TRK-A', 'TESTOF-TRK-B']

function row(
  over: Record<string, string | number | null> = {}
): Record<string, string | number | null> {
  return {
    num_of: 'TESTOF-TRK-A',
    openum: 10,
    iptdat: '2026-07-01',
    cplwst: 'ZZ_093',
    cplqty: 100,
    rejcplqty: 0,
    opetim: 3.5,
    settim: 0.5,
    itmref: 'GAMME-X',
    itmref_of: 'ART-1',
    empnum: 'EMP-1',
    x4panflg: 0,
    x4arretprod: 0,
    xequipe: '8',
    ...over,
  }
}

test.group('OperationsTrkReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('operations_trk_replica').whereIn('num_of', NUMS).delete()
  })

  test('borne basse inclusive, borne haute exclusive', async ({ assert }) => {
    await conn
      .table('operations_trk_replica')
      .insert([
        row({ iptdat: '2026-06-30' }),
        row({ iptdat: '2026-07-01' }),
        row({ iptdat: '2026-07-02' }),
      ])

    const toutes = await operationsTrkReplicaRepository.getPointages('2026-07-01', '2026-07-02')
    const rows = toutes.filter((r) => r.numOf === 'TESTOF-TRK-A')

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].iptdat, '2026-07-01')
  })

  test('le filtre poste est une égalité stricte — aucun regroupement', async ({ assert }) => {
    await conn
      .table('operations_trk_replica')
      .insert([row({ cplwst: 'ZZ_093' }), row({ cplwst: 'ZZ_0931' }), row({ cplwst: 'ZZ_09' })])

    const rows = await operationsTrkReplicaRepository.getPointages(
      '2026-01-01',
      '2027-01-01',
      'ZZ_093'
    )

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].cplwst, 'ZZ_093')
  })

  test('les colonnes hors périmètre v1 ne sont pas exposées', async ({ assert }) => {
    await conn.table('operations_trk_replica').insert([row()])

    const toutes = await operationsTrkReplicaRepository.getPointages('2026-01-01', '2027-01-01')
    const rows = toutes.filter((r) => r.numOf === 'TESTOF-TRK-A')

    assert.lengthOf(rows, 1)
    // Matricule, panne, arrêt, équipe, champ « gamme », VALEUR du rebut :
    // ingérés mais jamais sélectionnés par le lecteur (décision #119). Le fait
    // de rebut, lui, sort en booléen — la règle d'exclusion en a besoin.
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      'cplqty',
      'cplwst',
      'iptdat',
      'itmrefOf',
      'numOf',
      'openum',
      'opetim',
      'rebut',
      'settim',
    ])
  })

  test('le rebut est exposé en booléen, sa valeur reste interne', async ({ assert }) => {
    await conn
      .table('operations_trk_replica')
      .insert([row({ rejcplqty: 4 }), row({ num_of: 'TESTOF-TRK-B', rejcplqty: 0 })])

    const rows = await operationsTrkReplicaRepository.getPointages('2026-01-01', '2027-01-01')

    const avecRebut = rows.find((r) => r.numOf === 'TESTOF-TRK-A')
    const sansRebut = rows.find((r) => r.numOf === 'TESTOF-TRK-B')
    assert.isTrue(avecRebut?.rebut)
    assert.isFalse(sansRebut?.rebut)
    // La quantité de rebut ne fuit nulle part dans la ligne exposée.
    assert.notProperty(avecRebut!, 'rejcplqty')
  })

  test('getDistinctWorkstations rend les codes bruts ayant pointé', async ({ assert }) => {
    await conn
      .table('operations_trk_replica')
      .insert([
        row({ cplwst: 'ZZ_093' }),
        row({ cplwst: 'ZZ_093', iptdat: '2026-07-02' }),
        row({ cplwst: 'ZZ_MECA' }),
      ])

    const postes = await operationsTrkReplicaRepository.getDistinctWorkstations(
      '2026-01-01',
      '2027-01-01'
    )

    // Le filtrage des codes alphabétiques est une règle domaine, pas un silence
    // de requête : ZZ_MECA DOIT ressortir ici. `includes` et non égalité stricte :
    // la réplique peut porter des données réelles à côté des lignes de test.
    assert.include(postes, 'ZZ_093')
    assert.include(postes, 'ZZ_MECA')
  })
})

test.group('operationsTrkWindow', () => {
  test('fenêtre 6 mois glissants, bornes à minuit local', ({ assert }) => {
    const now = new Date(2026, 7, 3, 15, 30, 0) // 03/08/2026 15:30

    const { from, to } = operationsTrkWindow(now)

    assert.equal(from.getFullYear(), 2026)
    assert.equal(from.getMonth(), 1) // février
    assert.equal(from.getDate(), 3)
    assert.equal(from.getHours(), 0)
    assert.equal(to.getFullYear(), 2026)
    assert.equal(to.getMonth(), 7) // août
    assert.equal(to.getDate(), 3)
    assert.equal(to.getHours(), 0)
  })
})
