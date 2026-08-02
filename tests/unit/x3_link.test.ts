import { test } from '@japa/runner'
// Import relatif : le runner ne résout pas l'alias @/ du front (cf. vision_impact.test.ts).
import { x3Href, type X3Web } from '../../inertia-react/lib/x3-link.ts'

const WEB: X3Web = { baseUrl: 'http://192.168.130.77:8124', endpoint: 'X3U12P_CLAERECO' }

test.group('x3Href — lien « Ouvrir dans X3 » (issue #118)', () => {
  test('retourne null sans web (endpoint non configuré)', ({ assert }) => {
    assert.isNull(x3Href(null, 'GESMFG', 'F426-44255'))
  })

  test('retourne null sur clé vide ou espaces', ({ assert }) => {
    assert.isNull(x3Href(WEB, 'GESMFG', ''))
    assert.isNull(x3Href(WEB, 'GESMFG', '   '))
  })

  test('double encodage : / et $ de f= sont encodés deux fois, le reste une fois', ({ assert }) => {
    const href = x3Href(WEB, 'GESMFG', 'F426-44255')
    assert.isNotNull(href)
    // Motif constaté au navigateur sur PROD (lot 0), + tilde de transaction
    // littéral (`~OF1`), conforme aux exemples de la doc SEI :
    // ?url=%2Ftrans%2Fx3%2Ferp%2FX3U12P_CLAERECO%2F%24sessions%3Ff%3DGESMFG~OF1%252F2%252F%252FM%252FF426-44255
    assert.equal(
      href,
      'http://192.168.130.77:8124/syracuse-main/html/main.html' +
        '?url=%2Ftrans%2Fx3%2Ferp%2FX3U12P_CLAERECO%2F%24sessions' +
        '%3Ff%3DGESMFG~OF1%252F2%252F%252FM%252FF426-44255'
    )
  })

  test('transaction accolée par un tilde sur GESMFG et GESSOH', ({ assert }) => {
    assert.match(x3Href(WEB, 'GESMFG', 'F426-44255') ?? '', /f%3DGESMFG~OF1%252F2/)
    assert.match(x3Href(WEB, 'GESSOH', 'SOH001') ?? '', /f%3DGESSOH~OV1%252F2/)
  })

  test('pas de transaction sur les fonctions sans table *TRS', ({ assert }) => {
    for (const f of ['GESPOH', 'GESITM'] as const) {
      assert.match(x3Href(WEB, f, 'K123') ?? '', new RegExp(`f%3D${f}%252F2`))
      assert.isFalse((x3Href(WEB, f, 'K123') ?? '').includes('~'))
    }
  })

  test('la clé est trimée mais pas déformée', ({ assert }) => {
    assert.equal(x3Href(WEB, 'GESITM', ' ARTICLE1 '), x3Href(WEB, 'GESITM', 'ARTICLE1'))
  })

  test('aucun profile/representation émis (UUID utilisateur)', ({ assert }) => {
    const href = x3Href(WEB, 'GESMFG', 'F426-44255') ?? ''
    assert.isFalse(href.includes('profile='))
    assert.isFalse(href.includes('representation='))
  })
})
