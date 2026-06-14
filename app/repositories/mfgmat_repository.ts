import MfgMat from '#models/x3/mfgmat'

export interface OfMaterial {
  article: string
  description: string
  unit: string | null
  required: number   // RETQTY_0 — besoin total
  consumed: number   // USEQTY_0 — déjà sorti
  remaining: number  // RETQTY_0 - USEQTY_0 — reste à sortir
  allocated: number  // ALLQTY_0 — déjà alloué en stock
}

export class X3MfgmatRepository {
  async getMaterials(numOf: string): Promise<OfMaterial[]> {
    const rows = await MfgMat.query()
      .select(
        'MFGMAT.ITMREF_0',
        'MFGMAT.RETQTY_0',
        'MFGMAT.USEQTY_0',
        'MFGMAT.ALLQTY_0',
        'MFGMAT.STU_0',
        'ITMMASTER.ITMDES1_0',
      )
      .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGMAT.ITMREF_0')
      .where('MFGMAT.MFGNUM_0', numOf)

    return rows
      .map((row) => {
        const required = parseFloat(row.quantiteBesoin ?? '0') || 0
        const consumed = parseFloat(row.quantiteConsommee ?? '0') || 0
        const allocated = parseFloat(row.quantiteAllouee ?? '0') || 0
        return {
          article: row.article?.trim() ?? '',
          description: ((row.$extras as Record<string, unknown>).ITMDES1_0 as string | null)?.trim() ?? '',
          unit: row.uniteStock?.trim() ?? null,
          required,
          consumed,
          remaining: Math.max(0, required - consumed),
          allocated,
        }
      })
      .filter((m) => m.article && m.required > 0)
  }
}
