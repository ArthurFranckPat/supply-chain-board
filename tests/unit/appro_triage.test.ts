import { test } from '@japa/runner'
import { buildApproPayload } from '#app/domain/appro'
import { triageDossier, triagePayload } from '#app/domain/appro_triage'
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
  ...over,
})

const msg = (over: Partial<ApproMessageRow> = {}): ApproMessageRow => ({
  numero: 'CG2601534',
  ligne: 6000,
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
    // Cas réel CG2601534 : échéance 19/08, proposée 17/08 → décalage 2 j.
    const [resultat] = triageDossier(dossier({ messages: [msg()] }))
    assert.equal(resultat.verdict, 'replanifier')
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
  })

  test('« inutile » (annuler) → investiguer, jamais un verdict direct', ({ assert }) => {
    // #115 : « Inutile » exige la chaîne causale avant d'annuler — hors v1.
    const [resultat] = triageDossier(
      dossier({ messages: [msg({ message: 6, dateProposee: null })] })
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

test.group('appro_triage — triagePayload', () => {
  test('rend une entrée par item, clé sur ApproItem.cle', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [sug({ numero: 'X1', fournisseur: 'F' })],
        messages: [msg({ numero: 'X1', ligne: 1000, fournisseur: 'F' })],
      }),
      TODAY
    )
    const resultats = triagePayload(payload)
    assert.equal(resultats.size, 2)
    assert.isTrue(resultats.has('S:X1'))
    assert.isTrue(resultats.has('M:X1:1000'))
  })

  test('chaque résultat porte au moins une preuve', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug()], messages: [msg()] }), TODAY)
    for (const resultat of triagePayload(payload).values()) {
      assert.isAbove(resultat.preuves.length, 0)
    }
  })
})
