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

    return rows.map((row) => this.toMaterial(row)).filter((m) => m.article && m.required > 0)
  }

  /**
   * Charge les matières de PLUSIEURS OF en une seule requête (batch).
   * Utilisé par le badge du board pour évaluer tous les OF de la fenêtre sur la même
   * source que le détail (cf. issue #11). Chunké pour rester sous la limite IN d'Oracle.
   */
  async getMaterialsForOfs(numOfs: string[]): Promise<Map<string, OfMaterial[]>> {
    const result = new Map<string, OfMaterial[]>()
    const unique = [...new Set(numOfs.filter(Boolean))]
    if (unique.length === 0) return result

    const CHUNK = 1000
    const chunks: string[][] = []
    for (let i = 0; i < unique.length; i += CHUNK) {
      chunks.push(unique.slice(i, i + CHUNK))
    }

    // Chunks indépendants → requêtés en parallèle (issue #33). Sans effet à ≤ 1000 OF (1 chunk),
    // protège les fenêtres larges où la boucle séquentielle empilait N/1000 allers-retours X3.
    const chunkRows = await Promise.all(
      chunks.map((chunk) =>
        MfgMat.query()
          .select(
            'MFGMAT.MFGNUM_0',
            'MFGMAT.ITMREF_0',
            'MFGMAT.RETQTY_0',
            'MFGMAT.USEQTY_0',
            'MFGMAT.ALLQTY_0',
            'MFGMAT.STU_0',
            'ITMMASTER.ITMDES1_0',
          )
          .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGMAT.ITMREF_0')
          .whereIn('MFGMAT.MFGNUM_0', chunk)
      )
    )

    for (const rows of chunkRows) {
      for (const row of rows) {
        const numOf = row.numeroOrdreDeFabrication?.trim() ?? ''
        const material = this.toMaterial(row)
        if (!numOf || !material.article || material.required <= 0) continue
        const list = result.get(numOf) ?? []
        list.push(material)
        result.set(numOf, list)
      }
    }
    return result
  }

  private toMaterial(row: MfgMat): OfMaterial {
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
  }
}
