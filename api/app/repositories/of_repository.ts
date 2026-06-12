import type { Flow } from '#app/domain/models/flow'
import MfgItem from '#models/x3/mfgitm'

export class X3OfRepository {
  async getSupplyFlows(): Promise<Flow[]> {
    const rows = await MfgItem.query()
      .select(
        'MFGITM.MFGNUM_0',
        'MFGITM.ITMREF_0',
        'MFGITM.MFGSTA_0',
        'MFGITM.EXTQTY_0',
        'MFGITM.CPLQTY_0',
        'MFGITM.RMNEXTQTY_0',
        'MFGITM.STRDAT_0',
        'MFGITM.ENDDAT_0',
        'MFGHEAD.XTYPOF_0',
        'ITMMASTER.ITMDES1_0'
      )
      .leftJoin('MFGHEAD', 'MFGHEAD.MFGNUM_0', 'MFGITM.MFGNUM_0')
      .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGITM.ITMREF_0')
      .where('MFGITM.RMNEXTQTY_0', '>', 0)
      .whereIn('MFGITM.MFGSTA_0', ['1', '2', '3'])

    return rows
      .filter(row => parseFloat(row.quantiteRestante ?? '0') > 0)
      .map(row => ({
        article: row.article?.trim() ?? '',
        quantity: parseFloat(row.quantiteRestante ?? '0'),
        direction: 'supply' as const,
        date: row.dateFin?.isValid ? row.dateFin.toJSDate() : null,
        origin: {
          type: 'of' as const,
          id: row.numeroOrdreDeFabrication?.trim() ?? '',
          status: parseInt(row.statutOrdreDeFabrication ?? '0') as 1 | 2 | 3,
          typeOf: (row.$extras.XTYPOF_0 as string | null) ?? null,
          designation: (row.$extras.ITMDES1_0 as string | null) ?? null,
        },
      }))
  }
}
