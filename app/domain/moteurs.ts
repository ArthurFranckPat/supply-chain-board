/**
 * Besoins moteurs — récap du header PP_830 (ligne EASY HOME).
 *
 * Les moto-roues montées sur la ligne portent toutes une référence `110229xx`, mais
 * le préfixe seul ne suffit pas à les isoler : les `1102295x` / `1102296x` sont des
 * « DOC ERP … », de la documentation papier livrée avec le produit. Croiser le
 * préfixe avec le libellé `MOTO-ROUE` évite de compter des notices comme des moteurs.
 *
 * Le besoin est lu au niveau 1 de la nomenclature : 52 des 55 articles routés sur
 * PP_830 portent leur moteur en composant direct — pas besoin d'exploser le BOM.
 */
import { requiredQuantity, type NomenclatureEntry } from './models/nomenclature.js'

const MOTEUR_REF_PREFIX = '110229'
const MOTEUR_LABEL_PREFIX = 'MOTO'

export interface MoteurNeed {
  /** Référence du moteur (ex. `11022900`). */
  article: string
  /** Libellé X3 du composant (ex. `MOTO-ROUE D160X60 EASYHOME AC`). */
  label: string
  /** Quantité requise sur l'horizon, arrondie à l'unité. */
  qty: number
}

export interface MoteurRecap {
  total: number
  byRef: MoteurNeed[]
}

/** Une ligne de nomenclature qui désigne un moteur (et non une notice `110229xx`). */
export function isMoteurEntry(entry: NomenclatureEntry): boolean {
  return (
    entry.componentArticle.startsWith(MOTEUR_REF_PREFIX) &&
    entry.componentDescription.trimStart().toUpperCase().startsWith(MOTEUR_LABEL_PREFIX)
  )
}

/** `parentArticle` → ses lignes de nomenclature moteur. Vide si l'article n'en porte pas. */
export function buildMoteurBom(entries: NomenclatureEntry[]): Map<string, NomenclatureEntry[]> {
  const byParent = new Map<string, NomenclatureEntry[]>()
  for (const entry of entries) {
    if (!isMoteurEntry(entry)) continue
    const arr = byParent.get(entry.parentArticle)
    if (arr) arr.push(entry)
    else byParent.set(entry.parentArticle, [entry])
  }
  return byParent
}

/**
 * Référence du moteur monté sur un article, `null` s'il n'en porte pas. Aucun article
 * du référentiel n'en porte deux — le premier trouvé est LE moteur.
 */
export function moteurRefFor(
  bom: Map<string, NomenclatureEntry[]>,
  article: string
): string | null {
  return bom.get(article)?.[0]?.componentArticle ?? null
}

/**
 * Cumule les besoins moteurs des articles posés sur la ligne, dans l'ordre où les
 * cartes sont placées. Les deux boards (OF et Commandes) alimentent le même
 * accumulateur : seule la source des quantités change.
 */
export class MoteurNeedsAccumulator {
  private readonly byRef = new Map<string, { label: string; qty: number }>()

  constructor(private readonly bom: Map<string, NomenclatureEntry[]>) {}

  add(parentArticle: string, parentQty: number): void {
    for (const entry of this.bom.get(parentArticle) ?? []) {
      const need = requiredQuantity(entry, parentQty)
      if (need <= 0) continue
      const cur = this.byRef.get(entry.componentArticle)
      if (cur) cur.qty += need
      else this.byRef.set(entry.componentArticle, { label: entry.componentDescription, qty: need })
    }
  }

  /** `null` si aucun moteur n'a été rencontré — le header masque alors la section. */
  result(): MoteurRecap | null {
    if (this.byRef.size === 0) return null
    const byRef = [...this.byRef.entries()]
      .map(([article, v]) => ({ article, label: v.label, qty: Math.round(v.qty) }))
      .sort((a, b) => b.qty - a.qty || a.article.localeCompare(b.article))
    return { total: byRef.reduce((s, r) => s + r.qty, 0), byRef }
  }
}
