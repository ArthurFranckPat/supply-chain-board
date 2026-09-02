import { test } from '@japa/runner'
import { buildOrdersWindows } from '#repositories/of_repository'

/**
 * Bornes du découpage de la requête ORDERS (#183).
 *
 * Pourquoi ce test existe : le découpage remplace UN appel par une douzaine, et
 * une erreur de bornes ne se voit pas. Un trou d'un jour entre deux fenêtres ne
 * lève rien, ne ralentit rien — il fait juste disparaître du board les OF qui
 * finissent ce jour-là. Un recouvrement, lui, les compte deux fois et double
 * silencieusement des quantités de flux. Aucun des deux n'est rattrapable en
 * aval, d'où la vérification ici, sur la fonction pure.
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

  test('la couverture commence à `from` et la dernière fenêtre est ouverte', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    const windows = buildOrdersWindows(from, today)

    assert.equal(windows[0][0], '20260604')
    assert.isNull(
      windows[windows.length - 1][1],
      'sans fenêtre ouverte finale, un OF au-delà de l’horizon serait perdu'
    )
  })

  test('aucune fenêtre fermée ne dépasse la largeur nominale', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    for (const [start, end] of buildOrdersWindows(today, today).concat(
      buildOrdersWindows(from, today)
    )) {
      if (end === null) continue
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

  test('un `from` déjà au-delà de l’horizon rend la seule fenêtre ouverte', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2030, 0, 1)

    const windows = buildOrdersWindows(from, today)

    assert.lengthOf(windows, 1)
    assert.isNull(windows[0][1])
  })

  test('le découpage reste raisonnable en nombre d’appels SOAP', ({ assert }) => {
    const today = new Date(2026, 8, 2)
    const from = new Date(2026, 5, 4)

    const windows = buildOrdersWindows(from, today)

    // 90 j de lookback + 375 j d'horizon ≈ 465 j / 45 = ~11 fenêtres, + l'ouverte.
    // Le plancher d'un appel SOAP est ~65 ms : multiplier les fenêtres par
    // inadvertance (largeur réduite) redeviendrait cher en transport pur.
    assert.isAtMost(windows.length, 14)
    assert.isAtLeast(windows.length, 8)
  })
})
