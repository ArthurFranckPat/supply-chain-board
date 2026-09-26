/**
 * Préférences de vues (page « Vues ») — logique pure : normalisation, ciblage
 * des routes, chemin de repli. C'est cette logique qui décide quels onglets
 * restent et où retombe une URL masquée ; un test la fige là où un test
 * d'intégration coûterait un serveur.
 */
import { test } from '@japa/runner'

import {
  DEFAULT_VIEW_PREFS,
  fallbackPathFor,
  isPageHidden,
  isSubviewHidden,
  normalizeViewPrefs,
  pageTargetForPath,
} from '#types/view_prefs'

test.group('view_prefs / normalizeViewPrefs', () => {
  test('null (aucune préférence) → tout visible', ({ assert }) => {
    assert.deepEqual(normalizeViewPrefs(null), DEFAULT_VIEW_PREFS)
    assert.deepEqual(normalizeViewPrefs(undefined), DEFAULT_VIEW_PREFS)
  })

  test('écarte les clés inconnues et dédoublonne', ({ assert }) => {
    const out = normalizeViewPrefs({
      hiddenPages: ['sequenceur', 'sequenceur', 'pas-une-page'],
      hiddenSubviews: ['config:affichage', 'config:affichage', 'config:bidon', 'inconnu'],
    })
    assert.deepEqual(out.hiddenPages, ['sequenceur'])
    assert.deepEqual(out.hiddenSubviews, ['config:affichage'])
  })

  test('le tableau de bord ne peut pas être masqué', ({ assert }) => {
    const out = normalizeViewPrefs({ hiddenPages: ['dashboard', 'promesse'], hiddenSubviews: [] })
    assert.deepEqual(out.hiddenPages, ['promesse'])
    assert.isFalse(isPageHidden(out, 'dashboard'))
  })
})

test.group('view_prefs / pageTargetForPath', () => {
  const cases: [string, unknown][] = [
    ['/', { page: 'dashboard' }],
    ['/programme', { page: 'programme' }],
    ['/programme/scenarios/comparer', { page: 'programme' }],
    ['/planification', { page: 'programme', subview: 'planification' }],
    ['/ordonnancement', { page: 'programme', subview: 'ordonnancement' }],
    ['/charge', { page: 'load' }],
    ['/heures-produites', { page: 'heures_produites' }],
    ['/configuration/affichage', { page: 'config', subview: 'affichage' }],
    ['/impressions', { page: 'config', subview: 'impressions' }],
    // Non ciblées : page de réglages, API, assets, pages de lab.
    ['/configuration/vues', null],
    ['/api/v1/dashboard/kpis', null],
    ['/design-system', null],
    ['/health', null],
  ]

  for (const [path, expected] of cases) {
    test(`cible ${path}`, ({ assert }) => {
      assert.deepEqual(pageTargetForPath(path), expected)
    })
  }
})

test.group('view_prefs / fallbackPathFor', () => {
  test('page masquée → première page visible (tableau de bord)', ({ assert }) => {
    const prefs = normalizeViewPrefs({ hiddenPages: ['sequenceur'], hiddenSubviews: [] })
    assert.equal(fallbackPathFor(prefs, { page: 'sequenceur' }), '/')
  })

  test('sous-vue Config masquée → sous-view sœur visible', ({ assert }) => {
    const prefs = normalizeViewPrefs({
      hiddenPages: [],
      hiddenSubviews: ['config:calendrier'],
    })
    assert.equal(
      fallbackPathFor(prefs, { page: 'config', subview: 'calendrier' }),
      '/configuration/impressions'
    )
  })

  test('toutes les sous-vues Config masquées → sort de la page (pas de boucle)', ({ assert }) => {
    const prefs = normalizeViewPrefs({
      hiddenPages: [],
      hiddenSubviews: ['config:calendrier', 'config:impressions', 'config:affichage'],
    })
    assert.equal(fallbackPathFor(prefs, { page: 'config', subview: 'calendrier' }), '/')
  })

  test('sous-vue Programme masquée (non routée) → la page elle-même', ({ assert }) => {
    const prefs = normalizeViewPrefs({
      hiddenPages: [],
      hiddenSubviews: ['programme:planification'],
    })
    assert.equal(
      fallbackPathFor(prefs, { page: 'programme', subview: 'planification' }),
      '/programme'
    )
  })

  test('isSubviewHidden reflète la clé composite', ({ assert }) => {
    const prefs = normalizeViewPrefs({ hiddenPages: [], hiddenSubviews: ['receptions:board'] })
    assert.isTrue(isSubviewHidden(prefs, 'receptions', 'board'))
    assert.isFalse(isSubviewHidden(prefs, 'receptions', 'tableau'))
  })
})
