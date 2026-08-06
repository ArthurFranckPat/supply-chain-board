import { test } from '@japa/runner'
import { buildApproPayload } from '#app/domain/appro'
import { cleLogiqueItem } from '#services/appro_payload_loader'
import { cleLogiqueSuggestion, estCleMessage } from '#app/domain/appro_decision'
import type {
  ApproFetchResult,
  ApproMessageRow,
  ApproSuggestionRow,
} from '#app/repositories/appro_repository'

/**
 * Charnière du ledger (#134) : la clé calculée à l'ÉCRITURE (le controller, à
 * partir de ce que le navigateur renvoie) doit être exactement celle calculée à
 * la LECTURE (le loader, à partir du payload X3). Les deux appellent la même
 * fonction, mais rien ne garantissait qu'elles lui passent les mêmes valeurs —
 * et une divergence ne casse rien : elle rend juste toutes les décisions
 * invisibles, en silence.
 *
 * Ces tests rejouent le trajet complet sur un payload construit comme en
 * production, avec le corps exact que la page poste.
 */

const TODAY = '2026-08-01'
const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

const sug = (over: Partial<ApproSuggestionRow> = {}): ApproSuggestionRow => ({
  numero: 'SUG001',
  article: '11028891',
  designation: 'Bouche BDH 60',
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
  article: '11028891',
  designation: 'Bouche BDH 60',
  date: d('2026-09-01'),
  dateProposee: d('2026-09-15'),
  quantite: 500,
  fournisseur: '40025',
  message: 2,
  ...over,
})

const source = (over: Partial<ApproFetchResult> = {}): ApproFetchResult => ({
  suggestions: [],
  messages: [],
  fournisseurs: { '40025': 'ALDES DISTRIBUTION' },
  ...over,
})

/** Ce que la page poste pour une suggestion (cf. `poster()`, approvisionnements.tsx). */
const corpsSuggestion = (fournisseur: string, item: { article: string }) => ({
  nature: 'suggestion' as const,
  article: item.article,
  fournisseur,
})

test.group('ledger — la clé d’écriture est celle de lecture', () => {
  test('suggestion : le corps posté par la page rend la clé du loader', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug()] }), TODAY)
    const dossier = payload.dossiers[0]
    const item = dossier.items[0]

    const cleLecture = cleLogiqueItem(dossier.fournisseur, item)
    // Le controller, sur le corps que la page envoie.
    const corps = corpsSuggestion(dossier.fournisseur, item)
    const cleEcriture = cleLogiqueSuggestion(corps.fournisseur ?? '', corps.article)

    assert.equal(cleEcriture, cleLecture)
  })

  test('suggestion : un fournisseur absent ne casse pas l’accord', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug({ fournisseur: '' })] }), TODAY)
    const dossier = payload.dossiers[0]
    const item = dossier.items[0]

    const corps = corpsSuggestion(dossier.fournisseur, item)
    assert.equal(
      cleLogiqueSuggestion(corps.fournisseur ?? '', corps.article),
      cleLogiqueItem(dossier.fournisseur, item)
    )
  })

  test('suggestion : la clé ne bouge pas quand l’échéance ou la quantité bougent', ({ assert }) => {
    const avant = buildApproPayload(source({ suggestions: [sug()] }), TODAY)
    const apres = buildApproPayload(
      source({
        // Numéro recréé par le CBN, échéance et quantité déplacées : c'est le
        // scénario nocturne qui faisait perdre la décision avec le fingerprint.
        suggestions: [sug({ numero: 'SUG999', date: d('2026-09-04'), quantite: 3200 })],
      }),
      TODAY
    )
    assert.equal(
      cleLogiqueItem(apres.dossiers[0].fournisseur, apres.dossiers[0].items[0]),
      cleLogiqueItem(avant.dossiers[0].fournisseur, avant.dossiers[0].items[0])
    )
  })

  test('message : la page renvoie la clé du payload, le serveur l’accepte telle quelle', ({
    assert,
  }) => {
    const payload = buildApproPayload(source({ messages: [msg()] }), TODAY)
    const dossier = payload.dossiers[0]
    const item = dossier.items[0]

    // Corps posté par la page : `cle: item.cle`, sans reconstruction.
    assert.isTrue(estCleMessage(item.cle))
    assert.equal(item.cle, cleLogiqueItem(dossier.fournisseur, item))
  })

  test('message : une clé mal formée est rejetée', ({ assert }) => {
    assert.isFalse(estCleMessage(''))
    assert.isFalse(estCleMessage('S:4002511028891'))
    assert.isFalse(estCleMessage('M:CG2601534'))
    assert.isFalse(estCleMessage('M:CG2601534:abc'))
  })

  test('une suggestion et un message du même article ne partagent jamais de clé', ({ assert }) => {
    const payload = buildApproPayload(source({ suggestions: [sug()], messages: [msg()] }), TODAY)
    const dossier = payload.dossiers[0]
    const cles = dossier.items.map((item) => cleLogiqueItem(dossier.fournisseur, item))
    assert.lengthOf(new Set(cles), cles.length)
  })
})
