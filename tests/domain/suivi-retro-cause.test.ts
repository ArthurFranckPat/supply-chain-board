import { test } from '@japa/runner'
import { analyzeRetroCause } from '#app/domain/suivi'
import type { RetroCauseInput } from '#app/domain/suivi'

const D = (iso: string) => new Date(iso)

function base(overrides: Partial<RetroCauseInput> & { ofPegue: string }): RetroCauseInput {
  return {
    dateAffermissement: null,
    dateExpedition: null,
    composants: [],
    ...overrides,
  }
}

test.group('analyzeRetroCause (analyse rétrospective)', () => {
  test('composant disponible tard (>= expe − marge) → RETARD_COMPOSANT_TARDIF', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'F426-32845',
        dateAffermissement: D('2026-06-17'),
        dateExpedition: D('2026-06-18'),
        composants: [{ art: '11016937', dispoA: D('2026-06-17'), rawReception: D('2026-06-16') }],
      }),
    )
    assert.isNotNull(cause)
    assert.equal(cause!.typeCause, 'RETARD_COMPOSANT_TARDIF')
    assert.equal(cause!.retro!.composantTardif!.art, '11016937')
    assert.equal(cause!.retro!.composantTardif!.dispoA, '2026-06-17')
    assert.isTrue(cause!.retro!.composantTardif!.viaControleQualite) // dispo(17) > reception(16)
  })

  test('retient le composant le plus tardif parmi plusieurs', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'OF1',
        dateExpedition: D('2026-06-18'),
        composants: [
          { art: 'EARLY', dispoA: D('2026-04-20'), rawReception: null },
          { art: 'LATE', dispoA: D('2026-06-17'), rawReception: null },
          { art: 'MID', dispoA: D('2026-05-26'), rawReception: null },
        ],
      }),
    )
    assert.equal(cause!.retro!.composantTardif!.art, 'LATE')
  })

  test('composant à temps (dispo < expe − marge, avant affermissement) → pas imputé, RETARD_ORDONNANCEMENT', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'OF1',
        dateAffermissement: D('2026-05-01'),
        dateExpedition: D('2026-06-18'),
        composants: [{ art: 'OK', dispoA: D('2026-04-20'), rawReception: null }], // bien avant tout
      }),
    )
    assert.equal(cause!.typeCause, 'RETARD_ORDONNANCEMENT')
    assert.isNull(cause!.retro!.composantTardif)
  })

  test('composant dispo après affermissement → coupable même si loin de l expe', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'OF1',
        dateAffermissement: D('2026-06-01'),
        dateExpedition: D('2026-06-18'),
        composants: [{ art: 'COMP', dispoA: D('2026-06-02'), rawReception: null }],
      }),
    )
    assert.equal(cause!.typeCause, 'RETARD_COMPOSANT_TARDIF')
  })

  test('flag CQ faux quand dispo A == reception brute (pas de séjour en Q)', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'OF1',
        dateExpedition: D('2026-06-18'),
        composants: [{ art: 'COMP', dispoA: D('2026-06-17'), rawReception: D('2026-06-17') }],
      }),
    )
    assert.isFalse(cause!.retro!.composantTardif!.viaControleQualite)
  })

  test('pas de composants avec date connue → RETARD_ORDONNANCEMENT sans coupable', ({ assert }) => {
    const cause = analyzeRetroCause(
      base({
        ofPegue: 'OF1',
        dateAffermissement: D('2026-06-20'),
        dateExpedition: D('2026-06-18'),
        composants: [{ art: 'X', dispoA: null, rawReception: null }],
      }),
    )
    assert.equal(cause!.typeCause, 'RETARD_ORDONNANCEMENT')
    assert.equal(cause!.joursRetard, 2) // affermi 20 > expe 18
    assert.isNull(cause!.retro!.composantTardif)
  })

  test('sans OF pegué → null (fallback moteur)', ({ assert }) => {
    const cause = analyzeRetroCause(base({ ofPegue: '', dateExpedition: D('2026-06-18') }))
    assert.isNull(cause)
  })
})
