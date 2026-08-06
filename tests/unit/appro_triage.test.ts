import { test } from '@japa/runner'
import { buildApproPayload, type ApproDossier } from '#app/domain/appro'
import {
  attacheTriage,
  triageDossier,
  triagePayload,
  SCORE_SANS_ECHEANCE,
} from '#app/domain/appro_triage'
import type {
  ApproFetchResult,
  ApproMessageRow,
  ApproSuggestionRow,
} from '#app/repositories/appro_repository'

/**
 * Moteur de triage `/approvisionnements` lot 1 (#103). Signaux CBN seuls — pas
 * d'appel aux moteurs ruptures/promise-engine/stock (hors v1, cf. commentaire
 * de tête d'`appro_triage.ts`). Fixtures calquées sur `appro.test.ts`, avec les
 * mêmes cas réels observés sur AE1 le 01/08/2026.
 */

const TODAY = '2026-08-01'
const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

const sug = (over: Partial<ApproSuggestionRow> = {}): ApproSuggestionRow => ({
  numero: 'SGAE10655694556',
  article: '11028891',
  designation: 'COUVERCLE NOIR EASYHOME COMPAC',
  date: d('2026-09-01'),
  quantite: 3024,
  fournisseur: '40025',
  origine: '6',
  delaiReappro: 28,
  ...over,
})

const msg = (over: Partial<ApproMessageRow> = {}): ApproMessageRow => ({
  numero: 'CG2601534',
  ligne: 6000,
  sequence: '1000',
  article: 'A7399',
  designation: 'CASE EQUIPEE 1 VOLET BDH',
  date: d('2026-08-19'),
  dateProposee: d('2026-08-17'),
  message: 2,
  quantite: 14400,
  fournisseur: '16012',
  ...over,
})

const source = (over: Partial<ApproFetchResult> = {}): ApproFetchResult => ({
  suggestions: [],
  messages: [],
  fournisseurs: {},
  ...over,
})

const dossier = (over: Partial<ApproFetchResult> = {}) =>
  buildApproPayload(source(over), TODAY).dossiers[0]

test.group('appro_triage — messages de replanification', () => {
  test('avancer avec décalage ≥ seuil #115 (2 j) → replanifier', ({ assert }) => {
    // Cas réel CG2601534 : échéance 19/08, proposée 17/08 → décalage −2 j.
    const [resultat] = triageDossier(dossier({ messages: [msg()] }))
    assert.equal(resultat.verdict, 'replanifier')
    assert.isTrue(resultat.preuves[0].startsWith('Avancer de 2 j'))
  })

  test('décalage sous le seuil #115 → surveiller, pas replanifier', ({ assert }) => {
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ date: d('2026-08-19'), dateProposee: d('2026-08-18') })] })
    )
    assert.equal(resultat.verdict, 'surveiller')
  })

  test('retarder de 53 j (cas réel CG2600870) → replanifier', ({ assert }) => {
    const [resultat] = triageDossier(
      dossier({
        messages: [msg({ date: d('2026-07-23'), dateProposee: d('2026-09-14'), message: 3 })],
      })
    )
    assert.equal(resultat.verdict, 'replanifier')
    assert.isTrue(resultat.preuves[0].startsWith('Retarder de 53 j'))
  })

  test('« inutile » (annuler) → investiguer, jamais un verdict direct', ({ assert }) => {
    // #115 : « Inutile » exige la chaîne causale avant d'annuler — hors v1.
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ message: 6, dateProposee: null })] })
    )
    assert.equal(resultat.verdict, 'investiguer')
  })

  test('« inutile » reste investiguer même avec un décalage calculable', ({ assert }) => {
    // Garde défensive : la branche « inutile » doit primer sur le décalage — si
    // un jour itemFromMessage calculait un décalage sur un message d'annulation,
    // il ne doit pas devenir « replanifier » par accident (ordre des branches).
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ message: 6, dateProposee: d('2026-08-17') })] })
    )
    assert.equal(resultat.verdict, 'investiguer')
  })

  test('message action sans date proposée (donnée incohérente) → investiguer', ({ assert }) => {
    // Faux positif documenté : un message « avancer »/« retarder » porte
    // normalement une MRPDAT_0 exploitable ; si elle manque, ne pas inventer un
    // verdict « replanifier » sur un décalage nul par accident.
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ message: 2, dateProposee: null })] })
    )
    assert.equal(resultat.verdict, 'investiguer')
  })

  test('la preuve distingue la cause de la donnée incohérente', ({ assert }) => {
    // La cause (échéance absente / date proposée absente) est portée par la
    // preuve : la geler empêche une régression silencieuse du détail.
    const sansEcheance = triageDossier(dossier({ messages: [msg({ date: null })] }))[0]
    assert.equal(sansEcheance.verdict, 'investiguer')
    assert.isTrue(sansEcheance.preuves[0].includes('échéance absente'))

    const sansDateProposee = triageDossier(
      dossier({ messages: [msg({ message: 2, dateProposee: null })] })
    )[0]
    assert.equal(sansDateProposee.verdict, 'investiguer')
    assert.isTrue(sansDateProposee.preuves[0].includes('date proposée absente'))
  })

  test('décalage nul (0 j) → surveiller, sous le seuil #115', ({ assert }) => {
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ date: d('2026-08-19'), dateProposee: d('2026-08-19') })] })
    )
    assert.equal(resultat.verdict, 'surveiller')
  })
})

test.group('appro_triage — suggestions d’achat', () => {
  test('échéance à J+7 ou moins → passer', ({ assert }) => {
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-08-05') })] }))
    assert.equal(resultat.verdict, 'passer')
  })

  test('échéance lointaine, article unique → surveiller', ({ assert }) => {
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-12-25') })] }))
    assert.equal(resultat.verdict, 'surveiller')
  })

  test('sans échéance connue → surveiller, jamais passer par défaut', ({ assert }) => {
    // Faux positif documenté : une absence de date ne doit pas se lire comme
    // une urgence maximale (cohérent avec le tri d'appro.ts).
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: null })] }))
    assert.equal(resultat.verdict, 'surveiller')
  })

  test('plusieurs suggestions du même article dans le dossier → regrouper', ({ assert }) => {
    const resultats = triageDossier(
      dossier({
        suggestions: [
          sug({ numero: 'A', date: d('2026-09-01') }),
          sug({ numero: 'B', date: d('2026-09-15') }),
          sug({ numero: 'C', date: d('2026-10-01') }),
        ],
      })
    )
    assert.isTrue(resultats.every((r) => r.verdict === 'regrouper'))
  })

  test('regroupement priment sur l’urgence temporelle même si une échéance est proche', ({
    assert,
  }) => {
    // Le regroupement compte plus que l'urgence isolée : une seule décision
    // d'achat couvre les deux, il ne faut pas fragmenter en passer + surveiller.
    const resultats = triageDossier(
      dossier({
        suggestions: [
          sug({ numero: 'A', date: d('2026-08-03') }),
          sug({ numero: 'B', date: d('2026-11-01') }),
        ],
      })
    )
    assert.deepEqual(
      resultats.map((r) => r.verdict),
      ['regrouper', 'regrouper']
    )
  })

  test('un message sans rapport sur le même article ne déclenche pas un regroupement', ({
    assert,
  }) => {
    // Faux positif documenté : suggestion et message de replanif du même
    // article, même dossier fournisseur, mais deux natures sans rapport — un
    // message ne compte pas comme une seconde suggestion à regrouper.
    const resultats = triageDossier(
      dossier({
        suggestions: [sug({ numero: 'A', article: 'ART1', date: d('2026-08-03') })],
        messages: [msg({ numero: 'B', article: 'ART1', fournisseur: '40025' })],
      })
    )
    const suggestion = resultats.find((r) => r.cle === 'S:A')
    assert.equal(suggestion?.verdict, 'passer')
  })

  test('échéance pile à J+7 → passer (borne incluse)', ({ assert }) => {
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-08-08') })] }))
    assert.equal(resultat.verdict, 'passer')
  })

  test('échéance à J+8 → surveiller (juste au-delà de la borne)', ({ assert }) => {
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-08-09') })] }))
    assert.equal(resultat.verdict, 'surveiller')
  })

  test('le regroupement ne mélange pas deux fournisseurs différents', ({ assert }) => {
    // Faux positif documenté : même article, dossiers distincts (fournisseurs
    // différents) — pas un doublon à regrouper, deux décisions séparées.
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'A', fournisseur: 'F1', date: d('2026-08-05') }),
          sug({ numero: 'B', fournisseur: 'F2', date: d('2026-08-05') }),
        ],
      }),
      TODAY
    )
    const resultats = triagePayload(payload)
    assert.equal(resultats.get('S:A')?.verdict, 'passer')
    assert.equal(resultats.get('S:B')?.verdict, 'passer')
  })
})

test.group('appro_triage — triageDossier', () => {
  test('dossier sans aucun item → aucun résultat', ({ assert }) => {
    const vide: ApproDossier = {
      fournisseur: 'X',
      nom: 'X',
      items: [],
      premiereEcheance: null,
      jours: null,
      nbArticles: 0,
      nbSuggestions: 0,
      nbMessages: 0,
    }
    assert.deepEqual(triageDossier(vide), [])
  })
})

test.group('appro_triage — triagePayload', () => {
  test('rend une entrée par item, indexée sur cleTriage', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [sug({ numero: 'X1', fournisseur: 'F' })],
        messages: [msg({ numero: 'X1', ligne: 1000, sequence: '1000', fournisseur: 'F' })],
      }),
      TODAY
    )
    const resultats = triagePayload(payload)
    assert.equal(resultats.size, 2)
    // Suggestion : pas de clé de photo, on retombe sur `cle`.
    assert.isTrue(resultats.has('S:X1'))
    // Message : clé COMPLÈTE, séquence comprise — cf. le test suivant.
    assert.isTrue(resultats.has('X1:1000:1000'))
  })

  test('deux messages partageant `cle` gardent des verdicts DISTINCTS', ({ assert }) => {
    // `COA2400006` ligne 1 porte cinq messages que seule `VCRSEQ_0` distingue,
    // avec des échéances allant du 21/09 au 18/01 — donc des scores d'urgence
    // opposés. Indexer sur `cle` (`M:VCRNUM:VCRLIN`, la clé du ledger) écrasait
    // quatre verdicts sur cinq et recollait celui du dernier à toutes les lignes.
    const payload = buildApproPayload(
      source({
        messages: [
          msg({ numero: 'COA2400006', ligne: 1, sequence: '344000', date: d('2026-09-21') }),
          msg({ numero: 'COA2400006', ligne: 1, sequence: '463000', date: d('2027-01-18') }),
        ],
      }),
      TODAY
    )
    const resultats = triagePayload(payload)

    assert.equal(resultats.size, 2)
    const proche = resultats.get('COA2400006:1:344000')
    const lointain = resultats.get('COA2400006:1:463000')
    assert.isDefined(proche)
    assert.isDefined(lointain)
    assert.notEqual(proche!.score, lointain!.score)

    // Et le verdict rattaché à chaque ligne est bien le sien.
    const items = attacheTriage(payload).dossiers[0].items
    assert.equal(
      items.find((i) => i.cleSnapshot === 'COA2400006:1:344000')!.triage!.score,
      proche!.score
    )
    assert.equal(
      items.find((i) => i.cleSnapshot === 'COA2400006:1:463000')!.triage!.score,
      lointain!.score
    )
  })

  test('chaque résultat porte au moins une preuve', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug()], messages: [msg()] }), TODAY)
    for (const resultat of triagePayload(payload).values()) {
      assert.isAbove(resultat.preuves.length, 0)
    }
  })
})

test.group('appro_triage — attacheTriage', () => {
  test('rattache un verdict par item, clé sur ApproItem.cle', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [sug({ numero: 'X1', date: d('2026-08-05') })],
        messages: [msg()],
      }),
      TODAY
    )
    const enrichi = attacheTriage(payload)
    const items = enrichi.dossiers.flatMap((doss) => doss.items)
    assert.equal(items.length, 2)
    const parCle = new Map(items.map((i) => [i.cle, i.triage!]))
    for (const item of items) {
      assert.isNotNull(item.triage)
      assert.equal(item.triage!.cle, item.cle)
      assert.isAbove(item.triage!.preuves.length, 0)
    }
    // Suggestion à J+4 → passer ; message avancer de 2 j → replanifier.
    assert.equal(parCle.get('S:X1')?.verdict, 'passer')
    assert.equal(parCle.get('M:CG2601534:6000')?.verdict, 'replanifier')
  })

  test('ne mute pas le payload d’origine (pur)', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug()] }), TODAY)
    const brut = payload.dossiers[0].items[0].triage
    attacheTriage(payload)
    assert.isNull(brut)
    assert.isNull(payload.dossiers[0].items[0].triage)
  })

  test('le regroupement d’un dossier est porté par le rattachement', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'A', date: d('2026-09-01') }),
          sug({ numero: 'B', date: d('2026-09-15') }),
        ],
      }),
      TODAY
    )
    const verdicts = attacheTriage(payload).dossiers[0].items.map((i) => i.triage?.verdict)
    assert.deepEqual(verdicts, ['regrouper', 'regrouper'])
  })
})

test.group('appro_triage — score', () => {
  test('une échéance dépassée rend un score au-dessus de 100', ({ assert }) => {
    // 15 j de retard : 100 - (-15 * 2) = 130.
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-07-17') })] }))
    assert.equal(resultat.score, 130)
  })

  test('une échéance lointaine descend sous 0 au lieu de buter sur un plancher', ({ assert }) => {
    // 146 j : 100 - 146 × 2 = -192. Un plancher à 0 mettait à égalité tout ce
    // qui échoit au-delà de J+50 — la moitié lointaine d'une vue 90 j n'avait
    // alors plus aucun ordre, alors que le score EST l'axe de tri.
    const [resultat] = triageDossier(dossier({ suggestions: [sug({ date: d('2026-12-25') })] }))
    assert.equal(resultat.score, -192)
  })

  test('le score reste strictement décroissant, même très loin', ({ assert }) => {
    const scoreDe = (date: string) =>
      triageDossier(dossier({ suggestions: [sug({ date: d(date) })] }))[0].score
    const scores = ['2026-09-01', '2026-10-01', '2026-12-25', '2027-06-01'].map(scoreDe)
    for (let i = 1; i < scores.length; i += 1) assert.isBelow(scores[i], scores[i - 1])
  })

  test('une échéance inconnue passe sous toute ligne datée', ({ assert }) => {
    const [inconnue] = triageDossier(dossier({ suggestions: [sug({ date: null })] }))
    assert.equal(inconnue.score, SCORE_SANS_ECHEANCE)
    // Y compris sous la ligne la plus lointaine que la photo puisse porter
    // (horizon 18 mois, #133) : 100 - 548 × 2 = -996.
    assert.isBelow(inconnue.score, -996)
  })
})
