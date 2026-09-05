/**
 * Projection matières « time-phased » — le bilan par composant et par période
 * qui dit OÙ ça coince, pas seulement COMBIEN il manque.
 *
 * Pur : aucune I/O. Le loader charge, ce moteur décide.
 *
 * ## Pourquoi ce moteur remplace `netMaterial`
 *
 * `netMaterial` nettait le besoin explosé contre une photo de stock étalée sur
 * tout l'horizon, sans aucune arrivée. Trois défauts rédhibitoires pour un
 * contrôle de faisabilité du plan de charge :
 *
 *  1. **aucune arrivée** — un composant à 0 en stock avec 5 000 pièces qui
 *     arrivent lundi était annoncé manquant toutes les semaines de l'horizon ;
 *  2. **pas de date** — trois crans brut/net/reste répondaient « combien »,
 *     jamais « à partir de quand » ; or « où ça coince » est une question de date ;
 *  3. **stock des sous-ensembles jamais netté pendant la descente** — un SE avec
 *     500 en stock explosait quand même la totalité de ses composants. Le besoin
 *     acheté sous un SE stocké était systématiquement surévalué.
 *
 * ## Le modèle
 *
 * MRP standard : traitement NIVEAU PAR NIVEAU (low-level code), et à chaque
 * niveau une projection chronologique par bucket :
 *
 * ```
 * dispo(t)   = solde(t-1) + arrivées(t)
 * couvert(t) = min(dispo(t), besoin(t))          ferme servi avant prévision
 * manque(t)  = besoin(t) − couvert(t)            ← le besoin NET
 * solde(t)   = dispo(t) − couvert(t)             ← jamais négatif
 * ```
 *
 * Le manque n'est pas un solde négatif qu'on traîne : c'est le **besoin net**,
 * et c'est LUI qui descend dans la nomenclature. Un composant sous un parent
 * déjà couvert par son stock n'est donc plus appelé du tout.
 *
 * Deux conséquences qui font la valeur de l'écran :
 *  - `manque[t] > 0` pour un acheté = la quantité à commander pour ce bucket ;
 *  - le premier bucket à manque = la **date de rupture** du composant.
 *
 * ## Ce que ce moteur ne fait pas (assumé, à dire à l'écran)
 *
 *  - **Aucun décalage de délai** (D1) : le besoin est daté à la date de demande
 *    client, pas à la date de commande fournisseur. La page répond « voici mon
 *    besoin et quand il tombe », pas encore « voici quand commander ».
 *  - **Nature ferme/prévision servie dans l'ordre au sein d'un bucket, jamais
 *    entre buckets** : la chronologie prime. Une lecture « ferme seul » EXACTE
 *    s'obtient en rejouant ce moteur sans les demandes de prévision — c'est un
 *    second passage complet, et c'est le prix de la justesse chronologique
 *    (l'ancienne priorité ferme globale la donnait gratuitement, au prix d'un
 *    solde daté faux dès qu'on injecte des arrivées).
 *  - **Aucune traçabilité descendante** : le netting fusionne les origines. Le
 *    drill-down « appelé par » reste servi par l'explosion BRUTE en profondeur
 *    d'abord (`explodeMaterialNeeds`), qui, elle, porte `path` et `ChargeSource`.
 *    Les deux répondent à deux questions différentes et sont étiquetées comme
 *    telles : « tout ce qui est appelé » vs « ce qui manquera vraiment ».
 */
import type { ChargeNature } from './charge_explosion.js'
import { requiredQuantity, type NomenclatureEntry } from './models/nomenclature.js'

/** Profondeur d'explosion par défaut — alignée sur `charge_explosion`. */
export const DEFAULT_MAX_DEPTH = 4

/**
 * Garde-fou de la passe de niveaux : une nomenclature cyclique ferait diverger
 * le calcul de low-level code. Au-delà, l'article n'est plus repoussé vers le
 * bas et le cycle s'arrête de lui-même.
 */
const LLC_CAP = 32

/** Demande d'un article sur un bucket de la fenêtre (niveau 0 de la projection). */
export interface ProjectionDemand {
  article: string
  /** Index du bucket dans la fenêtre. Hors fenêtre : à écarter par l'appelant. */
  bucket: number
  nature: ChargeNature
  qty: number
}

/** Ressources d'un article — tout est optionnel, l'absence vaut zéro. */
export interface ArticleSupply {
  /** Stock disponible à date : solde de départ. */
  stock?: number
  /**
   * En-cours de fabrication non déclaré (pièces produites sur un OF ouvert, pas
   * encore entrées en stock). Crédité au PREMIER bucket : c'est de la matière
   * qui existe physiquement, elle n'a aucune raison d'attendre.
   */
  encours?: number
  /**
   * Arrivées attendues par bucket (réceptions d'achat ouvertes). Longueur
   * `buckets` ; les arrivées déjà en retard sont repliées sur le bucket 0 par
   * l'appelant, qui les signale à part.
   */
  arrivees?: number[]
}

export interface ProjectionOptions {
  /** Nombre de buckets de la fenêtre. */
  buckets: number
  supply?: (article: string) => ArticleSupply | undefined
  /**
   * Fantômes AFANT : leur stock couvre d'abord, le besoin net descend, mais ils
   * ne sont JAMAIS une ligne du tableau (ni stockés ni lancés) et ne consomment
   * pas de profondeur — même sémantique que `walkExplosion`.
   */
  isPhantom?: (article: string) => boolean
  /** Achetés : feuilles par règle. Pas de descente, et jamais une troncature. */
  isPurchased?: (article: string) => boolean
  maxDepth?: number
}

/** Bilan projeté d'un article sur la fenêtre. Tous les tableaux ont la même longueur. */
export interface ArticleProjection {
  article: string
  /**
   * Profondeur d'émission la plus HAUTE atteinte (0 = article de la demande).
   * Les fantômes traversés ne comptent pas. Sert au filtre « c'est une ligne
   * appro ou la demande elle-même ».
   */
  depth: number
  stockInitial: number
  encours: number
  arrivees: number[]
  /** Besoin appelé par les parents — déjà NET de ce que les parents couvrent. */
  besoinFerme: number[]
  besoinPrevi: number[]
  /** Stock projeté disponible en fin de bucket. Jamais négatif (cf. en-tête). */
  solde: number[]
  /** Besoin net non couvert du bucket — pour un acheté : la quantité à commander. */
  manqueFerme: number[]
  manquePrevi: number[]
  /** Premier bucket portant un manque, `-1` si la fenêtre passe entière. */
  ruptureAt: number
  /** Descendance coupée par le plafond de profondeur — à marquer à l'écran. */
  tronque: boolean
}

export interface ProjectionResult {
  byArticle: Map<string, ArticleProjection>
  /** Branches réellement coupées par le plafond (diagnostic global). */
  truncated: number
}

/** Tolérance de comparaison — les quantités traînent du bruit flottant. */
const EPS = 1e-6

const zeros = (n: number): number[] => new Array<number>(n).fill(0)

/**
 * Low-level code : le niveau le PLUS BAS où chaque article apparaît. Traiter les
 * articles dans cet ordre garantit qu'un article a reçu TOUS ses besoins parents
 * avant d'être netté — c'est la condition de correction d'un MRP niveau par niveau.
 *
 * Deux profondeurs distinctes, et c'est volontaire :
 *  - `llc` compte tous les niveaux (fantômes compris) : c'est l'ordre topologique ;
 *  - `emit` ne compte que les niveaux matérialisés : c'est ce que voit le plafond
 *    `maxDepth` et ce qu'affiche l'écran, en parité stricte avec `walkExplosion`.
 */
function computeLevels(
  roots: Iterable<string>,
  bomByParent: Map<string, NomenclatureEntry[]>,
  opts: { isPhantom: (a: string) => boolean; isPurchased: (a: string) => boolean; maxDepth: number }
): { llc: Map<string, number>; emit: Map<string, number>; cut: Set<string>; truncated: number } {
  const llc = new Map<string, number>()
  const emit = new Map<string, number>()

  const queue: string[] = []
  const push = (article: string, level: number, emitLevel: number): void => {
    if (level > LLC_CAP) return // nomenclature cyclique : on arrête de repousser
    const knownLlc = llc.get(article)
    const knownEmit = emit.get(article)
    const nextLlc = knownLlc === undefined ? level : Math.max(knownLlc, level)
    const nextEmit = knownEmit === undefined ? emitLevel : Math.max(knownEmit, emitLevel)
    // Re-enfiler dès que l'une des deux profondeurs s'aggrave : un article
    // repoussé plus bas doit repropager, sinon le plafond est mal appliqué à
    // sa descendance.
    if (knownLlc !== undefined && nextLlc === knownLlc && nextEmit === knownEmit) return
    llc.set(article, nextLlc)
    emit.set(article, nextEmit)
    queue.push(article)
  }

  for (const r of roots) push(r, 0, 0)
  while (queue.length) {
    const article = queue.shift()!
    if (opts.isPurchased(article)) continue // feuille par règle
    const bom = bomByParent.get(article)
    if (!bom?.length) continue
    // Fantôme aplati : les enfants héritent de SA profondeur d'émission.
    const emitLevel = emit.get(article) ?? 0
    const nextEmit = opts.isPhantom(article) ? emitLevel : emitLevel + 1
    if (nextEmit > opts.maxDepth) continue
    for (const e of bom) push(e.componentArticle, (llc.get(article) ?? 0) + 1, nextEmit)
  }

  // Troncatures comptées APRÈS stabilisation des niveaux : les compter pendant
  // la relaxation les aurait multipliées par le nombre de repasses.
  const cut = new Set<string>()
  let truncated = 0
  for (const [article, emitLevel] of emit) {
    if (opts.isPurchased(article)) continue
    const bom = bomByParent.get(article)
    if (!bom?.length) continue
    const nextEmit = opts.isPhantom(article) ? emitLevel : emitLevel + 1
    if (nextEmit <= opts.maxDepth) continue
    let realCut = false
    for (const e of bom) {
      if (opts.isPhantom(e.componentArticle)) continue // transparent : rien ne disparaît
      realCut = true
      // Une feuille par règle (acheté) n'est pas une descendance perdue.
      if (!opts.isPurchased(e.componentArticle)) truncated += 1
    }
    if (realCut) cut.add(article)
  }

  return { llc, emit, cut, truncated }
}

/**
 * Projection matières niveau par niveau sur la fenêtre.
 *
 * `demands` porte la demande de niveau 0 déjà bucketisée (les lignes hors
 * fenêtre sont écartées par l'appelant). `bomByParent` est l'index BOM COMPLET
 * (achetés inclus) — c'est `collectBom(entries, { includePurchased: true })`.
 *
 * Les fantômes sont projetés (leur stock couvre) mais jamais rendus : ils
 * n'apparaissent pas dans `byArticle`.
 */
export function projectMaterialPlan(
  demands: ProjectionDemand[],
  bomByParent: Map<string, NomenclatureEntry[]>,
  opts: ProjectionOptions
): ProjectionResult {
  const n = opts.buckets
  const isPhantom = opts.isPhantom ?? (() => false)
  const isPurchased = opts.isPurchased ?? (() => false)
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const supplyOf = opts.supply ?? (() => undefined)

  // Besoin brut accumulé par article, alimenté par la demande puis par chaque
  // niveau traité au-dessus.
  const grossFerme = new Map<string, number[]>()
  const grossPrevi = new Map<string, number[]>()
  const grossOf = (article: string, nature: ChargeNature): number[] => {
    const map = nature === 'ferme' ? grossFerme : grossPrevi
    let arr = map.get(article)
    if (!arr) {
      arr = zeros(n)
      map.set(article, arr)
    }
    return arr
  }

  const roots = new Set<string>()
  for (const d of demands) {
    if (d.bucket < 0 || d.bucket >= n || d.qty <= 0) continue
    roots.add(d.article)
    grossOf(d.article, d.nature)[d.bucket] += d.qty
  }

  const { llc, emit, cut, truncated } = computeLevels(roots, bomByParent, {
    isPhantom,
    isPurchased,
    maxDepth,
  })

  // Ordre de traitement : low-level code croissant. Un article n'est netté
  // qu'une fois tous ses parents traités.
  const ordered = [...llc.keys()].sort((a, b) => (llc.get(a) ?? 0) - (llc.get(b) ?? 0))

  const byArticle = new Map<string, ArticleProjection>()

  for (const article of ordered) {
    const bf = grossFerme.get(article) ?? zeros(n)
    const bp = grossPrevi.get(article) ?? zeros(n)
    const sup = supplyOf(article)
    const stock = sup?.stock ?? 0
    const encours = sup?.encours ?? 0
    // Copie normalisée à la longueur de la fenêtre : un tableau court venu de
    // l'appelant ne doit pas laisser d'`undefined` dans le payload.
    const arrivees = zeros(n)
    if (sup?.arrivees) {
      for (let t = 0; t < n; t++) arrivees[t] = sup.arrivees[t] ?? 0
    }

    const solde = zeros(n)
    const manqueFerme = zeros(n)
    const manquePrevi = zeros(n)
    let ruptureAt = -1
    // L'en-cours existe physiquement : crédité d'entrée, avec le stock.
    let carry = stock + encours

    for (let t = 0; t < n; t++) {
      let dispo = carry + (arrivees[t] ?? 0)
      // Ferme servi avant prévision AU SEIN du bucket — jamais entre buckets :
      // la chronologie prime (cf. en-tête).
      const covF = Math.min(Math.max(dispo, 0), bf[t])
      dispo -= covF
      const covP = Math.min(Math.max(dispo, 0), bp[t])
      dispo -= covP
      manqueFerme[t] = bf[t] - covF
      manquePrevi[t] = bp[t] - covP
      solde[t] = dispo
      carry = dispo
      if (ruptureAt < 0 && manqueFerme[t] + manquePrevi[t] > EPS) ruptureAt = t
    }

    const phantom = isPhantom(article)
    if (!phantom) {
      byArticle.set(article, {
        article,
        depth: emit.get(article) ?? 0,
        stockInitial: stock,
        encours,
        arrivees,
        besoinFerme: bf,
        besoinPrevi: bp,
        solde,
        manqueFerme,
        manquePrevi,
        ruptureAt,
        tronque: cut.has(article),
      })
    }

    // Descente : c'est le besoin NET (le manque) qui appelle les composants —
    // pas le besoin brut. Un parent couvert par son stock n'appelle rien.
    if (isPurchased(article)) continue
    const bom = bomByParent.get(article)
    if (!bom?.length) continue
    const nextEmit = phantom ? (emit.get(article) ?? 0) : (emit.get(article) ?? 0) + 1
    if (nextEmit > maxDepth) continue

    for (const entry of bom) {
      const childF = grossOf(entry.componentArticle, 'ferme')
      const childP = grossOf(entry.componentArticle, 'prevision')
      for (let t = 0; t < n; t++) {
        // FORFAIT : quantité fixe dès qu'il y a un besoin sur le bucket, pas de
        // prorata (choix conservateur repris de `explodeQuantity`).
        if (manqueFerme[t] > EPS) childF[t] += requiredQuantity(entry, manqueFerme[t])
        if (manquePrevi[t] > EPS) childP[t] += requiredQuantity(entry, manquePrevi[t])
      }
    }
  }

  return { byArticle, truncated }
}
