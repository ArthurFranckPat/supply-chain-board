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
 * « maintenant », en-cours = cran « reste ».
 *
 * DIVERGENCE assumée avec la charge sur le pool de stock : `netMaterial` reçoit
 * le stock PHYSIQUE + CQ, allocations ERP réintégrées, là où la charge nette sur
 * `strict`. Motif dans `sumAvailableStock` — cette page compte la demande sans
 * retirer les allocations composant, retirer celles-ci du stock ferait payer la
 * même réservation deux fois. Le pool reste un paramètre : ce moteur ne décide
 * pas de sa composition.
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
import { groupGammeByArticle } from './models/gamme.js'
import type { GammeOperation } from './models/gamme.js'
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
 * Ligne de production portant du besoin — option du sélecteur de la page
 * approvisionnement. `count` = nombre de lignes de demande acheminées.
 */
export interface MaterialLigneOption {
  /** Poste de charge (1ʳᵉ opération de gamme du PF), ex. `PP_830`. */
  code: string
  /** Libellé X3 du poste (repli : le code). */
  label: string
  count: number
}

/**
 * Ligne de production d'un article : le poste de sa **1ʳᵉ opération** de gamme
 * — même règle que le rattachement des OF au board
 * (`buildPosteNatureByWorkstation`). L'ordre de lecture de la sync statique
 * (OPENUM ascendant) porte la 1ʳᵇ opération en tête de groupe.
 * Record sérialisable : traverse le pinning du snapshot tel quel.
 */
export function buildLigneByArticle(gammeOps: GammeOperation[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [article, ops] of groupGammeByArticle(gammeOps)) {
    const wst = (ops[0]?.workstation ?? '').trim()
    if (wst) out[article] = wst
  }
  return out
}

/** Libellé lisible par poste de charge (1ʳᵉ occurrence de la sync), repli code. */
export function buildLigneLabelByWst(gammeOps: GammeOperation[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const g of gammeOps) {
    const wst = (g.workstation ?? '').trim()
    if (wst && out[wst] === undefined) out[wst] = g.workstationLabel?.trim() || wst
  }
  return out
}

/**
 * Options du sélecteur de ligne : les lignes qui portent au moins une demande
 * de la fenêtre, TOUTES natures confondues et indépendamment du filtre actif —
 * le dropdown ne se réduit pas quand une ligne est choisie. Un PF sans route
 * (anomalie référentiel) reste dans « toutes les lignes » mais hors sélecteur.
 */
export function collectLigneOptions(
  orderLines: ChargeOrderLine[],
  ligneByArticle: Record<string, string>,
  labelByWst: Record<string, string>
): MaterialLigneOption[] {
  const counts = new Map<string, number>()
  for (const l of orderLines) {
    const wst = ligneByArticle[l.article]
    if (!wst) continue
    counts.set(wst, (counts.get(wst) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, label: labelByWst[code] || code, count }))
    .sort((a, b) => a.code.localeCompare(b.code))
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
