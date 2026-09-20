/**
 * Reconstitution post-mortem de la cause d'un retard export.
 *
 * Ce que ces tests verrouillent, et pourquoi :
 *  - une entrée en stock DATÉE prouve la cause ; tout le reste n'est qu'une
 *    proposition (`confiance: 'moyenne'`) qu'un humain doit confirmer ;
 *  - produire le jour même de la date due est déjà trop tard pour le départ —
 *    la règle compare à la date due, pas à la fin de tolérance ;
 *  - quand rien n'explique, la fonction rend `null`. Elle ne devine pas : la
 *    ligne part dans le mail marquée « cause non documentée ».
 */

import { test } from '@japa/runner'
import { reconstituerCause, TRSTYP } from '#app/domain/export_delay_causes'
import type { LignePourCause, MouvementStock } from '#app/domain/export_delay_causes'

const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function ligne(patch: Partial<LignePourCause> = {}): LignePourCause {
  return {
    article: 'ART1',
    dateLimite: jour('2026-09-09'),
    dateAcceptee: jour('2026-09-08'),
    dateDemandee: jour('2026-09-08'),
    dateCommande: jour('2026-07-24'),
    dateReelle: jour('2026-09-16'),
    qteCommandee: 480,
    qteLivree: 480,
    delaiNegocie: false,
    ...patch,
  }
}

function mvt(patch: Partial<MouvementStock> = {}): MouvementStock {
  return {
    article: 'ART1',
    jour: jour('2026-09-15'),
    quantite: 480,
    type: TRSTYP.ENTREE_OF,
    ...patch,
  }
}

test.group('reconstituerCause', () => {
  test('une production postérieure à la date due prouve la cause', ({ assert }) => {
    const cause = reconstituerCause(ligne(), [mvt()])
    assert.equal(cause?.categorie, 'PRODUCTION')
    assert.equal(cause?.confiance, 'haute')
    assert.include(cause?.explication ?? '', '7 j après la date due')
  })

  test('une réception fournisseur tardive se classe en APPRO', ({ assert }) => {
    const cause = reconstituerCause(ligne(), [mvt({ type: TRSTYP.RECEPTION_FOURNISSEUR })])
    assert.equal(cause?.categorie, 'APPRO')
  })

  test('produire le jour même de la date due reste une cause, mais à confirmer', ({ assert }) => {
    const cause = reconstituerCause(ligne(), [mvt({ jour: jour('2026-09-08') })])
    assert.equal(cause?.categorie, 'PRODUCTION')
    assert.equal(cause?.confiance, 'moyenne')
    assert.include(cause?.explication ?? '', 'trop tard pour le départ')
  })

  test("une entrée antérieure à la date due n'explique pas le retard", ({ assert }) => {
    const cause = reconstituerCause(ligne(), [mvt({ jour: jour('2026-09-01') })])
    assert.equal(cause?.categorie, 'TRANSPORT')
  })

  test('les mouvements des autres articles sont ignorés', ({ assert }) => {
    const cause = reconstituerCause(ligne(), [mvt({ article: 'AUTRE' })])
    assert.isNull(cause)
  })

  test('un changement de statut qualité explique une rétention sans entrée', ({ assert }) => {
    const cause = reconstituerCause(ligne(), [
      mvt({ jour: jour('2026-09-01') }),
      mvt({ jour: jour('2026-09-10'), type: TRSTYP.CHANGEMENT_STATUT_QUALITE, quantite: -480 }),
    ])
    assert.equal(cause?.categorie, 'QUALITE_CQ')
  })

  test('une ligne jamais expédiée est nommée telle quelle', ({ assert }) => {
    const cause = reconstituerCause(ligne({ dateReelle: null, qteLivree: 0 }), [])
    assert.equal(cause?.categorie, 'PRODUCTION')
    assert.include(cause?.explication ?? '', 'Toujours pas expédiée')
  })

  test('sans date due, aucune cause ne peut être reconstituée', ({ assert }) => {
    const cause = reconstituerCause(ligne({ dateLimite: null, dateAcceptee: null }), [mvt()])
    assert.isNull(cause)
  })
})
