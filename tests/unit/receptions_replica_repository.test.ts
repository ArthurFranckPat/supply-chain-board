import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import receptionsReplicaRepository from '#repositories/receptions_replica_repository'

/**
 * Lecture `receptions_replica` (#98, suite lot 3).
 *
 * Même discipline que `orders_replica_repository.test.ts` : la connexion `replica`
 * pointe le même fichier en test qu'en dev, les lignes de test portent un `uuid`
 * préfixé `TEST-` et sont supprimées par ce filtre en sortie.
 */

const UUIDS = ['TEST-RCP-A', 'TEST-RCP-B']

test.group('ReceptionsReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('receptions_replica').whereIn('uuid', UUIDS).delete()
  })

  test('mappe une ligne réplique vers Flow (reception)', async ({ assert }) => {
    await conn.table('receptions_replica').insert({
      uuid: 'TEST-RCP-A',
      num_commande: 'CG000123',
      article: 'ART-1',
      quantity: 42,
      date: '2026-08-05',
      supplier: 'Fournisseur Test',
      designation: 'Vis 6x30',
      date_commande: '2026-07-20',
      qte_commandee: 100,
    })

    const flows = await receptionsReplicaRepository.getReceptionFlows()
    const f = flows.find((x) => x.origin.type === 'reception' && x.origin.id === 'CG000123')

    assert.isDefined(f)
    assert.deepEqual(f, {
      article: 'ART-1',
      quantity: 42,
      direction: 'supply',
      date: new Date('2026-08-05T00:00:00'),
      origin: {
        type: 'reception',
        id: 'CG000123',
        supplier: 'Fournisseur Test',
        designation: 'Vis 6x30',
        categorie: null,
        dateCommande: new Date('2026-07-20T00:00:00'),
        qteCommandee: 100,
        firm: true,
      },
    })
  })

  test('date/date_commande null quand la colonne est vide', async ({ assert }) => {
    await conn.table('receptions_replica').insert({
      uuid: 'TEST-RCP-B',
      num_commande: 'CG000456',
      article: 'ART-2',
      quantity: 5,
      date: null,
      supplier: null,
      designation: null,
      date_commande: null,
      qte_commandee: 5,
    })

    const flows = await receptionsReplicaRepository.getReceptionFlows()
    const f = flows.find((x) => x.origin.type === 'reception' && x.origin.id === 'CG000456')

    assert.isDefined(f)
    assert.isNull(f!.date)
    assert.isNull((f!.origin as { dateCommande: Date | null }).dateCommande)
    assert.equal((f!.origin as { supplier: string }).supplier, '')
  })
})
