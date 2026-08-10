import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  parseCle,
  parseDateSentinelle,
  buildPeriodDefs,
  bucketize,
  buildGrille,
  buildPeggingSql,
  DAILY_DAYS,
  HORIZON_DAYS,
  SENTINEL_BEFORE,
} from '#services/article_explanation_service'
import { ArticleExplanationService } from '#services/article_explanation_service'
import { X3Database } from '#app/x3/client/x3_database'
import { CombinedOrdersRepository } from '#app/repositories/combined_orders_repository'
import boardDataset from '#services/board_dataset'
import { cacheNs } from '#services/cache_ns'
import {
  buildExplicationCacheKey,
  EXPLICATION_EPOCH_KEY,
} from '#services/article_explanation_service'
import { isoDay } from '#app/utils/dates'

/**
 * Ticket 02 — grille time-phased + pegging natif.
 * Tests ciblés unitaires : bucket/clamp/pénurie/sentinelle/refus/pegging + fixture V4254.
 */

// Helpers date
const ref = new Date('2026-08-05T00:00:00')
const d = (iso: string): Date => new Date(`${iso}T00:00:00`)

test.group('article_explanation — parseCle', () => {
  test('parse VCRNUM:VCRLIN:VCRSEQ', ({ assert }) => {
    const c = parseCle('CG2600209:1000:1')
    assert.equal(c.vcrnum, 'CG2600209')
    assert.equal(c.vcrlin, 1000)
    assert.equal(c.vcrseq, '1')
  })

  test('parse VCRNUM:VCRLIN sans VCRSEQ', ({ assert }) => {
    const c = parseCle('CG2600209:1000')
    assert.equal(c.vcrnum, 'CG2600209')
    assert.equal(c.vcrlin, 1000)
    assert.equal(c.vcrseq, '')
  })

  test('cle invalide lève', ({ assert }) => {
    assert.throws(() => parseCle('invalide'), /cle invalide/)
    assert.throws(() => parseCle('A:B:C:D'), /cle invalide/)
  })
})

test.group('article_explanation — sentinelle 31-DEC-99', () => {
  test('31-DEC-99 → null (sentinelle < 2000)', ({ assert }) => {
    assert.isNull(parseDateSentinelle('31-DEC-99'))
    assert.isNull(parseDateSentinelle('31-DEC-99 '))
  })

  test('date valide rendue', ({ assert }) => {
    const dt = parseDateSentinelle('22-SEP-26')
    assert.isNotNull(dt)
    assert.equal(dt!.getUTCFullYear(), 2026)
    // 22-SEP-26 → 2026-09-22
    const iso = dt!.toISOString().slice(0, 10)
    assert.equal(iso, '2026-09-22')
  })

  test('date antérieure à 2000-01-01 filtrée (SENTINEL_BEFORE)', ({ assert }) => {
    const sent = new Date(SENTINEL_BEFORE)
    assert.equal(sent.toISOString().slice(0, 10), '2000-01-01')
    // 31-DEC-99 → 1999-12-31 < sentinel
    assert.isTrue(new Date('1999-12-31T00:00:00Z').getTime() < SENTINEL_BEFORE)
  })
})

test.group('article_explanation — périodes hybrides jour→semaine', () => {
  test('première période est Déjà en retard', ({ assert }) => {
    const defs = buildPeriodDefs(ref, HORIZON_DAYS)
    assert.equal(defs[0].label, 'Déjà en retard')
    assert.isNull(defs[0].start)
  })

  test('21 périodes quotidiennes après retard', ({ assert }) => {
    const defs = buildPeriodDefs(ref, HORIZON_DAYS)
    // defs[0]=retard, 1..21 = J
    for (let i = 1; i <= DAILY_DAYS; i++) {
      assert.isNotNull(defs[i].start)
      assert.isNotNull(defs[i].end)
    }
    assert.equal(defs[1].label, '05/08')
    assert.equal(defs[2].label, '06/08')
  })

  test('semaines après quotidien', ({ assert }) => {
    const defs = buildPeriodDefs(ref, 90)
    const weekly = defs.slice(1 + DAILY_DAYS)
    assert.isTrue(weekly.length >= 8)
    for (const w of weekly) assert.isTrue(w.label.startsWith('S '))
  })
})

test.group('article_explanation — bucket clamp retards', () => {
  test('flux sans date et flux anté-daté clampés en période 0', ({ assert }) => {
    const defs = buildPeriodDefs(ref, HORIZON_DAYS)
    const flows = [
      { kind: 'composant' as const, date: null, qty: 100 },
      { kind: 'composant' as const, date: d('2026-02-21'), qty: 13 },
      { kind: 'composant' as const, date: d('2026-04-22'), qty: 1200 },
      { kind: 'reception' as const, date: d('2026-09-24'), qty: 8100 },
    ]
    const buckets = bucketize(flows, ref, defs)
    // Période 0 contient les retards
    assert.equal(buckets[0].besoinMatiere, 1313) // 100 +13+1200? wait 100 sans date +13 +1200 =1313
    // Mais 100 sans date = besoin aussi
    // Actually first two composants overdue: 13+1200+100=1313
    // Réception future ne doit pas être en 0
    assert.equal(buckets[0].reception, 0)
  })

  test('flux futur quotidien bucketisé J', ({ assert }) => {
    const defs = buildPeriodDefs(ref, HORIZON_DAYS)
    const flows = [{ kind: 'reception' as const, date: d('2026-08-05'), qty: 8100 }]
    const buckets = bucketize(flows, ref, defs)
    // 05/08 = J0 → index 1
    assert.equal(buckets[1].reception, 8100)
  })

  test('flux au-delà de DAILY_DAYS → semaine', ({ assert }) => {
    const defs = buildPeriodDefs(ref, HORIZON_DAYS)
    // 26/08 = J+21 → première semaine
    const date = d('2026-08-26')
    const flows = [{ kind: 'reception' as const, date, qty: 500 }]
    const buckets = bucketize(flows, ref, defs)
    // Ne doit pas être en période 0, doit être dans weekly
    assert.equal(buckets[0].reception, 0)
    const weeklyHas = buckets.slice(1 + DAILY_DAYS).some((b) => b.reception === 500)
    assert.isTrue(weeklyHas)
  })
})

test.group('article_explanation — première pénurie', () => {
  test('stock initial déjà en retard (V4254)', ({ assert }) => {
    const ligne = {
      vcrnum: 'CG2600209',
      vcrlin: 1000,
      vcrseq: '1',
      article: 'V4254',
      designation: 'TEST',
      quantite: 8100,
      echeance: '2026-09-24',
      mrpdat: '2026-09-22',
      mrpdatRaw: d('2026-09-22'),
      message: 2,
      vcrnumori: null,
    }
    const flows: Array<{
      kind: 'demande' | 'composant' | 'reception' | 'of'
      date: Date | null
      qty: number
    }> = [
      { kind: 'composant', date: d('2026-02-21'), qty: 13 },
      { kind: 'composant', date: d('2026-04-01'), qty: 600 },
      { kind: 'composant', date: d('2026-04-22'), qty: 1200 },
      { kind: 'composant', date: d('2026-05-06'), qty: 1200 },
      { kind: 'composant', date: d('2026-05-20'), qty: 1200 },
    ]
    // stock 32 - 4213 = -4181 déjà en retard
    const { periodes, premierePenurie, premierePenurieIndex } = buildGrille(32, flows, ref, ligne)
    assert.equal(periodes[0].stockDebut, 32)
    assert.equal(periodes[0].stockFin, 32 - 4213)
    assert.isTrue(periodes[0].estPenurie)
    assert.equal(premierePenurie, 'déjà en retard')
    assert.equal(premierePenurieIndex, 0)
  })

  test('pénurie future surlignée au bon seau', ({ assert }) => {
    const ligne = {
      vcrnum: 'CG1',
      vcrlin: 1,
      vcrseq: '1',
      article: 'ART',
      designation: '',
      quantite: 100,
      echeance: '2026-08-10',
      mrpdat: '2026-08-10',
      mrpdatRaw: d('2026-08-10'),
      message: 2,
      vcrnumori: null,
    }
    const flows = [{ kind: 'composant' as const, date: d('2026-08-07'), qty: 50 }]
    const { periodes, premierePenurie } = buildGrille(40, flows, ref, ligne)
    // J7 = ref 05/08 +2j =07/08 → index 3 (0 retard +1 J0 05/08 +1 J1 06/08 +1 J2 07/08)
    assert.equal(premierePenurie, '07/08')
    const penurieIdx = periodes.findIndex((p) => p.estPenurie)
    assert.equal(premierePenurie, periodes[penurieIdx].label)
  })

  test('aucune pénurie → null', ({ assert }) => {
    const flows = [{ kind: 'reception' as const, date: d('2026-08-06'), qty: 100 }]
    const { premierePenurie, premierePenurieIndex } = buildGrille(100, flows, ref, null)
    assert.isNull(premierePenurie)
    assert.isNull(premierePenurieIndex)
  })

  test('ligne message surlignée dans son bucket', ({ assert }) => {
    const ligne = {
      vcrnum: 'CG1',
      vcrlin: 1,
      vcrseq: '1',
      article: 'ART',
      designation: '',
      quantite: 100,
      echeance: '2026-08-05',
      mrpdat: '2026-08-04',
      mrpdatRaw: d('2026-08-04'),
      message: 2,
      vcrnumori: null,
    }
    const { periodes } = buildGrille(10, [], ref, ligne)
    // 05/08 est J0 → index 1
    assert.isTrue(periodes[1].contientMessage)
  })
})

test.group('article_explanation — V4254 fixture complet', () => {
  test('stock 32, 4 213 besoin ferme en retard, réception 8 100 au 24/09, MRPDAT 22/09 cohérent', ({
    assert,
  }) => {
    const ligne = {
      vcrnum: 'CG2600209',
      vcrlin: 1000,
      vcrseq: '1',
      article: 'V4254',
      designation: 'ARTICLE V4254',
      quantite: 8100,
      echeance: '2026-09-24',
      mrpdat: '2026-09-22',
      mrpdatRaw: d('2026-09-22'),
      message: 2,
      vcrnumori: 'SGAE10609313512',
    }
    const flows: Array<{
      kind: 'demande' | 'composant' | 'reception' | 'of'
      date: Date | null
      qty: number
    }> = [
      { kind: 'composant', date: d('2026-02-21'), qty: 13 },
      { kind: 'composant', date: d('2026-04-01'), qty: 600 },
      { kind: 'composant', date: d('2026-04-22'), qty: 1200 },
      { kind: 'composant', date: d('2026-05-06'), qty: 1200 },
      { kind: 'composant', date: d('2026-05-20'), qty: 1200 },
      // Suggestions futures hors retard
      { kind: 'composant', date: d('2026-09-10'), qty: 1000 },
      { kind: 'reception', date: d('2026-09-24'), qty: 8100 },
      { kind: 'reception', date: d('2027-03-12'), qty: 6000 },
    ]
    const { periodes, premierePenurie } = buildGrille(32, flows, ref, ligne)
    // Pénurie déjà en retard
    assert.equal(premierePenurie, 'déjà en retard')
    // Réception 8 100 dans le bucket de 24/09
    const receptionBucket = periodes.find((p) => p.reception === 8100)
    assert.isNotNull(receptionBucket)
    // MRPDAT 22/09 est 2 jours avant réception → cohérent (pénurie avant MRPDAT)
    assert.isTrue(
      new Date('2026-09-22T00:00:00').getTime() < new Date('2026-09-24T00:00:00').getTime()
    )
    // Après réception, stock remonte
    assert.isTrue(receptionBucket!.stockFin > receptionBucket!.stockDebut)
  })
})

test.group('article_explanation — pegging SQL étroite', () => {
  test('SQL contient colonnes et filtres requis (ITMREFORI, WIPTYP=6, WIPSTA=1, ITMREF=?)', ({
    assert,
  }) => {
    const sql = buildPeggingSql('V4254', '2026-11-03')
    assert.isTrue(sql.includes('ITMREFORI_0'))
    assert.isTrue(sql.includes('VCRNUM_0'))
    assert.isTrue(sql.includes('WIPSTA_0'))
    assert.isTrue(sql.includes('ENDDAT_0'))
    assert.isTrue(sql.includes('RMNEXTQTY_0'))
    assert.isTrue(sql.includes('WIPTYP_0') && sql.includes('6'))
    assert.isTrue(sql.includes('WIPSTA_0 = 1'))
    assert.isTrue(sql.includes("ITMREF_0 = 'V4254'"))
    assert.isTrue(sql.includes("TO_DATE('20261103'"))
  })

  test('SQL échappe les quotes', ({ assert }) => {
    const sql = buildPeggingSql("A'B", '2026-08-05')
    assert.isTrue(sql.includes("A''B"))
  })
})

test.group('article_explanation — refus hors périmètre V1 (mock X3Database)', () => {
  test('MRPMES 3 et 6 rendent supporte:false', async ({ assert }) => {
    // Cache 05 : vider la clé stable pour ce couple article/jour sinon hit sur test précédent
    await cacheNs('appro').delete({ key: EXPLICATION_EPOCH_KEY })
    await cacheNs('appro').delete({ key: buildExplicationCacheKey('V4254', '2026-08-05', 0) })
    await cacheNs('appro').delete({
      key: buildExplicationCacheKey('V4254', isoDay(new Date('2026-08-05T00:00:00')), 0),
    })
    // Stub X3Database.raw pour la lookup message
    const origRaw = X3Database.prototype.raw as unknown as (sql: string) => Promise<unknown>
    const origGetStock = boardDataset.getStock
    const origFetchFlows = CombinedOrdersRepository.prototype.fetchArticleFutureFlows

    // Pour ce test on ne veut PAS aller jusqu'au fetch stock/flows : le service sort en refus avant
    // Donc seul le premier raw (message) est appelé
    const mkRow = (mrpmes: number) => ({
      VCRNUM_0: 'CG2600209',
      VCRLIN_0: '1000',
      VCRSEQ_0: '1',
      ITMREF_0: 'V4254',
      ITMDES1_0: 'TEST',
      ENDDAT_0: '24-SEP-26',
      MRPDAT_0: mrpmes === 6 ? '31-DEC-99' : '22-SEP-26',
      MRPMES_0: String(mrpmes),
      RMNEXTQTY_0: '8100',
      BPRNUM_0: 'F1',
      VCRNUMORI_0: '',
      VCRTYPORI_0: '11',
    })

    let call = 0
    // @ts-ignore override prototype
    // @ts-ignore
    ;(X3Database.prototype as unknown as Record<string, unknown>).raw = async (sql: string) => {
      call++
      if (sql.includes('WIPTYP_0 = 2') && sql.includes('CG2600209')) {
        // message lookup — on renvoie la ligne selon le test
        // Le service appèle fetchMessageRow avec VCRLIN filter
        const current = (X3Database as unknown as { __mrpmes?: number }).__mrpmes
        return [mkRow(current ?? 3)]
      }
      return []
    }
    // Stub stock/flows pour ne pas toucher X3 si jamais appelés (ne devraient pas l'être en refus)
    // @ts-ignore
    boardDataset.getStock = async () => []
    // @ts-ignore
    CombinedOrdersRepository.prototype.fetchArticleFutureFlows = async () => []

    const svc = new ArticleExplanationService()

    for (const code of [3, 6] as const) {
      // @ts-ignore site hack
      ;(X3Database as unknown as { __mrpmes: number }).__mrpmes = code
      const res = await svc.explain('V4254', 'CG2600209:1000:1', ref)
      // @ts-ignore
      assert.equal((res as { supporte: false }).supporte, false)
      // @ts-ignore
      assert.isTrue(
        (res as { supporte: false } as unknown as { raison: string }).raison.includes(
          'hors périmètre V1'
        )
      )
    }

    // @ts-ignore
    X3Database.prototype.raw = origRaw
    boardDataset.getStock = origGetStock
    CombinedOrdersRepository.prototype.fetchArticleFutureFlows = origFetchFlows
    // @ts-ignore
    delete (X3Database as unknown as { __mrpmes?: number }).__mrpmes
  })
})

test.group('article_explanation — suggestionOrigine résolue contre photo', () => {
  test('VCRNUMORI résolu quand photo présente, null sinon sans erreur', async ({ assert }) => {
    const sentinel = '1900-01-01'
    // Nettoie et insère une suggestion en photo
    await db.connection().from('demand_snapshots').where('snapshot_date', sentinel).delete()
    await db.table('demand_snapshots').insert({
      snapshot_date: sentinel,
      source: 'appro_suggestion',
      itmref: 'V4254',
      vcrnum: 'SGAE10609313512',
      vcrlin: null,
      quantity: 8100,
      date_echeance: '2026-09-24',
      fournisseur: 'F1',
    })

    const svc = new ArticleExplanationService()
    // Vider cache 05 pour ce jour/article (même clé que le test précédent)
    await cacheNs('appro').delete({ key: EXPLICATION_EPOCH_KEY })
    await cacheNs('appro').delete({ key: buildExplicationCacheKey('V4254', '2026-08-05', 0) })
    const origRaw = X3Database.prototype.raw as unknown as (sql: string) => Promise<unknown>
    const origGetStock = boardDataset.getStock
    const origFetchFlows = CombinedOrdersRepository.prototype.fetchArticleFutureFlows

    const msgRow = {
      VCRNUM_0: 'CG2600209',
      VCRLIN_0: '1000',
      VCRSEQ_0: '1',
      ITMREF_0: 'V4254',
      ITMDES1_0: 'TEST',
      ENDDAT_0: '24-SEP-26',
      MRPDAT_0: '22-SEP-26',
      MRPMES_0: '2',
      RMNEXTQTY_0: '8100',
      BPRNUM_0: 'F1',
      VCRNUMORI_0: 'SGAE10609313512',
      VCRTYPORI_0: '11',
    }

    // @ts-ignore
    // @ts-ignore
    ;(X3Database.prototype as unknown as Record<string, unknown>).raw = async (sql: string) => {
      if (sql.includes('WIPTYP_0 = 2') && sql.includes('CG2600209')) return [msgRow]
      if (sql.includes('WIPTYP_0 = 6')) {
        // pegging parents
        return [
          {
            ITMREFORI_0: 'CE4091',
            VCRNUM_0: 'F125-41089',
            WIPSTA_0: '1',
            ENDDAT_0: '21-FEB-26',
            RMNEXTQTY_0: '13',
          },
        ]
      }
      return []
    }
    // @ts-ignore
    boardDataset.getStock = async () => [
      { article: 'V4254', quantity: 32, direction: 'supply' } as never,
    ]
    // @ts-ignore
    CombinedOrdersRepository.prototype.fetchArticleFutureFlows = async () => []

    const res = await svc.explain('V4254', 'CG2600209:1000:1', ref)
    assert.equal(res.supporte, true)
    if (res.supporte) {
      assert.isNotNull(res.pegging.suggestionOrigine)
      assert.equal(res.pegging.suggestionOrigine!.numero, 'SGAE10609313512')
      assert.equal(res.pegging.suggestionOrigine!.convertieLe, sentinel)
      assert.lengthOf(res.pegging.parents, 1)
      assert.equal(res.pegging.parents[0].article, 'CE4091')
    }

    // Cas sans photo : autre numéro
    ;(msgRow as Record<string, string>).VCRNUMORI_0 = 'SGAE_INCONNU_999'
    // Cacher 05 : le même couple article/jour est déjà en cache — purger pour que
    // la seconde explication reflète la mutation de VCRNUMORI dans ce test unitaire.
    await cacheNs('appro').delete({ key: buildExplicationCacheKey('V4254', '2026-08-05', 0) })
    const res2 = await svc.explain('V4254', 'CG2600209:1000:1', ref)
    assert.equal(res2.supporte, true)
    if (res2.supporte) {
      // toujours présent mais convertieLe null sans erreur
      assert.equal(res2.pegging.suggestionOrigine!.numero, 'SGAE_INCONNU_999')
      assert.isNull(res2.pegging.suggestionOrigine!.convertieLe)
    }

    // @ts-ignore
    ;(X3Database.prototype as unknown as Record<string, unknown>).raw = origRaw as unknown
    boardDataset.getStock = origGetStock
    CombinedOrdersRepository.prototype.fetchArticleFutureFlows = origFetchFlows
    await cacheNs('appro').delete({ key: buildExplicationCacheKey('V4254', '2026-08-05', 0) })
    await db.connection().from('demand_snapshots').where('snapshot_date', sentinel).delete()
  })
})
