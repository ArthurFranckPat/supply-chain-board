import { test } from '@japa/runner'
import { buildOrdersWindows } from '#repositories/of_repository'

/**
 * Bornes du découpage de la requête ORDERS (#183).
 *
 * Pourquoi ce test existe : le découpage remplace UN appel par plusieurs, et une
 * erreur de bornes ne se voit pas. Un trou d'un jour entre deux fenêtres ne lève
 * rien, ne ralentit rien — il fait juste disparaître du board les OF qui
 * finissent ce jour-là. Un recouvrement, lui, les compte deux fois et double
 * silencieusement des quantités de flux. Aucun des deux n'est rattrapable en
 * aval, d'où la vérification ici, sur la fonction pure.
 *
 * Depuis la borne haute (#183), les fenêtres sont TOUTES FERMÉES : le pool
 * s'arrête à J+OF_LOOKAHEAD_DAYS. C'est un périmètre voulu, pas un oubli — et
 * c'est précisément pour ça qu'il est testé. Une fenêtre ouverte qui
 * réapparaîtrait rechargerait ~180 fois par jour les suggestions lointaines du
 * CBN que cette borne existe pour écarter.
 */

/** `YYYYMMDD` → Date locale, pour raisonner sur les bornes rendues. */
function parse(ymd: string): Date {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
}

const DAY_MS = 24 * 60 * 60 * 1000

test.group('buildOrdersWindows — découpage ENDDAT', () => {
  test('les fenêtres se raboutent exactement : aucun trou, aucun recouvrement', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    const windows = buildOrdersWindows(from, today)

    for (let i = 0; i < windows.length - 1; i++) {
      const end = windows[i][1]
      assert.isNotNull(end, `seule la dernière fenêtre peut être ouverte (index ${i})`)
      assert.equal(
        end,
        windows[i + 1][0],
        `la fin de la fenêtre ${i} doit être exactement le début de la ${i + 1}`
      )
    }
  })

  test('la couverture commence à `from` et s’arrête net à l’horizon', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    const windows = buildOrdersWindows(from, today)

    assert.equal(windows[0][0], '20260604')
    // 02/09/2026 + 180 j = 01/03/2027. La dernière fenêtre s'y ferme : au-delà,
    // rien n'est lu. C'est le périmètre assumé du pool, pas une troncature
    // accidentelle du découpage.
    assert.equal(windows[windows.length - 1][1], '20270301')
  })

  test('aucune fenêtre ouverte : le pool est borné, pas seulement découpé', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    for (const [start, end] of buildOrdersWindows(from, today)) {
      assert.isNotNull(end, `la fenêtre démarrant à ${start} doit être fermée`)
    }
  })

  test('aucune fenêtre fermée ne dépasse la largeur nominale', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    for (const [start, end] of buildOrdersWindows(today, today).concat(
      buildOrdersWindows(from, today)
    )) {
      const days = Math.round((parse(end).getTime() - parse(start).getTime()) / DAY_MS)
      assert.isAtMost(days, 45, `fenêtre ${start}→${end} trop large : ${days} jours`)
      assert.isAbove(days, 0, `fenêtre ${start}→${end} vide ou inversée`)
    }
  })

  test("l'horizon suit la date du jour, pas la borne de départ", ({ assert }) => {
    const from = new Date(2026, 5, 4)

    const enSeptembre = buildOrdersWindows(from, new Date(2026, 8, 2))
    const enDecembre = buildOrdersWindows(from, new Date(2026, 11, 2))

    // Même `from`, mais un horizon glissant : décembre doit ouvrir sa fenêtre
    // finale plus tard que septembre, sinon l'horizon serait figé sur `from`.
    assert.isAbove(
      Number(enDecembre[enDecembre.length - 1][0]),
      Number(enSeptembre[enSeptembre.length - 1][0])
    )
  })

  test('un `from` au-delà de l’horizon ne rend AUCUNE fenêtre', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2030, 0, 1)

    // Plage vide, donc zéro appel SOAP — et surtout pas une fenêtre inversée
    // `[2030-01-01, 2027-03-01)` qui rendrait zéro ligne en payant le transport.
    assert.lengthOf(buildOrdersWindows(from, today), 0)
  })

  test('aucune fenêtre de largeur nulle sur le chemin réel (dates non normalisées)', ({
    assert,
  }) => {
    // Reproduit l'appel de PRODUCTION : `fetch()` fabrique `from` avec un
    // `new Date()`, puis `buildOrdersWindows` en fabrique un second pour
    // `today`. Les quelques millisecondes d'écart faisaient déborder la boucle
    // d'un tour et produisaient `[20270301, 20270301)` — un appel SOAP de plus,
    // zéro ligne, à chaque chargement du pool. Les tests qui passent les deux
    // dates explicitement ne peuvent pas voir ce cas.
    const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    for (const [start, end] of buildOrdersWindows(from)) {
      assert.notEqual(start, end, `fenêtre de largeur nulle : [${start} → ${end})`)
    }
  })

  test('le découpage reste raisonnable en nombre d’appels SOAP', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    const windows = buildOrdersWindows(from, today)

    // 90 j de lookback + 180 j d'horizon = 270 j / 45 = 6 fenêtres.
    // Le plancher d'un appel SOAP est ~65 ms : multiplier les fenêtres par
    // inadvertance (largeur réduite) redeviendrait cher en transport pur.
    assert.isAtMost(windows.length, 8)
    assert.isAtLeast(windows.length, 5)
  })
})
