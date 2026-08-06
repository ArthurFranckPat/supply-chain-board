import { test } from '@japa/runner'
import { buildApproPayload, filtreFenetreDerivee } from '#app/domain/appro'
import type {
  ApproFetchResult,
  ApproMessageRow,
  ApproSuggestionRow,
} from '#app/repositories/appro_repository'

/**
 * Domaine pur `/approvisionnements` (#103). Aucun accès X3 : les cas sont
 * calqués sur des lignes réellement observées sur AE1 le 01/08/2026.
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

test.group('appro — dossiers fournisseur', () => {
  test('regroupe suggestions et messages sous le même fournisseur', ({ assert }) => {
    const { dossiers } = buildApproPayload(
      source({
        suggestions: [sug({ fournisseur: '16012' })],
        messages: [msg({ fournisseur: '16012' })],
        fournisseurs: { '16012': 'PLAST MOUL' },
      }),
      TODAY
    )

    assert.lengthOf(dossiers, 1)
    assert.equal(dossiers[0].nom, 'PLAST MOUL')
    assert.equal(dossiers[0].nbSuggestions, 1)
    assert.equal(dossiers[0].nbMessages, 1)
    assert.equal(dossiers[0].nbArticles, 2)
  })

  test('trie les dossiers par échéance la plus proche, pas par volume', ({ assert }) => {
    const { dossiers } = buildApproPayload(
      source({
        suggestions: [
          sug({ fournisseur: 'GROS', numero: 'A', date: d('2026-10-01') }),
          sug({ fournisseur: 'GROS', numero: 'B', date: d('2026-10-02') }),
          sug({ fournisseur: 'GROS', numero: 'C', date: d('2026-10-03') }),
          sug({ fournisseur: 'URGENT', numero: 'D', date: d('2026-08-05') }),
        ],
      }),
      TODAY
    )

    assert.deepEqual(
      dossiers.map((x) => x.fournisseur),
      ['URGENT', 'GROS']
    )
    assert.equal(dossiers[0].jours, 4)
  })

  test('compte les jours en négatif sur une échéance dépassée', ({ assert }) => {
    // Cas réel : CG2600870, échéance 23/07/2026, message « retarder ».
    const { dossiers } = buildApproPayload(
      source({
        messages: [msg({ date: d('2026-07-23'), dateProposee: d('2026-09-14'), message: 3 })],
      }),
      TODAY
    )

    const item = dossiers[0].items[0]
    assert.equal(item.jours, -9)
    assert.equal(item.decalage, 53)
  })

  test('un message « inutile » sans date proposée ne rend aucun décalage', ({ assert }) => {
    // `MRPDAT_0` vaut la sentinelle `31-DEC-99` sur ces lignes — le repository la
    // rend déjà à `null`. Le domaine ne doit pas inventer un décalage pour autant.
    const { dossiers } = buildApproPayload(
      source({ messages: [msg({ message: 6, dateProposee: null })] }),
      TODAY
    )

    const item = dossiers[0].items[0]
    assert.isNull(item.dateProposee)
    assert.isNull(item.decalage)
  })

  test('une ligne sans échéance passe en dernier, jamais en tête', ({ assert }) => {
    const { dossiers } = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'SANS', date: null }),
          sug({ numero: 'AVEC', date: d('2026-12-25') }),
        ],
      }),
      TODAY
    )

    assert.deepEqual(
      dossiers[0].items.map((i) => i.cle),
      ['S:AVEC', 'S:SANS']
    )
    assert.equal(dossiers[0].premiereEcheance, '2026-12-25')
  })

  test('un fournisseur inconnu de BPARTNER reste identifiable par son code', ({ assert }) => {
    const { dossiers } = buildApproPayload(
      source({ suggestions: [sug({ fournisseur: '99999' })] }),
      TODAY
    )

    assert.equal(dossiers[0].nom, 'Tiers 99999')
  })

  test('une ligne sans fournisseur ne disparaît pas de la file', ({ assert }) => {
    // Observé : XFP0268 « CHIFFON NON PELUCHEUX ARDEJE », `BPRNUM_0` vide.
    const { dossiers, stats } = buildApproPayload(
      source({ suggestions: [sug({ fournisseur: '', article: 'XFP0268' })] }),
      TODAY
    )

    assert.equal(dossiers[0].nom, 'Sans fournisseur')
    assert.equal(stats.nbItems, 1)
  })

  test('les clés distinguent une suggestion d’un message homonyme', ({ assert }) => {
    const { dossiers } = buildApproPayload(
      source({
        suggestions: [sug({ numero: 'X1', fournisseur: 'F' })],
        messages: [msg({ numero: 'X1', ligne: 1000, fournisseur: 'F' })],
      }),
      TODAY
    )

    const cles = dossiers[0].items.map((i) => i.cle)
    assert.deepEqual([...new Set(cles)].length, cles.length)
    assert.includeMembers(cles, ['S:X1', 'M:X1:1000'])
  })

  test('compte les messages par code pour la barre de résumé', ({ assert }) => {
    const { stats } = buildApproPayload(
      source({
        suggestions: [sug()],
        messages: [
          msg({ numero: 'A', message: 2 }),
          msg({ numero: 'B', message: 3 }),
          msg({ numero: 'C', message: 3 }),
          msg({ numero: 'D', message: 6 }),
        ],
      }),
      TODAY
    )

    assert.equal(stats.nbSuggestions, 1)
    assert.equal(stats.nbMessages, 4)
    assert.deepEqual(stats.parMessage, { 2: 1, 3: 2, 6: 1 })
  })
})

test.group('appro — filtreFenetreDerivee (#114)', () => {
  test('garde les suggestions échéance ≤ today + délai, écarte les autres', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'PRES', date: d('2026-08-10'), delaiReappro: 28 }), // J+9 ≤ 28 → gardée
          sug({ numero: 'LOIN', date: d('2026-09-15'), delaiReappro: 28 }), // J+45 > 28 → écartée
          sug({ numero: 'SANS', date: d('2026-08-05'), delaiReappro: null }), // J+4 ≤ repli 14 → gardée
        ],
      }),
      TODAY
    )
    const cles = filtreFenetreDerivee(payload, TODAY)
      .dossiers.flatMap((doss) => doss.items)
      .map((i) => i.cle)
    // Tri du dossier par échéance : SANS (05/08) avant PRES (10/08).
    assert.deepEqual(cles, ['S:SANS', 'S:PRES'])
  })

  test('conserve les messages de replanif quelle que soit leur échéance', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [sug({ numero: 'LOIN', date: d('2026-11-20'), delaiReappro: 28 })],
        messages: [
          msg({
            numero: 'M1',
            date: d('2026-11-20'),
            dateProposee: d('2026-11-10'),
            message: 2,
          }),
        ],
      }),
      TODAY
    )
    const cles = filtreFenetreDerivee(payload, TODAY)
      .dossiers.flatMap((doss) => doss.items)
      .map((i) => i.cle)
    assert.deepEqual(cles, ['M:M1:6000'])
  })

  test('est pur et recalcule les stats', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'A', date: d('2026-08-05'), delaiReappro: 28 }),
          sug({ numero: 'B', date: d('2026-11-20'), delaiReappro: 28 }),
        ],
      }),
      TODAY
    )
    const brut = payload.dossiers.flatMap((doss) => doss.items).length
    const filtre = filtreFenetreDerivee(payload, TODAY)
    assert.equal(brut, 2)
    assert.equal(payload.dossiers.flatMap((doss) => doss.items).length, 2)
    assert.equal(filtre.stats.nbItems, 1)
    assert.equal(filtre.stats.nbSuggestions, 1)
    assert.equal(filtre.stats.nbDossiers, 1)
  })

  test('recalcule les compteurs de dossier sur les items gardés', ({ assert }) => {
    // Le sommaire du dossier doit décrire la table affichée, pas le dossier
    // d'avant filtrage (sinon « 2 à commander » pour une ligne visible).
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'GARDE', date: d('2026-08-10'), delaiReappro: 28 }),
          sug({ numero: 'ECART', date: d('2026-11-20'), delaiReappro: 28 }),
        ],
      }),
      TODAY
    )
    const filtre = filtreFenetreDerivee(payload, TODAY)
    const dossier = filtre.dossiers[0]
    assert.equal(dossier.nbSuggestions, 1)
    assert.equal(dossier.nbArticles, 1)
    assert.equal(dossier.premiereEcheance, '2026-08-10')
    assert.equal(dossier.jours, 9)
  })

  test('garde une échéance dépassée (cas le plus urgent), écarte une sans date', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ numero: 'RETARD', date: d('2026-07-20'), delaiReappro: 28 }), // J-12 → gardée
          sug({ numero: 'SANS', date: null, delaiReappro: 28 }), // pas d'échéance → écartée
        ],
      }),
      TODAY
    )
    const cles = filtreFenetreDerivee(payload, TODAY)
      .dossiers.flatMap((doss) => doss.items)
      .map((i) => i.cle)
    assert.deepEqual(cles, ['S:RETARD'])
  })

  test('borne exacte : échéance pile à today + délai → gardée', ({ assert }) => {
    // TODAY = 2026-08-01, délai 28 → échéance 2026-08-29 exactement à la borne.
    const payload = buildApproPayload(
      source({ suggestions: [sug({ numero: 'PILE', date: d('2026-08-29'), delaiReappro: 28 })] }),
      TODAY
    )
    const cles = filtreFenetreDerivee(payload, TODAY)
      .dossiers.flatMap((doss) => doss.items)
      .map((i) => i.cle)
    assert.deepEqual(cles, ['S:PILE'])
  })

  test('un dossier entièrement vidé disparaît de la file', ({ assert }) => {
    const payload = buildApproPayload(
      source({
        suggestions: [
          sug({ fournisseur: 'F1', numero: 'LOIN', date: d('2026-11-20'), delaiReappro: 28 }),
          sug({ fournisseur: 'F2', numero: 'PROCHE', date: d('2026-08-10'), delaiReappro: 28 }),
        ],
      }),
      TODAY
    )
    const filtre = filtreFenetreDerivee(payload, TODAY)
    assert.equal(filtre.dossiers.length, 1)
    assert.equal(filtre.dossiers[0].fournisseur, 'F2')
    assert.equal(filtre.stats.nbDossiers, 1)
  })
})
