/**
 * Plan d'approvisionnement — explosion brute des besoins matières.
 *
 * Pur : aucune I/O — le loader charge les données, ce moteur décide.
 *
 * `explodeMaterialNeeds` — explosion QUANTITÉ (un besoin par article, sans
 * exigence de gamme) avec ARRÊT SUR ACHETÉ (feuille à acheter) et descente des
 * sous-ensembles fabriqués jusqu'à `maxDepth` (fantômes aplatis, stock fantôme
 * consommé d'abord — règle 2 de `rupture_engine`).
 *
 * C'est une explosion BRUTE, en profondeur d'abord : elle porte `path` et
 * `ChargeSource` jusqu'au bas de la nomenclature, donc elle SEULE sait répondre
 * « ce composant est appelé par quelle commande ». C'est ce qui alimente le
 * drill-down.
 *
 * Elle ne calcule AUCUN manque. Le bilan projeté — besoin net, arrivées, stock
 * projeté, date de rupture — est le travail de `material_projection`, qui nette
 * niveau par niveau et par période. Les deux partent des mêmes entrées et
 * répondent à deux questions différentes : « tout ce qui est appelé » d'un
 * côté, « ce qui manquera vraiment » de l'autre.
 *
 * Convention reprise de la charge SANS la dupliquer : besoin daté à la date de
 * demande client (pas de décalage de délai, D1 assumé).
 */
import {
  collectBom,
  explodeQuantity,
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
