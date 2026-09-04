/**
 * Plan d'approvisionnement — besoins matières (lot 1, v1 « voici mon besoin »).
 *
 * Pur : aucune I/O — le loader charge les données, ce moteur décide.
 *
 * Chaîne :
 * 1. `explodeMaterialNeeds` — explosion QUANTITÉ (un besoin par article, sans
 *    exigence de gamme) avec ARRÊT SUR ACHETÉ (feuille à acheter) et descente
 *    des sous-ensembles fabriqués jusqu'à `maxDepth` (fantômes aplatis, stock
 *    fantôme consommé d'abord — règle 2 de `rupture_engine`).
 * 2. `netMaterial` — netting à PRIORITÉ FERME : le stock couvre d'abord le
 *    ferme (FIFO par date), le reliquat couvre la prévision. Propriété clé :
 *    `netFerme` vaut EXACTEMENT ce que donnerait un calcul ferme-seul (même
 *    ordre FIFO au sein du ferme) — pas de second calcul, pas de bascule.
 *    L'en-cours priorise le ferme lui aussi, pour la même raison.
 *
 * Conventions reprises de la charge SANS les dupliquer : besoin daté à la date
 * de demande client (pas de décalage de délai, D1 assumé), stock snapshot
 * « maintenant » (strict + CQ), en-cours = cran « reste ».
 */
import {
  collectBom,
  explodeQuantity,
  type ChargeNature,
  type ChargeNeed,
  type ChargeOrderLine,
  type ChargeRaw,
  type QuantityExplodeOptions,
} from './charge_explosion.js'
import type { NomenclatureEntry } from './models/nomenclature.js'

export interface MaterialExplodeOptions {
  maxDepth?: number
  /** Fantômes aplatis (ni émis, ni comptés, traversés sans consommer de profondeur). */
  isPhantom?: (article: string) => boolean
  /**
   * Articles achetés : pas de descente depuis eux (feuilles à acheter) et pas
   * de troncature comptée sur eux. Construit par l'appelant depuis les types
   * d'approvisionnement.
   */
  isPurchased?: (article: string) => boolean
  /**
   * Stock des fantômes : couvre le besoin avant descente du reliquat, ferme
   * d'abord (règle 2 de `rupture_engine`). Sans lui, descente pleine —
   * le stock du fantôme serait perdu.
   */
  phantomStock?: Map<string, number>
  /** Remonté tel quel vers `explodeQuantity` (troncature + parents coupés). */
  stats?: QuantityExplodeOptions['stats']
}

/**
 * Explosion matières : enveloppe du mode quantité avec arrêt sur acheté.
 *
 * Le filtre ne porte QUE sur la descente (liens dont le parent est acheté
 * retirés de l'index) : un composant acheté reste ÉMIS comme feuille — c'est
 * exactement la population de l'approvisionneur.
 */
export function explodeMaterialNeeds(
  orderLines: ChargeOrderLine[],
  entries: NomenclatureEntry[],
  opts: MaterialExplodeOptions = {}
): ChargeRaw[] {
  const isPurchased = opts.isPurchased ?? (() => false)
  const descended = entries.filter((e) => !isPurchased(e.parentArticle))
  const bomByParent = collectBom(descended, { includePurchased: true })
  return explodeQuantity(orderLines, bomByParent, {
    maxDepth: opts.maxDepth,
    isPhantom: opts.isPhantom,
    isPurchased: opts.isPurchased,
    phantomStock: opts.phantomStock,
    stats: opts.stats,
  })
}

/**
 * Netting à priorité ferme, par article, en DEUX passes comme `netCharge`
 * (stock puis en-cours, FIFO par date) — mais le ferme consomme les pools
 * AVANT la prévision.
 *
 * Pourquoi pas `netCharge` : celui-ci nette en FIFO par date toutes natures
 * confondues — une prévision de septembre y mangerait le stock d'une commande
 * ferme d'octobre, et `netFerme` ne répondrait plus à « que dois-je si je ne
 * crois que le carnet ». Ici le ferme est servi en premier, donc `netFerme`
 * répond à cette question sans second calcul.
 */
export function netMaterial(
  raws: ChargeRaw[],
  stockByArticle: Map<string, number> = new Map(),
  encoursByArticle: Map<string, number> = new Map()
): ChargeNeed[] {
  const byArticle = new Map<string, ChargeRaw[]>()
  for (const r of raws) {
    const arr = byArticle.get(r.article)
    if (arr) arr.push(r)
    else byArticle.set(r.article, [r])
  }

  const byDate = (a: ChargeRaw, b: ChargeRaw) => a.date.getTime() - b.date.getTime()
  const out: ChargeNeed[] = []
  for (const arr of byArticle.values()) {
    // Ferme d'abord (FIFO par date), prévision ensuite sur le reliquat.
    const ordered = [
      ...arr.filter((r) => r.nature === 'ferme').sort(byDate),
      ...arr.filter((r) => r.nature !== 'ferme').sort(byDate),
    ]
    let stockPool = stockByArticle.get(arr[0].article) ?? 0
    let encoursPool = encoursByArticle.get(arr[0].article) ?? 0
    for (const r of ordered) {
      const netQty = stockPool >= r.qty ? 0 : r.qty - stockPool
      stockPool = Math.max(0, stockPool - r.qty)
      const resteQty = encoursPool >= netQty ? 0 : netQty - encoursPool
      encoursPool = Math.max(0, encoursPool - netQty)
      out.push({
        wst: r.wst,
        date: r.date,
        article: r.article,
        nature: r.nature satisfies ChargeNature,
        depth: r.depth,
        brutHours: 0,
        netHours: 0,
        resteHours: 0,
        brutQty: r.qty,
        netQty,
        resteQty,
        encoursQty: netQty - resteQty,
        path: r.path,
        source: r.source,
      })
    }
  }
  return out
}
