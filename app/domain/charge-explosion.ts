/**
 * Explosion de nomenclature + netting pour la projection de charge
 * (suite issue #42 : brut → net, depth-1 → depth-4).
 *
 * Produit, pour chaque ligne de commande, la liste des besoins (PF + composants
 * FABRIQUÉS jusqu'à `maxDepth`) avec quantité BRUTE et NETTE. Le netting déduit
 * le stock disponible (physique strict + CQ) par article, consommé FIFO depuis
 * la date la plus tôt.
 *
 * Modèle volontairement simple (pas un MRP complet) :
 *  - snapshot stock « maintenant » étalé sur tout l'horizon ;
 *  - pas d'offset de lead time (besoin à la date de la commande parente) ;
 *  - pas de réceptions attendues ni d'OF en cours (stock seul, par choix métier).
 * Objectif : une charge nette actionnable, pas une régénération MRP.
 */
import { requiredQuantity, type NomenclatureEntry } from './models/nomenclature.js'
import type { GammeOperation } from './models/gamme.js'

export type ChargeNature = 'ferme' | 'prevision'

export interface ChargeOrderLine {
  article: string
  quantite: number
  date: Date
  nature: ChargeNature
}

/** Besoin brut issu de l'explosion (avant netting). */
export interface ChargeRaw {
  article: string
  /** Workstation (gamme) de l'article. */
  wst: string
  date: Date
  nature: ChargeNature
  /** 0 = PF (charge directe), >0 = composant induit. */
  depth: number
  qty: number
  rate: number
}

/** Besoin net (après déduction stock) prêt à être ventilé en heures. */
export interface ChargeNeed {
  wst: string
  date: Date
  article: string
  nature: ChargeNature
  depth: number
  brutHours: number
  netHours: number
}

const DEFAULT_MAX_DEPTH = 4

/**
 * Explosion théorique de la nomenclature (composants FABRIQUÉS uniquement),
 * PF inclus (depth 0). Garde anti-cycle (Set d'ancêtres) + cap de profondeur.
 *
 * Un PF sans gamme (anomalie référentiel) ignore toute sa descendance — parité
 * avec le comportement depth-1 précédent (on ne planifie pas un PF sans route).
 */
export function explodeCharge(
  orderLines: ChargeOrderLine[],
  bomByParent: Map<string, NomenclatureEntry[]>,
  gammeMap: Map<string, GammeOperation>,
  maxDepth: number = DEFAULT_MAX_DEPTH
): ChargeRaw[] {
  const raws: ChargeRaw[] = []

  const explode = (
    article: string,
    qty: number,
    nature: ChargeNature,
    date: Date,
    depth: number,
    ancestors: Set<string>
  ): void => {
    if (ancestors.has(article)) return // garde anti-cycle
    const gamme = gammeMap.get(article)
    const rate = gamme?.rate ?? 0
    if (gamme?.workstation && rate > 0) {
      raws.push({ article, wst: gamme.workstation, date, nature, depth, qty, rate })
    }
    if (depth >= maxDepth) return
    const bom = bomByParent.get(article)
    if (!bom?.length) return
    const next = new Set(ancestors).add(article)
    for (const entry of bom) {
      explode(entry.componentArticle, requiredQuantity(entry, qty), nature, date, depth + 1, next)
    }
  }

  for (const l of orderLines) {
    // PF sans gamme → ligne ignorée (consistance depth-1 : pas de route = pas planifiable).
    if (!gammeMap.get(l.article)?.workstation) continue
    explode(l.article, l.quantite, l.nature, l.date, 0, new Set())
  }
  return raws
}

/**
 * Netting FIFO par article : le stock (physique + CQ) est consommé depuis le
 * besoin à la date la plus tôt. Résidu = besoin net. `brutHours` inchangé.
 */
export function netCharge(raws: ChargeRaw[], stockByArticle: Map<string, number>): ChargeNeed[] {
  const byArticle = new Map<string, ChargeRaw[]>()
  for (const r of raws) {
    const arr = byArticle.get(r.article)
    if (arr) arr.push(r)
    else byArticle.set(r.article, [r])
  }

  const out: ChargeNeed[] = []
  for (const arr of byArticle.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime())
    let pool = stockByArticle.get(arr[0].article) ?? 0
    for (const r of arr) {
      const netQty = pool >= r.qty ? 0 : r.qty - pool
      pool = Math.max(0, pool - r.qty)
      out.push({
        wst: r.wst,
        date: r.date,
        article: r.article,
        nature: r.nature,
        depth: r.depth,
        brutHours: r.qty / r.rate,
        netHours: netQty / r.rate,
      })
    }
  }
  return out
}
