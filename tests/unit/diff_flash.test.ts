/**
 * Moteur de diff d'affichage (issue #186) — le cœur du flash au rechargement.
 *
 * Le moteur vit côté client (inertia-react/lib/diff-flash.ts) mais il est pur :
 * il se teste ici comme n'importe quelle fonction de domaine. Importé en
 * relatif — l'alias `@r/*` n'est câblé que pour le bundle Vite, pas pour le
 * runtime Node des tests.
 */
import { test } from '@japa/runner'

import {
  countDiff,
  diffRows,
  isEmptyDiff,
  type DiffConfig,
} from '../../inertia-react/lib/diff-flash.js'

interface Row {
  cmd: string
  art: string
  qte: number
  verdict: string
}

const row = (cmd: string, art: string, qte: number, verdict = 'time'): Row => ({
  cmd,
  art,
  qte,
  verdict,
})

const CONFIG: DiffConfig<Row> = {
  key: (r) => `${r.cmd}::${r.art}`,
  fields: {
    qteRestante: (r) => r.qte,
    verdictKey: (r) => r.verdict,
  },
}

test.group('diff-flash — moteur de diff', () => {
  test('deux photos identiques ne produisent aucun changement', ({ assert }) => {
    const rows = [row('C1', 'A1', 10), row('C2', 'A2', 5)]
    const d = diffRows(rows, [row('C1', 'A1', 10), row('C2', 'A2', 5)], CONFIG)

    assert.isTrue(isEmptyDiff(d))
    assert.deepEqual(countDiff(d), { changed: 0, entered: 0, exited: 0 })
  })

  test('un changement de tri seul ne produit aucun faux positif', ({ assert }) => {
    const prev = [row('C1', 'A1', 10), row('C2', 'A2', 5), row('C3', 'A3', 7)]
    const next = [row('C3', 'A3', 7), row('C1', 'A1', 10), row('C2', 'A2', 5)]

    assert.isTrue(isEmptyDiff(diffRows(prev, next, CONFIG)))
  })

  test('seule la colonne dont la valeur a bougé est signalée', ({ assert }) => {
    const prev = [row('C1', 'A1', 10, 'time'), row('C2', 'A2', 5, 'late')]
    const next = [row('C1', 'A1', 12, 'time'), row('C2', 'A2', 5, 'late')]

    const d = diffRows(prev, next, CONFIG)
    assert.deepEqual([...d.changed.keys()], ['C1::A1'])
    assert.deepEqual([...d.changed.get('C1::A1')!], ['qteRestante'])
    assert.deepEqual(countDiff(d), { changed: 1, entered: 0, exited: 0 })
  })

  test('une ligne peut voir plusieurs de ses cellules changer', ({ assert }) => {
    const d = diffRows([row('C1', 'A1', 10, 'time')], [row('C1', 'A1', 3, 'blocked')], CONFIG)

    assert.deepEqual([...d.changed.get('C1::A1')!].sort(), ['qteRestante', 'verdictKey'])
  })

  test('entrées et sorties sont distinguées, la sortie garde sa ligne', ({ assert }) => {
    const prev = [row('C1', 'A1', 10), row('C2', 'A2', 5)]
    const next = [row('C1', 'A1', 10), row('C3', 'A3', 8)]

    const d = diffRows(prev, next, CONFIG)
    assert.deepEqual([...d.entered], ['C3::A3'])
    assert.deepEqual([...d.exited], ['C2::A2'])
    // La ligne SORTIE est rendue telle qu'elle était : c'est elle qui reste
    // affichée le temps de son flash rouge.
    assert.deepEqual(d.exitedRows, [row('C2', 'A2', 5)])
    assert.deepEqual(countDiff(d), { changed: 0, entered: 1, exited: 1 })
  })

  test('une ligne entrée n’est jamais comptée aussi comme modifiée', ({ assert }) => {
    const d = diffRows([], [row('C1', 'A1', 10)], CONFIG)

    assert.equal(d.changed.size, 0)
    assert.deepEqual([...d.entered], ['C1::A1'])
  })

  test('un champ hors config ne déclenche aucun flash', ({ assert }) => {
    // `art` n'a pas d'extracteur : il fait partie de la clé, pas des colonnes
    // comparées. Un champ absent de la config ne peut donc rien allumer.
    const config: DiffConfig<Row> = { key: (r) => r.cmd, fields: { qteRestante: (r) => r.qte } }
    const d = diffRows([row('C1', 'A1', 10, 'time')], [row('C1', 'A1', 10, 'blocked')], config)

    assert.isTrue(isEmptyDiff(d))
  })

  test('deux lignes de même clé sont comparées — et flashées — en groupe', ({ assert }) => {
    // Cas X3 : une même commande/article peut donner deux lignes. Le moteur les
    // compare comme un tout, donc un changement sur l'une allume les deux.
    const prev = [row('C1', 'A1', 10), row('C1', 'A1', 4)]
    const next = [row('C1', 'A1', 10), row('C1', 'A1', 6)]

    const d = diffRows(prev, next, CONFIG)
    assert.deepEqual([...d.changed.get('C1::A1')!], ['qteRestante'])
    assert.equal(d.entered.size, 0)
    assert.equal(d.exited.size, 0)
  })

  test('perdre un doublon sort le groupe entier plutôt que rien', ({ assert }) => {
    // La clé reste présente : ce n'est PAS une sortie, c'est un changement de
    // la valeur du groupe — le contraire ferait disparaître une ligne sans le
    // moindre signal.
    const d = diffRows([row('C1', 'A1', 10), row('C1', 'A1', 4)], [row('C1', 'A1', 10)], CONFIG)

    assert.equal(d.exited.size, 0)
    // Toutes les colonnes du groupe bougent : la cardinalité change, donc la
    // valeur comparée aussi, y compris pour un champ dont chaque ligne
    // conservait la même valeur.
    assert.deepEqual([...d.changed.get('C1::A1')!].sort(), ['qteRestante', 'verdictKey'])
  })

  test('les valeurs structurées sont comparées par contenu, pas par référence', ({ assert }) => {
    interface Bag {
      id: string
      comps: { art: string; qty: number }[]
    }
    const config: DiffConfig<Bag> = { key: (r) => r.id, fields: { composants: (r) => r.comps } }
    const same = diffRows(
      [{ id: 'X', comps: [{ art: 'A', qty: 1 }] }],
      [{ id: 'X', comps: [{ art: 'A', qty: 1 }] }],
      config
    )
    assert.isTrue(isEmptyDiff(same))

    const moved = diffRows(
      [{ id: 'X', comps: [{ art: 'A', qty: 1 }] }],
      [{ id: 'X', comps: [{ art: 'A', qty: 2 }] }],
      config
    )
    assert.deepEqual([...moved.changed.get('X')!], ['composants'])
  })
})
