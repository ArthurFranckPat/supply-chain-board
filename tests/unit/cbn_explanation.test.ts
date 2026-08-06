import { test } from '@japa/runner'
import { diffApproMessageSnapshots } from '#app/domain/cbn_message_diff'
import { diffCbnDrivers } from '#app/domain/cbn_driver_diff'
import { explainCbnMessages } from '#app/domain/cbn_explanation'
import type { CbnMessageDiffEntry } from '#app/domain/cbn_message_diff'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'
import type { ApproMessageSnapshotRow } from '#services/demand_snapshot_service'
import type { DemandSnapshotRow } from '#services/demand_snapshot_service'

const msg = (over: Partial<ApproMessageSnapshotRow>): ApproMessageSnapshotRow => ({
  snapshot_date: '2026-08-06',
  vcrnum: 'CG2601534',
  vcrlin: 6000,
  vcrseq: '1000',
  itmref: 'A7399',
  fournisseur: '16012',
  mrpmes: 2,
  mrpdat: '2026-08-17',
  enddat: '2026-08-19',
  quantity: 14400,
  ...over,
})

const row = (over: Partial<DemandSnapshotRow>): DemandSnapshotRow => ({
  snapshot_date: '2026-08-06',
  source: 'stock',
  itmref: 'A7399',
  vcrnum: null,
  vcrlin: null,
  quantity: 1200,
  date_echeance: null,
  fournisseur: null,
  ...over,
})

test.group('cbn_explanation — avancer', () => {
  test('stock baisse explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers([row({ quantity: 1200 })], [row({ quantity: 740 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 1)
    assert.equal(ex[0].correlations[0].source, 'stock')
    assert.equal(ex[0].contradictions.length, 0)
  })

  test('stock hausse contredit avancer → contradictions', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers([row({ quantity: 740 })], [row({ quantity: 1200 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 0)
    assert.equal(ex[0].contradictions.length, 1)
  })

  test('commande client apparue explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers(
      [],
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('réception retardée explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-05' })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-20' })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'appro'))
  })

  test('sans driver convergent → non expliqué', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2, itmref: 'A1' })])
    const drivers = diffCbnDrivers(
      [row({ itmref: 'A2', quantity: 100 })],
      [row({ itmref: 'A2', quantity: 50 })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 0)
    // Article différent → aucune corrélation
  })

  test('poids décroissant : stock (3) avant demande_prevision (2)', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2, itmref: 'ART' })])
    const drivers = diffCbnDrivers(
      [
        row({ itmref: 'ART', source: 'stock', quantity: 1000 }),
        row({
          itmref: 'ART',
          source: 'demande_prevision',
          quantity: 100,
          date_echeance: '2026-09-01',
        }),
      ],
      [
        row({ itmref: 'ART', source: 'stock', quantity: 500 }),
        row({
          itmref: 'ART',
          source: 'demande_prevision',
          quantity: 200,
          date_echeance: '2026-09-01',
        }),
      ]
    )
    // stock baisse + prévision hausse : deux convergents
    const ex = explainCbnMessages(
      msgs,
      drivers.filter((d) => d.article === 'ART')
    )
    if (ex[0].correlations.length >= 2)
      assert.isTrue(ex[0].correlations[0].poids >= ex[0].correlations[1].poids)
  })
})

test.group('cbn_explanation — retarder et inutile', () => {
  test('stock hausse explique retarder', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 3 })])
    const drivers = diffCbnDrivers([row({ quantity: 740 })], [row({ quantity: 1200 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'stock'))
  })

  test('demande disparue explique retarder', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 3 })])
    const drivers = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('demande disparue explique inutile', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 6, mrpdat: null })])
    const drivers = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('OF disparu explique inutile', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 6, mrpdat: null, itmref: 'OFART' })])
    const drivers = diffCbnDrivers(
      [row({ itmref: 'OFART', source: 'of_ferme', quantity: 100, date_echeance: '2026-09-10' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'of_ferme'))
  })
})

/**
 * Le sens de la corrélation dépend de la NATURE du diff, pas du seul code.
 *
 * Ce qu'on explique est le CHANGEMENT du message. Un message qui s'atténue ou
 * disparaît s'explique par ce qui pousse CONTRE lui — sans quoi la vraie
 * explication finit rangée sous « contradictoire » et la ligne s'affiche
 * « non expliqué ».
 */
test.group('explainCbnMessages — natures qui inversent le sens', () => {
  const stockEnHausse: DriverDiffEntry = {
    article: 'A7399',
    source: 'stock',
    nature: 'quantite',
    quantiteAvant: 740,
    quantiteApres: 1200,
    echeanceAvant: null,
    echeanceApres: null,
    detail: 'Stock 740 → 1 200 (+62 %) — A7399.',
  }

  const messageAvancer = (nature: string): CbnMessageDiffEntry => ({
    nature: nature as CbnMessageDiffEntry['nature'],
    vcrnum: 'CG2601534',
    vcrlin: 6000,
    vcrseq: '1000',
    cle: 'CG2601534:6000:1000',
    article: 'A7399',
    fournisseur: '16012',
    mrpmesAvant: 2,
    mrpmesApres: 2,
    mrpdatAvant: '2026-08-01',
    mrpdatApres: '2026-08-09',
    enddatAvant: '2026-08-16',
    enddatApres: '2026-08-16',
    decalageAvant: -15,
    decalageApres: -7,
    detail: 'Décalage atténué.',
  })

  test('un « avancer » ATTÉNUÉ est expliqué par la hausse de stock', ({ assert }) => {
    const [exp] = explainCbnMessages([messageAvancer('attenuee')], [stockEnHausse])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.correlations[0].source, 'stock')
    assert.lengthOf(exp.contradictions, 0)
  })

  test('le même « avancer » INTENSIFIÉ range la hausse de stock en contradiction', ({ assert }) => {
    const [exp] = explainCbnMessages([messageAvancer('intensifiee')], [stockEnHausse])

    assert.lengthOf(exp.correlations, 0)
    assert.lengthOf(exp.contradictions, 1)
  })

  test('un message DISPARU s’explique aussi par ce qui pousse contre lui', ({ assert }) => {
    const [exp] = explainCbnMessages([messageAvancer('disparue')], [stockEnHausse])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.correlations[0].source, 'stock')
  })

  test('une MODIFICATION de code juge dans le sens du NOUVEAU code, sans inversion', ({
    assert,
  }) => {
    // 2 → 3 : le message est devenu « retarder », et une hausse de stock va bien
    // dans son sens.
    const m = { ...messageAvancer('modifiee'), mrpmesAvant: 2, mrpmesApres: 3 }
    const [exp] = explainCbnMessages([m], [stockEnHausse])

    assert.lengthOf(exp.correlations, 1)
    assert.lengthOf(exp.contradictions, 0)
  })
})

/**
 * Les sorties du CBN ne sont pas des causes.
 *
 * `of_suggestion` et `appro_suggestion` sont recréées à chaque run, au même
 * titre que les messages : les corréler expliquerait un symptôme par un autre
 * symptôme du même calcul.
 */
test.group('explainCbnMessages — sorties du CBN écartées', () => {
  const message: CbnMessageDiffEntry = {
    nature: 'apparue',
    vcrnum: 'CG2601534',
    vcrlin: 6000,
    vcrseq: '1000',
    cle: 'CG2601534:6000:1000',
    article: 'A7399',
    fournisseur: '16012',
    mrpmesAvant: null,
    mrpmesApres: 2,
    mrpdatAvant: null,
    mrpdatApres: '2026-08-09',
    enddatAvant: null,
    enddatApres: '2026-08-16',
    decalageAvant: null,
    decalageApres: -7,
    detail: 'Message apparu.',
  }

  const driver = (source: DriverDiffEntry['source']): DriverDiffEntry => ({
    article: 'A7399',
    source,
    nature: 'apparue',
    quantiteAvant: null,
    quantiteApres: 500,
    echeanceAvant: null,
    echeanceApres: '2026-08-20',
    detail: `${source} apparue.`,
  })

  test('ni corrélation ni contradiction sur of_suggestion et appro_suggestion', ({ assert }) => {
    const [exp] = explainCbnMessages(
      [message],
      [driver('of_suggestion'), driver('appro_suggestion')]
    )

    assert.lengthOf(exp.correlations, 0)
    assert.lengthOf(exp.contradictions, 0)
  })

  test('un OF ferme sur le même article, lui, est bien corrélé', ({ assert }) => {
    const [exp] = explainCbnMessages([message], [driver('of_ferme')])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.correlations[0].poids, 2)
  })
})

test.group('explainCbnMessages — asymétries comblées', () => {
  const msgCode = (code: number): CbnMessageDiffEntry => ({
    nature: 'apparue',
    vcrnum: 'CG2601534',
    vcrlin: 6000,
    vcrseq: '1000',
    cle: 'CG2601534:6000:1000',
    article: 'A7399',
    fournisseur: '16012',
    mrpmesAvant: null,
    mrpmesApres: code,
    mrpdatAvant: null,
    mrpdatApres: code === 6 ? null : '2026-08-09',
    enddatAvant: null,
    enddatApres: '2026-08-16',
    decalageAvant: null,
    decalageApres: code === 6 ? null : -7,
    detail: 'Message apparu.',
  })

  const receptionApparue: DriverDiffEntry = {
    article: 'A7399',
    source: 'appro',
    nature: 'apparue',
    quantiteAvant: null,
    quantiteApres: 800,
    echeanceAvant: null,
    echeanceApres: '2026-08-12',
    detail: 'appro apparue : 800 unités.',
  }

  test('une réception NOUVELLE contredit un « avancer »', ({ assert }) => {
    const [exp] = explainCbnMessages([msgCode(2)], [receptionApparue])

    assert.lengthOf(exp.correlations, 0)
    assert.lengthOf(exp.contradictions, 1)
  })

  test('une réception nouvelle explique un « inutile »', ({ assert }) => {
    const [exp] = explainCbnMessages([msgCode(6)], [receptionApparue])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.correlations[0].source, 'appro')
  })

  test('une demande simplement RÉDUITE explique un « inutile »', ({ assert }) => {
    const demandeReduite: DriverDiffEntry = {
      article: 'A7399',
      source: 'demande_ferme',
      nature: 'quantite',
      quantiteAvant: 1200,
      quantiteApres: 300,
      echeanceAvant: '2026-09-01',
      echeanceApres: '2026-09-01',
      detail: 'demande_ferme quantité 1 200 → 300.',
    }
    const [exp] = explainCbnMessages([msgCode(6)], [demandeReduite])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.correlations[0].poids, 3)
  })
})

/**
 * Scoring de confiance (#138 lot 2) : part normalisée, confiance par
 * corroboration/contradiction, couverture, niveau et synthèse.
 */
test.group('explainCbnMessages — scoring de confiance (lot 2)', () => {
  const msgCode = (code: number): CbnMessageDiffEntry => ({
    nature: 'apparue',
    vcrnum: 'CG2601534',
    vcrlin: 6000,
    vcrseq: '1000',
    cle: 'CG2601534:6000:1000',
    article: 'A7399',
    fournisseur: '16012',
    mrpmesAvant: null,
    mrpmesApres: code,
    mrpdatAvant: null,
    mrpdatApres: code === 6 ? null : '2026-08-09',
    enddatAvant: null,
    enddatApres: '2026-08-16',
    decalageAvant: null,
    decalageApres: code === 6 ? null : -7,
    detail: 'Message apparu.',
  })

  const driver = (
    source: DriverDiffEntry['source'],
    avant: number,
    apres: number
  ): DriverDiffEntry =>
    ({
      article: 'A7399',
      source,
      nature: 'quantite',
      quantiteAvant: avant,
      quantiteApres: apres,
      echeanceAvant: '2026-09-01',
      echeanceApres: '2026-09-01',
      detail: `${source} quantité ${avant} → ${apres}.`,
    }) as DriverDiffEntry

  test('stock baisse + demande hausse : couverture 1, niveau directe, parts sommées à 1', ({
    assert,
  }) => {
    const [exp] = explainCbnMessages(
      [msgCode(2)],
      // stock baisse (3) + demande ferme HAUSSE (3) → deux convergents pour avancer
      [driver('stock', 1200, 740), driver('demande_ferme', 400, 800)]
    )

    assert.lengthOf(exp.correlations, 2)
    assert.equal(exp.couverture, 1)
    assert.equal(exp.niveau, 'directe')
    // parts normalisées sur les convergents : 3/(3+3) = 0.5 chacune
    assert.equal(exp.correlations[0].part + exp.correlations[1].part, 1)
    assert.isAtLeast(exp.correlations[0].confiance, 0.8)
    assert.match(exp.synthese, /stock/)
  })

  test('contradiction à parité : couverture 0,5 et niveau corrélation', ({ assert }) => {
    // stock baisse (convergent, 3) + demande baisse (contradictoire pour
    // avancer, 3) → couverture 3/6 = 0.5
    const [exp] = explainCbnMessages(
      [msgCode(2)],
      [driver('stock', 1200, 740), driver('demande_ferme', 800, 400)]
    )

    assert.lengthOf(exp.correlations, 1)
    assert.lengthOf(exp.contradictions, 1)
    assert.equal(exp.couverture, 0.5)
    assert.equal(exp.niveau, 'correlation')
    assert.match(exp.synthese, /contradiction/)
  })

  test('contradiction minoritaire : couverture 0,75 → probable', ({ assert }) => {
    // stock baisse (3) + demande hausse (3) convergent, demande_prevision
    // baisse (2) contradictoire → couverture 6/8 = 0.75
    const [exp] = explainCbnMessages(
      [msgCode(2)],
      [
        driver('stock', 1200, 740),
        driver('demande_ferme', 400, 800),
        driver('demande_prevision', 300, 100),
      ]
    )

    assert.equal(exp.couverture, 0.75)
    assert.equal(exp.niveau, 'probable')
  })

  test('une contradiction abaisse la confiance de la corrélation', ({ assert }) => {
    const sansContradiction = explainCbnMessages([msgCode(2)], [driver('stock', 1200, 740)])
    const avecContradiction = explainCbnMessages(
      [msgCode(2)],
      [driver('stock', 1200, 740), driver('demande_ferme', 800, 400)]
    )

    const c1 = sansContradiction[0].correlations[0].confiance
    const c2 = avecContradiction[0].correlations[0].confiance
    assert.isAbove(c1, c2)
  })

  test('aucun convergent : non expliqué, couverture 0', ({ assert }) => {
    const [exp] = explainCbnMessages([msgCode(2)], [])

    assert.lengthOf(exp.correlations, 0)
    assert.equal(exp.couverture, 0)
    assert.equal(exp.niveau, 'non_explique')
    assert.match(exp.synthese, /Non expliqué/)
  })

  test('une seule corrélation de poids 2 : probable, pas directe (maxConfiance < 0,8)', ({
    assert,
  }) => {
    // of_ferme a poids 2 → confiance de base 0,70 (< 0,8) même avec couverture 1 :
    // le niveau doit rester « probable », jamais « directe ».
    const ofApparu: DriverDiffEntry = {
      article: 'A7399',
      source: 'of_ferme',
      nature: 'apparue',
      quantiteAvant: null,
      quantiteApres: 500,
      echeanceAvant: null,
      echeanceApres: '2026-09-10',
      detail: 'of_ferme apparu : 500 unités.',
    }
    const [exp] = explainCbnMessages([msgCode(2)], [ofApparu])

    assert.lengthOf(exp.correlations, 1)
    assert.equal(exp.couverture, 1)
    assert.isBelow(exp.correlations[0].confiance, 0.8)
    assert.equal(exp.niveau, 'probable')
  })
})
