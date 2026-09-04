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
import { hoursForQuantity, hasChargeRoute, type GammeOperation } from './models/gamme.js'

export type ChargeNature = 'ferme' | 'prevision'

/** Segment d'une barre de charge en vue OF : Ferme / Planifié / Suggéré. */
export type ChargeOfSeg = 'f' | 'p' | 's'
/** Segment en vue commande : les 3 ci-dessus + les deux induits (fi/si). */
export type ChargeSeg = ChargeOfSeg | 'fi' | 'si'

/**
 * Statut X3 d'un OF (WIPSTA) → segment de barre.
 *
 * Défaut prudent à « Suggéré » comme `mapOfRow` (combined_orders_repository) :
 * un statut inattendu ne doit pas gonfler le ferme.
 */
export function ofSegment(status: number): ChargeOfSeg {
  return status === 1 ? 'f' : status === 2 ? 'p' : 's'
}

/**
 * Besoin de la vue commande → segment de barre : le PF (depth 0) charge en
 * direct (f/s), un composant induit va dans son propre segment (fi/si).
 *
 * Partagé par l'agrégat (`load_payload_loader`) et le détail d'un bucket
 * (`charge_detail_loader`). Le détail promet de ne jamais diverger de la barre
 * qu'il explique — c'est ici que ça se joue, donc ça ne se duplique pas.
 */
export function chargeSegment(depth: number, nature: ChargeNature): ChargeSeg {
  if (depth === 0) return nature === 'prevision' ? 's' : 'f'
  return nature === 'prevision' ? 'si' : 'fi'
}

/**
 * Provenance d'un besoin : la ligne de demande qui l'a déclenché. Portée telle
 * quelle du PF jusqu'aux composants les plus profonds — c'est ce qui permet au
 * détail de charge de répondre « ce composant est chargé POUR QUI ».
 *
 * Sur une prévision (ORDERS WIPSTA=3), `numCommande` est un identifiant
 * technique de prévision et `client` est vide côté X3 : une prévision n'a pas
 * de client. L'affichage doit le dire, pas laisser un trou.
 */
export interface ChargeSource {
  numCommande: string | null
  ligne: string | null
  client: string | null
  /** Article du PF de tête (= `article` quand depth 0). */
  pfArticle: string
}

export interface ChargeOrderLine {
  article: string
  quantite: number
  date: Date
  nature: ChargeNature
  source?: ChargeSource
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
  /**
   * Chemin BOM complet, en ordre d'ASCENDANCE : produit fini en tête, parent
   * immédiat en queue (exclut l'article lui-même). Vide au depth 0.
   *
   * Chaîne entière et non dernier maillon : au-delà du niveau 1, « via C1 » ne
   * dit pas de quel produit fini C1 descend, et la ligne devient illisible face
   * à sa commande.
   *
   * L'ordre stocké est celui de la descente (racine d'abord), convention usuelle
   * d'un chemin. L'AFFICHAGE le prend à l'envers : on lit en remontant depuis
   * l'article vers le produit fini. Ne pas inverser ici — d'autres lectures
   * (profondeur, ancêtres) attendent la racine en tête.
   */
  path: string[]
  /** Ligne de demande d'origine (absente si l'appelant n'en fournit pas). */
  source: ChargeSource | null
}

/**
 * Besoin après déductions, prêt à être ventilé en heures.
 *
 * Trois niveaux, volontairement conservés côte à côte plutôt que fondus dans une
 * seule valeur — un besoin qui baisse parce qu'il y a du stock et un besoin qui
 * baisse parce que l'atelier a déjà produit n'appellent pas la même décision :
 *
 *   brut   besoin explosé depuis la commande
 *   net    brut − stock disponible (strict + CQ)        ← sens historique, inchangé
 *   reste  net − en-cours déjà produit non déclaré      ← ce qu'il reste vraiment à faire
 */
export interface ChargeNeed {
  wst: string
  date: Date
  article: string
  nature: ChargeNature
  depth: number
  brutHours: number
  netHours: number
  /** Heures après déduction de l'en-cours — le chiffre actionnable. */
  resteHours: number
  /** Quantités correspondantes — la table de détail les affiche à côté des heures. */
  brutQty: number
  netQty: number
  resteQty: number
  /**
   * Part du besoin absorbée par des pièces déjà produites et pas encore déclarées
   * (`netQty − resteQty`). Portée explicitement pour que le détail puisse dire
   * POURQUOI la ligne a baissé, au lieu d'afficher un chiffre plus petit sans
   * justification.
   */
  encoursQty: number
  /** Chemin BOM du produit fini au parent immédiat (vide au depth 0). */
  path: string[]
  source: ChargeSource | null
}

const DEFAULT_MAX_DEPTH = 4

/** Nœud visité pendant la descente — transmis aux hooks du marcheur. */
interface WalkNode {
  article: string
  qty: number
  nature: ChargeNature
  date: Date
  depth: number
  path: string[]
  source: ChargeSource | null
}

interface WalkerHooks {
  /** Émission du besoin pour le nœud visité (silence pour un fantôme aplati). */
  emit?: (node: WalkNode) => void
  /**
   * Fantôme : traversé SANS émettre et SANS consommer de profondeur (transparent).
   * La garde anti-cycle reste active — une boucle de fantômes ne boucle pas.
   */
  isPassThrough?: (article: string) => boolean
  /** Enfants présents mais non descendus cause plafond — le hook compte ce qu'il veut. */
  onDepthCut?: (article: string, children: NomenclatureEntry[]) => void
}

/**
 * Marcheur BOM partagé (mode heures + mode quantité). Sémantique de descente
 * UNIQUE : garde anti-cycle (Set d'ancêtres), cap de profondeur, chemin complet.
 * Seule l'ÉMISSION diffère par mode — jamais la traversée.
 */
function walkExplosion(
  orderLines: ChargeOrderLine[],
  bomByParent: Map<string, NomenclatureEntry[]>,
  maxDepth: number,
  hooks: WalkerHooks
): void {
  const visit = (
    article: string,
    qty: number,
    nature: ChargeNature,
    date: Date,
    depth: number,
    ancestors: Set<string>,
    path: string[],
    source: ChargeSource | null
  ): void => {
    if (ancestors.has(article)) return // garde anti-cycle
    const passThrough = hooks.isPassThrough?.(article) ?? false
    if (!passThrough) {
      hooks.emit?.({ article, qty, nature, date, depth, path, source })
    }
    const bom = bomByParent.get(article)
    if (!bom?.length) return
    // Fantôme aplati : les enfants héritent de la profondeur du fantôme.
    // `depth + 1 > maxDepth` ⟺ ancien `depth >= maxDepth` (parité stricte).
    const nextDepth = passThrough ? depth : depth + 1
    if (nextDepth > maxDepth) {
      hooks.onDepthCut?.(article, bom)
      return
    }
    const next = new Set(ancestors).add(article)
    for (const entry of bom) {
      visit(
        entry.componentArticle,
        requiredQuantity(entry, qty),
        nature,
        date,
        nextDepth,
        next,
        // Le chemin s'allonge de l'article courant : l'enfant hérite de toute
        // la lignée, pas seulement de son parent.
        [...path, article],
        source
      )
    }
  }

  for (const l of orderLines) {
    visit(l.article, l.quantite, l.nature, l.date, 0, new Set(), [], l.source ?? null)
  }
}

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
  gammeMap: Map<string, GammeOperation[]>,
  maxDepth: number = DEFAULT_MAX_DEPTH
): ChargeRaw[] {
  const raws: ChargeRaw[] = []
  walkExplosion(
    // PF sans gamme → ligne ignorée (consistance depth-1 : pas de route = pas planifiable).
    orderLines.filter((l) => hasChargeRoute(gammeMap.get(l.article))),
    bomByParent,
    maxDepth,
    {
      emit: ({ article, qty, nature, date, depth, path, source }) => {
        for (const gamme of gammeMap.get(article) ?? []) {
          const rate = gamme.rate ?? 0
          if (gamme.workstation && rate > 0) {
            raws.push({
              article,
              wst: gamme.workstation,
              date,
              nature,
              depth,
              qty,
              rate,
              path,
              source,
            })
          }
        }
      },
    }
  )
  return raws
}

export interface QuantityExplodeOptions {
  maxDepth?: number
  /**
   * Fantômes aplatis : traversés sans émettre (un fantôme n'est ni stocké ni
   * lancé — l'émettre créerait un « manque » permanent + un double compte avec
   * ses enfants). Construit par l'appelant depuis les catégories article.
   */
  isPhantom?: (article: string) => boolean
  /**
   * Compteur incrémenté des enfants FABRIQUÉS non-fantômes coupés par le plafond,
   * + parents coupés (une entrée par coupe, doublons possibles — l'appelant
   * déduplique) pour marquer les lignes à descendance incomplète à l'écran.
   */
  stats?: { truncated: number; cutParents?: string[] }
}

/**
 * Explosion QUANTITÉ (plan d'approvisionnement) : un besoin PAR ARTICLE, sans
 * exigence de gamme (un PF sans route et un composant acheté ont quand même
 * besoin de matière). Les achetés sont inclus dès que la nomenclature passée
 * les contient (cf. `collectBom`) — l'arrêt sur acheté se fait dans
 * `material_plan`, pas ici.
 *
 * Émission « sans poste » (wst vide, rate 0) : les heures valent 0, les
 * quantités portent le besoin. `netCharge` fonctionne tel quel dessus.
 */
export function explodeQuantity(
  orderLines: ChargeOrderLine[],
  bomByParent: Map<string, NomenclatureEntry[]>,
  opts: QuantityExplodeOptions = {}
): ChargeRaw[] {
  const raws: ChargeRaw[] = []
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const isPhantom = opts.isPhantom ?? (() => false)
  walkExplosion(orderLines, bomByParent, maxDepth, {
    emit: ({ article, qty, nature, date, depth, path, source }) => {
      raws.push({ article, wst: '', date, nature, depth, qty, rate: 0, path, source })
    },
    isPassThrough: isPhantom,
    onDepthCut: (article, children) => {
      if (!opts.stats) return
      let cut = false
      for (const c of children) {
        if (isPhantom(c.componentArticle)) continue // transparent : rien ne disparaît
        cut = true
        // Seule la descendance « attendue » compte : un acheté est une feuille
        // par règle, pas une troncature.
        if (c.componentType === 'FABRIQUE') opts.stats.truncated += 1
      }
      if (cut) opts.stats.cutParents?.push(article)
    },
  })
  return raws
}

/**
 * Index BOM parent → enfants depuis des entrées brutes.
 *
 * Mode heures (défaut) : FABRIQUÉS seuls — un acheté n'a pas de poste, pas de
 * charge induite. Mode quantité (`includePurchased`) : nomenclature complète,
 * feuilles achetées incluses. Le filtre vit ICI et nulle part ailleurs : un
 * seul endroit à auditer quand un besoin manque.
 */
export function collectBom(
  entries: NomenclatureEntry[],
  opts: { includePurchased?: boolean } = {}
): Map<string, NomenclatureEntry[]> {
  const map = new Map<string, NomenclatureEntry[]>()
  for (const e of entries) {
    if (!opts.includePurchased && e.componentType !== 'FABRIQUE') continue
    const arr = map.get(e.parentArticle)
    if (arr) arr.push(e)
    else map.set(e.parentArticle, [e])
  }
  return map
}

/**
 * Netting FIFO par article, en DEUX passes séquentielles depuis le besoin à la
 * date la plus tôt :
 *
 *  1. le stock (physique + CQ) est consommé sur le besoin brut → `netQty` ;
 *  2. l'en-cours (pièces produites mais pas encore déclarées) est consommé sur
 *     ce résidu → `resteQty`.
 *
 * L'ordre n'est pas neutre : il préserve la définition historique de `netQty`
 * (« besoin − stock »), que la bascule Brut/Net affiche depuis toujours. Fondre
 * l'en-cours dedans aurait changé silencieusement le sens d'un chiffre déjà lu
 * en réunion.
 *
 * `encoursByArticle` porte UNIQUEMENT l'en-cours invisible du stock : dès qu'un
 * OF déclare sa production, les pièces basculent en stock et sont comptées par
 * la passe 1. Cf. la construction de ce pool dans `computeChargeNeeds` — c'est
 * le même garde `EXTQTY === RMNEXTQTY` qui évite le double-compte des deux côtés.
 */
export function netCharge(
  raws: ChargeRaw[],
  stockByArticle: Map<string, number>,
  encoursByArticle: Map<string, number> = new Map()
): ChargeNeed[] {
  const byArticle = new Map<string, ChargeRaw[]>()
  for (const r of raws) {
    const arr = byArticle.get(r.article)
    if (arr) arr.push(r)
    else byArticle.set(r.article, [r])
  }

  const out: ChargeNeed[] = []
  for (const arr of byArticle.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime())
    let stockPool = stockByArticle.get(arr[0].article) ?? 0
    let encoursPool = encoursByArticle.get(arr[0].article) ?? 0
    for (const r of arr) {
      const netQty = stockPool >= r.qty ? 0 : r.qty - stockPool
      stockPool = Math.max(0, stockPool - r.qty)
      const resteQty = encoursPool >= netQty ? 0 : netQty - encoursPool
      encoursPool = Math.max(0, encoursPool - netQty)
      out.push({
        wst: r.wst,
        date: r.date,
        article: r.article,
        nature: r.nature,
        depth: r.depth,
        brutHours: hoursForQuantity(r, r.qty),
        netHours: hoursForQuantity(r, netQty),
        resteHours: hoursForQuantity(r, resteQty),
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
