import { test } from '@japa/runner'
// Import relatif : le runner (ts-exec / Node ESM) ne résout PAS l'alias @/ du front,
// uniquement les subpath imports # du package.json. impact.ts est volontairement
// sans import pour rester testable tel quel (cf. date-utils.ts).
import {
  MARGE_JOURS,
  linkDelta,
  verdictOf,
  computeImpacts,
  worstVerdict,
  linkKey,
  deltaLabel,
  type ImpactLink,
} from '../../inertia/lib/vision/impact.ts'

const ISO = (d: string) => d // 'YYYY-MM-DD' lisible dans les fixtures

const link = (over: Partial<ImpactLink> & { ofId: string; commandeId: string }): ImpactLink => ({
  ofDateFinIso: null,
  cmdDateBesoinIso: null,
  ...over,
})

test.group('linkDelta — écart calendaire fin OF vs besoin (issue #23)', () => {
  test("positif si l'OF finit après le besoin", ({ assert }) => {
    assert.equal(linkDelta(ISO('2026-08-12'), ISO('2026-08-05')), 7)
  })

  test("négatif si l'OF finit avant le besoin", ({ assert }) => {
    assert.equal(linkDelta(ISO('2026-07-28'), ISO('2026-08-05')), -8)
  })

  test('zéro si même jour', ({ assert }) => {
    assert.equal(linkDelta(ISO('2026-08-05'), ISO('2026-08-05')), 0)
  })

  test('null si une date manque', ({ assert }) => {
    assert.isNull(linkDelta(null, ISO('2026-08-05')))
    assert.isNull(linkDelta(ISO('2026-08-05'), null))
    assert.isNull(linkDelta(null, null))
  })

  test("passe l'année (calcul calendaire, pas borné au mois)", ({ assert }) => {
    assert.equal(linkDelta(ISO('2027-01-03'), ISO('2026-12-30')), 4)
  })
})

test.group('verdictOf — seuils ok / limite / retard', () => {
  test('retard dès delta > 0', ({ assert }) => {
    assert.equal(verdictOf(1), 'retard')
    assert.equal(verdictOf(7), 'retard')
  })

  test('limite entre -MARGE_JOURS et 0 inclus', ({ assert }) => {
    assert.equal(verdictOf(0), 'limite')
    assert.equal(verdictOf(-MARGE_JOURS), 'limite')
  })

  test('ok strictement sous -MARGE_JOURS', ({ assert }) => {
    assert.equal(verdictOf(-(MARGE_JOURS + 1)), 'ok')
    assert.equal(verdictOf(-30), 'ok')
  })

  test('null si delta null', ({ assert }) => {
    assert.isNull(verdictOf(null))
  })
})

test.group('computeImpacts — dérivation et overrides de drag', () => {
  test('verdicts de base depuis les dates du payload', ({ assert }) => {
    const links = [
      link({
        ofId: 'OF1',
        commandeId: 'CMD1',
        ofDateFinIso: ISO('2026-08-12'),
        cmdDateBesoinIso: ISO('2026-08-05'),
      }), // retard
      link({
        ofId: 'OF2',
        commandeId: 'CMD2',
        ofDateFinIso: ISO('2026-08-03'),
        cmdDateBesoinIso: ISO('2026-08-05'),
      }), // limite
      link({
        ofId: 'OF3',
        commandeId: 'CMD3',
        ofDateFinIso: ISO('2026-07-20'),
        cmdDateBesoinIso: ISO('2026-08-05'),
      }), // ok
    ]
    const impacts = computeImpacts(links)
    assert.equal(impacts.get(linkKey('OF1', 'CMD1'))!.verdict, 'retard')
    assert.equal(impacts.get(linkKey('OF2', 'CMD2'))!.verdict, 'limite')
    assert.equal(impacts.get(linkKey('OF3', 'CMD3'))!.verdict, 'ok')
  })

  test('ofShift translater la date de fin OF (drag, durée préservée)', ({ assert }) => {
    const links = [
      link({
        ofId: 'OF1',
        commandeId: 'CMD1',
        ofDateFinIso: ISO('2026-08-01'),
        cmdDateBesoinIso: ISO('2026-08-05'),
      }), // ok (-4)
    ]
    // Drag : +10 jours → dateFin 2026-08-11 → retard (+6)
    const impacts = computeImpacts(links, new Map([['OF1', 10]]))
    const i = impacts.get(linkKey('OF1', 'CMD1'))!
    assert.equal(i.delta, 6)
    assert.equal(i.verdict, 'retard')
  })

  test('cmdBesoinOverride surcharge la date de besoin (drag commande)', ({ assert }) => {
    const links = [
      link({
        ofId: 'OF1',
        commandeId: 'CMD1',
        ofDateFinIso: ISO('2026-08-12'),
        cmdDateBesoinIso: ISO('2026-08-20'),
      }), // ok (-8)
    ]
    // Drag commande : besoin avancé au 2026-08-05 → retard (+7)
    const impacts = computeImpacts(links, new Map(), new Map([['CMD1', ISO('2026-08-05')]]))
    const i = impacts.get(linkKey('OF1', 'CMD1'))!
    assert.equal(i.delta, 7)
    assert.equal(i.verdict, 'retard')
  })

  test('combine ofShift + cmdBesoinOverride', ({ assert }) => {
    const links = [
      link({
        ofId: 'OF1',
        commandeId: 'CMD1',
        ofDateFinIso: ISO('2026-08-01'),
        cmdDateBesoinIso: ISO('2026-08-10'),
      }), // ok (-9)
    ]
    // Drag OF +5 (fin 08-06) ET commande avancée au 08-04 → retard (+2)
    const impacts = computeImpacts(
      links,
      new Map([['OF1', 5]]),
      new Map([['CMD1', ISO('2026-08-04')]])
    )
    const i = impacts.get(linkKey('OF1', 'CMD1'))!
    assert.equal(i.delta, 2)
    assert.equal(i.verdict, 'retard')
  })

  test('lien sans date → verdict null', ({ assert }) => {
    const links = [
      link({ ofId: 'OF1', commandeId: 'CMD1', ofDateFinIso: null, cmdDateBesoinIso: null }),
    ]
    const impacts = computeImpacts(links)
    assert.isNull(impacts.get(linkKey('OF1', 'CMD1'))!.verdict)
    assert.isNull(impacts.get(linkKey('OF1', 'CMD1'))!.delta)
  })
})

test.group("worstVerdict — verdict le plus grave d'un ensemble", () => {
  test("retard l'emporte sur limite et ok", ({ assert }) => {
    assert.equal(worstVerdict(['ok', 'limite', 'retard']), 'retard')
  })

  test("limite l'emporte sur ok", ({ assert }) => {
    assert.equal(worstVerdict(['ok', 'limite', 'ok']), 'limite')
  })

  test('ok si tout ok', ({ assert }) => {
    assert.equal(worstVerdict(['ok', 'ok']), 'ok')
  })

  test('null si tout null / vide', ({ assert }) => {
    assert.isNull(worstVerdict([null, null]))
    assert.isNull(worstVerdict([]))
  })
})

test.group('deltaLabel — libellé court', () => {
  test('positif préfixé +', ({ assert }) => {
    assert.equal(deltaLabel(7), '+7 j')
  })

  test('négatif préfixé J', ({ assert }) => {
    assert.equal(deltaLabel(-2), 'J-2')
  })

  test('zéro = J', ({ assert }) => {
    assert.equal(deltaLabel(0), 'J')
  })

  test('null = chaîne vide', ({ assert }) => {
    assert.equal(deltaLabel(null), '')
  })
})
