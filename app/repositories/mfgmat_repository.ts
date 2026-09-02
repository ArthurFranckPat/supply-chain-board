import MfgMat from '#models/x3/mfgmat'

export interface OfMaterial {
  article: string
  description: string
  unit: string | null
  required: number // RETQTY_0 — besoin total
  consumed: number // USEQTY_0 — déjà sorti
  remaining: number // RETQTY_0 - USEQTY_0 — reste à sortir
  allocated: number // ALLQTY_0 — déjà alloué en stock
}

/**
 * Taille d'un lot d'OF pour `getMaterialsForOfs` (#183).
 *
 * DIMENSIONNÉE SUR LES LIGNES RENDUES, pas sur les clés envoyées — c'est tout
 * le correctif. Elle valait 1 000, choisie pour « rester sous la limite IN
 * d'Oracle », donc en regardant l'entrée. Or `ZSOAPSQL` concatène ses lignes
 * dans un CLOB en O(n²) sur les lignes RENDUES par appel : c'est la sortie qui
 * commande le coût.
 *
 * Un OF porte environ 8 matières (7 841 lignes mesurées pour un lot de 1 000 OF
 * le 02/09/2026). 1 000 OF produisaient donc un seul appel de 7 841 lignes, à
 * 0,67 ms/ligne — en pleine zone quadratique. À 200 OF le lot tombe vers
 * 1 570 lignes, dans le creux de la courbe mesuré à 0,15 ms/ligne.
 *
 * Le même dépôt faisait déjà les deux : `getFluxByArticlePeriod` chunke à
 * 120 articles (~800 lignes) et coûte 0,27 ms/ligne ; celle-ci chunkait à
 * 1 000 OF et coûtait 0,67. Même contrainte, résultats opposés, parce que l'une
 * comptait les lignes et l'autre les clés.
 *
 * Si le ratio matières/OF change fortement (nomenclatures plus profondes), c'est
 * cette constante qu'il faut revoir — la cible est ~1 500 lignes par appel, pas
 * un nombre d'OF en particulier.
 */
const OF_CHUNK = 200

export class X3MfgmatRepository {
  async getMaterials(numOf: string): Promise<OfMaterial[]> {
    const rows = await MfgMat.query()
      .select(
        'MFGMAT.ITMREF_0',
        'MFGMAT.RETQTY_0',
        'MFGMAT.USEQTY_0',
        'MFGMAT.ALLQTY_0',
        'MFGMAT.STU_0',
        'ITMMASTER.ITMDES1_0'
      )
      .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGMAT.ITMREF_0')
      .where('MFGMAT.MFGNUM_0', numOf)

    return rows.map((row) => this.toMaterial(row)).filter((m) => m.article && m.required > 0)
  }

  /**
   * Charge les matières de PLUSIEURS OF (batch chunké).
   * Utilisé par le badge du board pour évaluer tous les OF de la fenêtre sur la même
   * source que le détail (cf. issue #11).
   */
  async getMaterialsForOfs(numOfs: string[]): Promise<Map<string, OfMaterial[]>> {
    const result = new Map<string, OfMaterial[]>()
    const unique = [...new Set(numOfs.filter(Boolean))]
    if (unique.length === 0) return result

    const chunks: string[][] = []
    for (let i = 0; i < unique.length; i += OF_CHUNK) {
      chunks.push(unique.slice(i, i + OF_CHUNK))
    }

    /**
     * SÉQUENTIEL, et non `Promise.all` comme auparavant (#183).
     *
     * À 1 000 OF par lot il n'y avait qu'un seul chunk : le parallélisme ne
     * servait à rien et ne se voyait pas. À 200 il y en a cinq ou plus, et les
     * lancer ensemble prendrait d'un coup tous les slots de `x3_concurrency`
     * (max 4) pour une seule page — chaque autre appelant, warmer compris,
     * attendrait derrière. C'est le même arbitrage que `SuiviService.loadRaw` :
     * le gain du parallélisme est local à la page, son coût est global.
     *
     * Et il n'y a pas de gain à espérer : la parallélisation des chunks SOAP a
     * déjà été tentée dans ce dépôt sans résultat. Le goulot est le CPU de
     * `ZSOAPSQL` côté X3, pas l'attente réseau.
     */
    const chunkRows: MfgMat[][] = []
    for (const chunk of chunks) {
      chunkRows.push(
        await MfgMat.query()
          .select(
            'MFGMAT.MFGNUM_0',
            'MFGMAT.ITMREF_0',
            'MFGMAT.RETQTY_0',
            'MFGMAT.USEQTY_0',
            'MFGMAT.ALLQTY_0',
            'MFGMAT.STU_0',
            'ITMMASTER.ITMDES1_0'
          )
          .leftJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'MFGMAT.ITMREF_0')
          .whereIn('MFGMAT.MFGNUM_0', chunk)
      )
    }

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
    const required = Number.parseFloat(row.quantiteBesoin ?? '0') || 0
    const consumed = Number.parseFloat(row.quantiteConsommee ?? '0') || 0
    const allocated = Number.parseFloat(row.quantiteAllouee ?? '0') || 0
    return {
      article: row.article?.trim() ?? '',
      description:
        ((row.$extras as Record<string, unknown>).ITMDES1_0 as string | null)?.trim() ?? '',
      unit: row.uniteStock?.trim() ?? null,
      required,
      consumed,
      remaining: Math.max(0, required - consumed),
      allocated,
    }
  }
}
