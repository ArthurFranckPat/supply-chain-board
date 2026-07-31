import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import stockFluxReplicaRepository from '#repositories/stock_flux_replica_repository'

/**
 * Lecture `stock_flux_replica` (#98, lot 3 — scoping du 30/07/2026).
 *
 * Même précaution que les autres repos réplique : la connexion `replica`
 * pointe le même fichier en test qu'en dev (une vraie ingestion `--only=stock-flux`
 * peut y avoir tourné). Article marqueur `ART-FLUX-TEST` (n'existe pas dans le
 * référentiel réel), teardown filtré dessus, jamais un DELETE sans filtre.
 */

const ARTICLE = 'ART-FLUX-TEST'

test.group('StockFluxReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('stock_flux_replica').where('article', ARTICLE).delete()
  })

  test('mappe une ligne réplique vers StockFluxDocRow', async ({ assert }) => {
    await conn.table('stock_flux_replica').insert({
      article: ARTICLE,
      jour: '2026-07-15',
      vcrtyp: '6',
      vcrnum: 'REC2607AE100099',
      net_doc: 42.5,
    })

    const rows = await stockFluxReplicaRepository.getFluxNetByDocument(
      new Date('2026-07-01T00:00:00'),
      new Date('2026-07-31T00:00:00')
    )
    const ours = rows.filter((r) => r.article === ARTICLE)

    assert.lengthOf(ours, 1)
    assert.deepEqual(ours[0], {
      article: ARTICLE,
      // UTC, pas heure locale : cf. commentaire de `toOwn()` — doit matcher
      // `periodKey()` côté stock_valuation_repository (bucketing UTC).
      jour: new Date('2026-07-15T00:00:00Z'),
      vcrtyp: '6',
      vcrnum: 'REC2607AE100099',
      netDoc: 42.5,
    })
  })

  test('filtre sur jour ∈ [from, to] inclusif', async ({ assert }) => {
    await conn.table('stock_flux_replica').insert([
      {
        article: ARTICLE,
        jour: '2026-06-30',
        vcrtyp: '1',
        vcrnum: 'OUT1',
        net_doc: -1,
      },
      {
        article: ARTICLE,
        jour: '2026-07-01',
        vcrtyp: '1',
        vcrnum: 'IN1',
        net_doc: 10,
      },
      {
        article: ARTICLE,
        jour: '2026-07-31',
        vcrtyp: '1',
        vcrnum: 'IN2',
        net_doc: 20,
      },
      {
        article: ARTICLE,
        jour: '2026-08-01',
        vcrtyp: '1',
        vcrnum: 'OUT2',
        net_doc: -2,
      },
    ])

    const rows = await stockFluxReplicaRepository.getFluxNetByDocument(
      new Date('2026-07-01T00:00:00'),
      new Date('2026-07-31T00:00:00')
    )
    const ours = rows.filter((r) => r.article === ARTICLE)

    assert.deepEqual(ours.map((r) => r.vcrnum).sort(), ['IN1', 'IN2'])
  })

  test('jour reste sur le bon jour calendaire même en fuseau UTC+ (régression)', async ({
    assert,
  }) => {
    // CI tourne probablement en TZ=UTC, où heure locale = heure UTC — ce test ne
    // distinguerait alors PAS un parsing local d'un parsing UTC correct. On force
    // `TZ` pour la durée du test : c'est en UTC+1/+2 (déploiement France) que
    // `new Date('...T00:00:00')` (heure locale, SANS le `Z` de `toOwn()`) recule
    // d'un jour par rapport à minuit UTC — exactement le bug visé.
    const previousTz = process.env.TZ
    process.env.TZ = 'Europe/Paris'
    try {
      // 1er janvier : une régression vers l'heure locale ferait reculer ce jour
      // en 31 décembre de l'année précédente — un mois ET une année faux, pas
      // seulement un jour, donc impossible à rater si ça régresse.
      await conn.table('stock_flux_replica').insert({
        article: ARTICLE,
        jour: '2026-01-01',
        vcrtyp: '1',
        vcrnum: 'BOUNDARY',
        net_doc: 5,
      })

      const rows = await stockFluxReplicaRepository.getFluxNetByDocument(
        new Date('2025-12-01T00:00:00Z'),
        new Date('2026-01-31T00:00:00Z')
      )
      const row = rows.find((r) => r.vcrnum === 'BOUNDARY')

      assert.isDefined(row)
      assert.equal(row!.jour.getUTCFullYear(), 2026)
      assert.equal(row!.jour.getUTCMonth(), 0)
      assert.equal(row!.jour.getUTCDate(), 1)
      assert.equal(row!.jour.toISOString(), '2026-01-01T00:00:00.000Z')
    } finally {
      if (previousTz === undefined) delete process.env.TZ
      else process.env.TZ = previousTz
    }
  })

  test('getCoverage : min en UTC, pas heure locale', async ({ assert }) => {
    // `getCoverage()` agrège sur TOUTE la table (pas filtrable par article),
    // donc pas d'assertion sur la valeur exacte — une vraie ingestion peut déjà
    // avoir peuplé la table. On vérifie seulement que la ligne insérée ici
    // (bien plus ancienne que toute donnée réelle plausible) fait bien reculer
    // `min` jusqu'à elle, avec le bon parsing UTC.
    await conn.table('stock_flux_replica').insert({
      article: ARTICLE,
      jour: '2000-01-01',
      vcrtyp: '1',
      vcrnum: 'ANCIENT',
      net_doc: 1,
    })

    const { min } = await stockFluxReplicaRepository.getCoverage()

    assert.isNotNull(min)
    assert.equal(min!.toISOString(), '2000-01-01T00:00:00.000Z')
  })

  // `getLastFullRunAgeMs()` a été retirée de ce repository : la fraîcheur est
  // désormais une question de `ReplicaGate`, pour toutes les tables et avec un
  // seuil par table (#98). Sa couverture vit dans `replica_gate.test.ts` — y
  // compris les cas « run plus récent mais raté / partiel ne compte pas », qui
  // étaient déjà la même règle écrite deux fois.
})
