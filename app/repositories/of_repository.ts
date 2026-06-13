import type { Flow } from '#app/domain/models/flow'
import MfgItem from '#models/x3/mfgitm'
import LocalMenu from '#models/local_menu'
import { parseX3Date } from '#app/x3/utils/parse_date'

/** Ordre de fabrication non clos, avec dates début + fin (pour le tableau d'ordonnancement). */
export interface ManufacturingOrder {
  numOf: string
  article: string
  designation: string | null
  status: 1 | 2 | 3
  statutLabel: string | null
  typeOfLabel: string | null
  quantity: number // reste à produire (RMNEXTQTY)
  quantityLaunched: number // qté lancée (EXTQTY)
  quantityDone: number // qté réalisée (CPLQTY)
  unit: string | null
  startDate: Date | null
  endDate: Date | null
}

export class X3OfRepository {
  private async fetch() {
    const [rows, menuRows] = await Promise.all([
      MfgItem.query()
        .select(
          'MFGITM.MFGNUM_0',
          'MFGITM.ITMREF_0',
          'MFGITM.MFGSTA_0',
          'MFGITM.EXTQTY_0',
          'MFGITM.CPLQTY_0',
          'MFGITM.RMNEXTQTY_0',
          'MFGITM.STU_0',
          'MFGITM.STRDAT_0 AS STRDAT_RAW',
          'MFGITM.ENDDAT_0 AS ENDDAT_RAW',
          'MFGHEAD.XTYPOF_0',
          'ITMMASTER.ITMDES1_0'
        )
        .leftJoin('MFGHEAD', 'MFGHEAD.MFGNUM_0', 'MFGITM.MFGNUM_0')
        .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGITM.ITMREF_0')
        .where('MFGITM.RMNEXTQTY_0', '>', 0)
        .whereIn('MFGITM.MFGSTA_0', ['1', '2', '3']),
      LocalMenu.query().whereIn('chapter', [317, 1026]),
    ])

    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null

    return { rows: rows.filter((row) => parseFloat(row.quantiteRestante ?? '0') > 0), label }
  }

  async getSupplyFlows(): Promise<Flow[]> {
    const { rows, label } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.statutOrdreDeFabrication ?? '0') as 1 | 2 | 3
      const typeOf = parseInt((row.$extras.XTYPOF_0 as string | null) ?? '0') || null
      return {
        article: row.article?.trim() ?? '',
        quantity: parseFloat(row.quantiteRestante ?? '0'),
        direction: 'supply' as const,
        date: parseX3Date(row.$extras.ENDDAT_RAW),
        origin: {
          type: 'of' as const,
          id: row.numeroOrdreDeFabrication?.trim() ?? '',
          status,
          statutLabel: label(317, status),
          typeOf,
          typeOfLabel: label(1026, typeOf),
          designation: (row.$extras.ITMDES1_0 as string | null) ?? null,
        },
      }
    })
  }

  async getManufacturingOrders(): Promise<ManufacturingOrder[]> {
    const { rows, label } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.statutOrdreDeFabrication ?? '0') as 1 | 2 | 3
      const typeOf = parseInt((row.$extras.XTYPOF_0 as string | null) ?? '0') || null
      return {
        numOf: row.numeroOrdreDeFabrication?.trim() ?? '',
        article: row.article?.trim() ?? '',
        designation: (row.$extras.ITMDES1_0 as string | null) ?? null,
        status,
        statutLabel: label(317, status),
        typeOfLabel: label(1026, typeOf),
        quantity: parseFloat(row.quantiteRestante ?? '0'),
        quantityLaunched: parseFloat(row.quantitePrevue ?? '0'),
        quantityDone: parseFloat(row.quantiteRealiseeTotale ?? '0'),
        unit: row.uniteStock?.trim() ?? null,
        startDate: parseX3Date(row.$extras.STRDAT_RAW),
        endDate: parseX3Date(row.$extras.ENDDAT_RAW),
      }
    })
  }
}
