import { test } from '@japa/runner'
import { csvDateFr, csvNumber, csvQty, toCsv } from '#app/utils/csv'
import {
  chargeExportCsv,
  chargeExportFilename,
  segLabelFr,
  type ChargeExportData,
  type ChargeExportRow,
} from '#services/charge_export_builder'

/** BOM UTF-8 — sans lui, Excel FR lit « Ã© » à la place des accents. */
const BOM = '\uFEFF'

test.group('csv — sérialiseur', () => {
  test('BOM en tête, séparateur « ; », CRLF en fin de ligne', ({ assert }) => {
    const csv = toCsv([
      ['Article', 'Quantité'],
      ['A1', '3'],
    ])
    assert.strictEqual(csv, `${BOM}Article;Quantité\r\nA1;3\r\n`)
  })

  test('les décimales sont à la virgule (Excel FR) et sans séparateur de milliers', ({
    assert,
  }) => {
    assert.strictEqual(csvNumber(1234.5, 1), '1234,5')
    assert.strictEqual(csvNumber(12, 0), '12')
    // Non fini → vide, jamais « NaN » écrit dans un fichier de données.
    assert.strictEqual(csvNumber(Number.NaN, 1), '')
  })

  test('csvQty garde les fractions non entières mais pas les zéros superflus', ({ assert }) => {
    assert.strictEqual(csvQty(12), '12')
    assert.strictEqual(csvQty(1.5), '1,5')
    assert.strictEqual(csvQty(0.33333), '0,333')
  })

  test('csvDateFr convertit l’ISO en JJ/MM/AAAA et laisse vide sur null', ({ assert }) => {
    assert.strictEqual(csvDateFr('2026-09-01'), '01/09/2026')
    assert.strictEqual(csvDateFr(null), '')
    assert.strictEqual(csvDateFr(undefined), '')
  })

  test('un champ contenant le séparateur, un guillemet ou un retour ligne est protégé', ({
    assert,
  }) => {
    assert.strictEqual(toCsv([['a;b']]), `${BOM}"a;b"\r\n`)
    assert.strictEqual(toCsv([['a"b']]), `${BOM}"a""b"\r\n`)
    assert.strictEqual(toCsv([['a\nb']]), `${BOM}"a\nb"\r\n`)
    // Sans caractère spécial, aucun guillemet superflu.
    assert.strictEqual(toCsv([['abc']]), `${BOM}abc\r\n`)
  })

  test('null et undefined deviennent des champs vides', ({ assert }) => {
    assert.strictEqual(toCsv([[null, undefined, 'x']]), `${BOM};;x\r\n`)
  })

  test('segLabelFr nomme les induits et reste cohérent par vue', ({ assert }) => {
    assert.strictEqual(segLabelFr('commande', 'fi'), 'Induit (ferme)')
    assert.strictEqual(segLabelFr('commande', 'si'), 'Induit (prévision)')
    assert.strictEqual(segLabelFr('commande', 'f'), 'Commande')
    assert.strictEqual(segLabelFr('commande', 's'), 'Prévision')
    assert.strictEqual(segLabelFr('of', 'f'), 'Ferme')
    assert.strictEqual(segLabelFr('of', 'p'), 'Planifié')
    assert.strictEqual(segLabelFr('of', 's'), 'Suggéré')
  })
})

/** Ligne complète par défaut — chaque test ne surcharge que ce qu'il vérifie. */
function row(over: Partial<ChargeExportRow>): ChargeExportRow {
  return {
    poste: 'P1',
    posteLabel: 'Poste 1',
    atelier: 'AT1',
    atelierLabel: 'Atelier 1',
    bucketKey: '2026-9',
    bucketLabel: 'septembre 2026',
    fromIso: '2026-09-01',
    toIso: '2026-09-30',
    seg: 'f',
    article: 'A1',
    designation: 'Pièce',
    numOf: null,
    statutLabel: null,
    dateBesoin: null,
    numCommande: null,
    ligne: null,
    client: null,
    pfArticle: null,
    depth: null,
    dateX3Iso: null,
    dateOverrideIso: null,
    qty: 0,
    hours: 0,
    ...over,
  }
}

test.group('chargeExportCsv — colonnes par vue', () => {
  test('vue OF : colonnes OF, valeurs au format Excel FR', ({ assert }) => {
    const data: ChargeExportData = {
      view: 'of',
      gran: 'month',
      qtyMode: 'reste',
      x3Error: null,
      rows: [
        row({
          numOf: 'OF000123',
          statutLabel: 'Planifié',
          dateBesoin: '2026-09-14',
          qty: 12,
          hours: 7.5,
        }),
      ],
    }
    const csv = chargeExportCsv(data)
    const [head, line] = csv.replace(BOM, '').split('\r\n')
    assert.include(head, 'N° OF')
    assert.notInclude(head, 'N° commande')
    assert.include(line, 'OF000123')
    assert.include(line, '12;7,5;14/09/2026')
  })

  test('vue commande : colonnes commande, client et dates X3/appliquée', ({ assert }) => {
    const data: ChargeExportData = {
      view: 'commande',
      gran: 'week',
      qtyMode: 'brut',
      x3Error: null,
      rows: [
        row({
          seg: 'fi',
          numCommande: 'C001',
          ligne: '2',
          client: 'ACME',
          pfArticle: 'PF1',
          depth: 1,
          dateX3Iso: '2026-09-02',
          dateOverrideIso: '2026-09-05',
          qty: 3.5,
          hours: 2,
        }),
      ],
    }
    const csv = chargeExportCsv(data)
    const [head, line] = csv.replace(BOM, '').split('\r\n')
    assert.include(head, 'N° commande')
    assert.notInclude(head, 'N° OF')
    assert.include(line, 'Induit (ferme)')
    assert.include(line, 'C001;2;ACME;PF1;1;02/09/2026;05/09/2026;3,5;2,0')
  })

  test('le nom de fichier est daté et sans caractère exotique', ({ assert }) => {
    const base: ChargeExportData = {
      view: 'commande',
      gran: 'week',
      qtyMode: 'reste',
      x3Error: null,
      rows: [],
    }
    assert.match(chargeExportFilename(base), /^charge-commandes-hebdo-\d{4}-\d{2}-\d{2}\.csv$/)
    assert.match(
      chargeExportFilename({ ...base, view: 'of', gran: 'month' }),
      /^charge-of-mensuel-\d{4}-\d{2}-\d{2}\.csv$/
    )
  })
})
