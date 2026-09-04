/**
 * Plan d'approvisionnement — loader (lot 1, v1 « voici mon besoin »).
 *
 * Calcule, sur une fenêtre [from, to] et une maille (jour / semaine / mois), les
 * besoins matières ventilés ferme / prévision par article composant :
 * explosion quantité (arrêt sur acheté, fantômes aplatis avec stock consommé
 * d'abord) + netting à priorité ferme (stock puis en-cours).
 *
 * Sources (caches SWR `boardDataset`, comme la charge) : lignes de demande
 * ORDERS WIPTYP=1 (`getOrderLinesForLoad`), nomenclature complète SQLite,
 * articles (types appro + catégories), OF fenêtre + pointages (en-cours),
 * stock PHYSIQUE + CQ (allocations ERP réintégrées, cf. `sumAvailableStock`).
 *
 * Divergences assumées avec /charge (écrites ici, pas subies) :
 * - les OVERRIDES de dates posés par les drags de /planification SONT appliqués
 *   (lignes COMMANDE seules) : le plan appro suit l'intention planificateur ;
 * - le netting PRIORISE LE FERME (cf. `netMaterial`), là où /charge nette en
 *   FIFO global — les deux mentions sont rappelées dans l'en-tête de page.
 *
 * Règles de lecture :
 * - lignes depth 0 exclues (la demande elle-même), SAUF racine achetée (négoce :
 *   le besoin d'achat du PF est réel) ;
 * - besoins hors buckets (override sorti de fenêtre) ignorés ;
 * - plafond 14 périodes → 400 explicite, jamais de tableau dégénéré ;
 * - filtre `ligne` (poste 1ʳᵉ op de gamme du PF de tête) : restreint les lignes
 *   de demande AVANT explosion — quantités exactes de la ligne, pas un masque
 *   sur des totaux toutes lignes confondues. Options du sélecteur rendues dans
 *   le payload (`lignes`), calculées sur la population complète.
 */
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OperationRecord } from '#repositories/operation_repository'
import type { Flow } from '#app/domain/models/flow'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { addDays, atMidnight, isoDay, isoWeek, mondayOf } from '#app/utils/dates'
import { computeAvancement } from '#app/domain/of_avancement'
import { buildEncoursByArticle } from '#services/load_payload_loader'
import { explodeMaterialNeeds, netMaterial } from '#app/domain/material_plan'
import {
  buildLigneByArticle,
  buildLigneLabelByWst,
  collectLigneOptions,
  type MaterialLigneOption,
} from '#app/domain/material_plan'
import type { ChargeNeed, ChargeOrderLine } from '#app/domain/charge_explosion'

export type MaterialGran = 'jour' | 'semaine' | 'mois'

/** Plafond de lisibilité : 14 périodes (×2 avec le double bucket ferme/prévision). */
export const MATERIAL_MAX_PERIODS = 14

export interface MaterialBucket {
  key: string
  label: string
}

export interface MaterialRow {
  article: string
  description: string
  supplyType: 'ACHAT' | 'FABRICATION'
  stock: number
  /**
   * Valorisation du stock (stock × PMP actuel ITMMVT, même convention que le
   * KPI stock dashboard), NULL si PMP inconnu — sert au tri « Valorisation ».
   */
  valeur: number | null
  brutFerme: number[]
  brutPrevi: number[]
  netFerme: number[]
  netPrevi: number[]
  resteFerme: number[]
  restePrevi: number[]
  /** Descendance incomplète (coupe profondeur) — à marquer à l'écran. */
  tronque: boolean
}

export interface MaterialPayload {
  buckets: MaterialBucket[]
  rows: MaterialRow[]
  /**
   * Lignes de production portant du besoin sur la fenêtre (toutes — le
   * sélecteur ne se réduit pas quand une ligne est choisie).
   */
  lignes: MaterialLigneOption[]
  /** Version du snapshot pinné — le détail d'un article la réclame. */
  version: string
  /** Branches coupées par le plafond de profondeur (diagnostic). */
  truncated: number
  x3Error: string | null
}

export interface MaterialDetailLine {
  /** Jour de la demande (YYYY-MM-DD) — le panneau regroupe par semaine. */
  date: string
  numCommande: string | null
  ligne: string | null
  client: string | null
  pfArticle: string
  nature: 'ferme' | 'prevision'
  quantite: number
  path: string[]
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Paramètre invalide (maille, fenêtre, plafond) — le contrôleur répond 400
 * plutôt que de servir un tableau plausible mais faux. Cf. `ChargeDetailBadRequest`.
 */
export class MaterialBadRequest extends Error {}

const monthLabel = (d: Date): string => {
  const s = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  return `${s.charAt(0).toUpperCase() + s.slice(1)} ${d.getFullYear()}`
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Buckets couvrant [from, to] (inclus) à la maille demandée. Pur, testable —
 * c'est ici que le plafond 14 périodes est appliqué, AVANT tout calcul lourd.
 */
export function materialBuckets(
  from: Date,
  to: Date,
  gran: MaterialGran
): { buckets: MaterialBucket[] } | { error: string } {
  const start = atMidnight(from)
  const end = atMidnight(to)
  if (start > end) return { error: 'from doit précéder to (YYYY-MM-DD)' }
  const buckets: MaterialBucket[] = []
  if (gran === 'jour') {
    for (let cur = new Date(start); cur <= end; cur = addDays(cur, 1)) {
      const dd = String(cur.getDate()).padStart(2, '0')
      const mm = String(cur.getMonth() + 1).padStart(2, '0')
      buckets.push({ key: isoDay(cur), label: `${dd}/${mm}` })
    }
  } else if (gran === 'semaine') {
    for (let cur = mondayOf(start); cur <= end; cur = addDays(cur, 7)) {
      const dd = String(cur.getDate()).padStart(2, '0')
      const mm = String(cur.getMonth() + 1).padStart(2, '0')
      buckets.push({ key: isoDay(cur), label: `S${isoWeek(cur)} · ${dd}/${mm}` })
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cur <= last) {
      buckets.push({ key: `${cur.getFullYear()}-${cur.getMonth() + 1}`, label: monthLabel(cur) })
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  if (buckets.length > MATERIAL_MAX_PERIODS) {
    return {
      error: `${buckets.length} périodes à la maille ${gran} (plafond ${MATERIAL_MAX_PERIODS}) — élargissez la maille ou réduisez la fenêtre`,
    }
  }
  return { buckets }
}

/** Clé bucket d'un besoin daté — null si inconnu (ne devrait pas arriver). */
function needBucketKey(date: Date, gran: MaterialGran): string {
  const d = atMidnight(date)
  if (gran === 'jour') return isoDay(d)
  if (gran === 'semaine') return isoDay(mondayOf(d))
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

/** Entrées du calcul, partagées agrégat ↔ détail (même pattern que la charge). */
export interface MaterialInputs {
  orderLines: ChargeOrderLine[]
  entries: NomenclatureEntry[]
  /** Catégorie article (fantômes AFANT) — Record sérialisable pour le pinning. */
  catByArticle: Record<string, string>
  /** Type appro (arrêt sur acheté + racines négoce) — idem. */
  supplyByArticle: Record<string, string>
  descByArticle: Record<string, string>
  /**
   * Ligne de production (poste 1ʳᵉ op de gamme) par article PF — idem,
   * sérialisable : le filtre ligne sert avant explosion ET avant pinning.
   */
  ligneByArticle: Record<string, string>
  /** Libellé par poste de charge — idem. */
  ligneLabelByWst: Record<string, string>
  mos: ManufacturingOrder[]
  operations: OperationRecord[]
  x3Error: string | null
}

const toYYYYMMDD = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${da}`
}

/**
 * Lookback des OF porteurs d'en-cours : un OF démarré il y a plus de 90 jours et
 * toujours ouvert relève de l'anomalie, pas du plan. Même borne que le lookback
 * ENDDAT de `getOrders()`.
 */
const ENCOURS_LOOKBACK_DAYS = 90

/**
 * Lecture des sources sur [from, to]. Les overrides de dates (/planification)
 * sont appliqués aux lignes COMMANDE : le plan appro suit l'intention
 * planificateur, même quand elle a bougé depuis ENDDAT_0.
 *
 * L'EN-COURS ne se lit PAS sur [from, to] : c'est un état présent de l'atelier,
 * pas une projection. `getOrdersForWindow` étant scopé STRDAT, lire la fenêtre
 * d'affichage donnait zéro OF démarré dès qu'elle était future — le cran
 * « reste » retombait alors silencieusement sur « net », ce qui est le cas du
 * préréglage par défaut (« mois prochain ») — et amputait l'en-cours des OF
 * lancés avant `from` sur une fenêtre courte. On lit donc [J-90, aujourd'hui] :
 * clé de cache stable à la journée, partagée par toutes les fenêtres de la page.
 */
export async function fetchMaterialInputs(
  from: Date,
  to: Date,
  force = false
): Promise<MaterialInputs> {
  const today = atMidnight(new Date())
  const encoursFrom = addDays(today, -ENCOURS_LOOKBACK_DAYS)
  const [olR, nomR, artR, ordR, ovMap, gamR] = await Promise.allSettled([
    boardDataset.getOrderLinesForLoad(toYYYYMMDD(from), toYYYYMMDD(to), force),
    staticSync.readNomenclatures(),
    // `staticSync.readArticles()` en direct et non `boardDataset.getArticles()` :
    // ce dernier avale l'échec en `[]`, ce qui rendait la branche `x3Error`
    // ci-dessous inatteignable. Sans types d'appro, l'arrêt sur acheté disparaît,
    // TOUTES les lignes passent en FABRICATION et la page — dont le filtre par
    // défaut est ACHAT — s'affiche vide, sans un mot. Un référentiel manquant
    // doit se dire.
    staticSync.readArticles(),
    boardDataset.getOrdersForWindow(encoursFrom, today, force),
    new OrderLineOverrideStore().getMap(),
    staticSync.readGammes(),
  ])

  let x3Error: string | null = null
  const rawLines = olR.status === 'fulfilled' ? olR.value : []
  if (olR.status !== 'fulfilled') x3Error = (olR.reason as Error).message
  const entries = nomR.status === 'fulfilled' ? nomR.value : []
  if (nomR.status !== 'fulfilled') x3Error = x3Error ?? (nomR.reason as Error).message
  const articles = artR.status === 'fulfilled' ? artR.value : []
  if (artR.status !== 'fulfilled') x3Error = x3Error ?? (artR.reason as Error).message
  const mos = ordR.status === 'fulfilled' ? ordR.value.mos : []
  if (ordR.status !== 'fulfilled') x3Error = x3Error ?? (ordR.reason as Error).message
  const overrides = ovMap.status === 'fulfilled' ? ovMap.value : new Map<string, string>()
  const gammes = gamR.status === 'fulfilled' ? gamR.value : []
  if (gamR.status !== 'fulfilled') x3Error = x3Error ?? (gamR.reason as Error).message

  const orderLines: ChargeOrderLine[] = rawLines.map((l) => {
    let date = atMidnight(l.dateLivraison)
    // Override drag /planification : mêmes clé et garde que `remapDemandDates`
    // (lignes commande seules — une prévision n'a pas de drag).
    if (l.nature === 'COMMANDE' && l.numCommande) {
      const ov = overrides.get(`${l.numCommande}#${l.ligne ?? ''}`)
      if (ov && ISO_RE.test(ov)) date = atMidnight(new Date(ov))
    }
    return {
      article: l.article,
      quantite: l.quantite,
      date,
      nature: (l.nature === 'PREVISION' ? 'prevision' : 'ferme') as 'ferme' | 'prevision',
      source: {
        numCommande: l.numCommande,
        ligne: l.ligne,
        client: l.clientCode,
        pfArticle: l.article,
      },
    }
  })

  const catByArticle: Record<string, string> = {}
  const supplyByArticle: Record<string, string> = {}
  const descByArticle: Record<string, string> = {}
  for (const a of articles) {
    catByArticle[a.code] = a.category ?? ''
    supplyByArticle[a.code] = a.supplyType ?? ''
    if (a.description) descByArticle[a.code] = a.description
  }

  // Pointages atelier — même cadrage que la charge : OF fermes démarrés seuls.
  const startedMos = mos.filter(
    (mo) => mo.status === 1 && mo.startDate && atMidnight(mo.startDate) <= today
  )
  const operations = await boardDataset
    .getOperations(startedMos.map((mo) => mo.numOf))
    .catch(() => [])

  return {
    orderLines,
    entries,
    catByArticle,
    supplyByArticle,
    descByArticle,
    ligneByArticle: buildLigneByArticle(gammes),
    ligneLabelByWst: buildLigneLabelByWst(gammes),
    // Volontairement RESTREINT aux OF fermes démarrés — le pool d'en-cours ne
    // doit contenir que les OF dont les pointages ont effectivement été lus.
    // `buildEncoursByArticle` calcule `quantity − resteAProduire(...)`, or
    // `resteAProduire` vaut 0 quand EXTQTY_0 est nul : un OF suggéré ou
    // planifié y créditerait sa quantité ENTIÈRE comme « déjà produite mais pas
    // déclarée ». Le garde annoncé par la doc de `buildEncoursByArticle`
    // (« EXTQTY === RMNEXTQTY ») ne tient que sur les OF lancés : on ne lui
    // donne que ceux-là.
    mos: startedMos,
    operations,
    x3Error,
  }
}

const isPhantomCat = (cat: string | undefined): boolean => (cat ?? '').toUpperCase() === 'AFANT'

/**
 * Stock des articles explosés — seule lecture hors inputs (cf. charge). Remonte
 * aussi le PMP (déjà présent sur les flows, `AVC_0`) pour la valorisation : zéro
 * requête en plus. La RÈGLE DE COMPTAGE vit dans `sumAvailableStock`.
 */
/**
 * Pool de stock du plan appro, par article : **physique + CQ**, allocations
 * ERP RÉINTÉGRÉES. Pur et exporté — c'est la règle de comptage de la page.
 *
 * Pourquoi réintégrer, alors que le reste du projet nette sur `strict` :
 * une allocation ERP réserve du composant à un OF, et cet OF sert une commande
 * client que cette page compte DÉJÀ dans son besoin. La retirer du stock sans
 * retirer le besoin correspondant fait payer la même réservation deux fois.
 * Mesuré sur 11022900 au 04/09/2026 : 1 162 unités réservées à 6 OF dont les
 * 6 commandes figurent toutes dans le brut — manque annoncé 1 472, manque réel
 * 310, écart exactement égal aux 1 162.
 *
 * Deux conventions cohérentes existaient ; c'est la moins chère qui est prise :
 *  - besoin brut  contre stock physique          → 7 756 / 7 446 = 310 ;
 *  - besoin net des allocations contre `strict`  → 6 594 / 6 284 = 310.
 * La seconde est plus fidèle (elle daterait la réservation) mais suppose de
 * savoir QUELLE commande chaque OF sert : c'est la règle 3 de `rupture_engine`,
 * qui part des OF et dispose de `allocationsByOf`. Le plan appro part de la
 * demande client et n'a aucune couche OF — l'y brancher suppose le matching
 * commande↔OF, pas ce correctif.
 *
 * APPROXIMATION ASSUMÉE : une réservation servant une demande HORS fenêtre est
 * ici recréditée. C'est la même simplification que le reste du modèle, qui
 * étale un stock « maintenant » sur tout l'horizon sans le dater.
 *
 * LIMITE CONNUE, inchangée : quand X3 alloue au-delà du physique, aucun flux
 * `strict` n'est émis (garde `strict > 0` du repository) et l'article retombe
 * sur son seul CQ. Comportement d'avant ce correctif, pas une régression.
 */
export function sumAvailableStock(flows: Flow[]): {
  stock: Map<string, number>
  pmp: Map<string, number>
} {
  const stockByArticle = new Map<string, number>()
  const pmpByArticle = new Map<string, number>()
  for (const f of flows) {
    if (f.origin.type !== 'stock') continue
    const sub = f.origin.subType
    if (sub !== 'strict' && sub !== 'qc') continue
    const reserved = sub === 'strict' ? (f.origin.allocated ?? 0) : 0
    stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity + reserved)
    // PMP par article (identique sur les deux flows) — premier non nul gagne.
    if (!pmpByArticle.has(f.article) && f.origin.pmp != null && f.origin.pmp > 0) {
      pmpByArticle.set(f.article, f.origin.pmp)
    }
  }
  return { stock: stockByArticle, pmp: pmpByArticle }
}

async function computeMaterialStock(
  explodedArticles: string[],
  force = false
): Promise<{ stock: Map<string, number>; pmp: Map<string, number> }> {
  if (explodedArticles.length === 0) return { stock: new Map(), pmp: new Map() }
  return sumAvailableStock(await boardDataset.getStock(explodedArticles, force).catch(() => []))
}

interface Exploded {
  needs: ChargeNeed[]
  truncated: number
  cutParents: Set<string>
}

function explodeAndNet(inputs: MaterialInputs, stock: Map<string, number>): Exploded {
  const { catByArticle, supplyByArticle } = inputs
  const stats: { truncated: number; cutParents?: string[] } = { truncated: 0, cutParents: [] }
  const raws = explodeMaterialNeeds(inputs.orderLines, inputs.entries, {
    isPhantom: (a) => isPhantomCat(catByArticle[a]),
    isPurchased: (a) => supplyByArticle[a] === 'ACHAT',
    // Le stock inclut les fantômes traversés (lus par l'agrégat, repinnés
    // pour le détail) : couvre d'abord, descente du reliquat.
    phantomStock: stock,
    stats,
  })
  const encours = buildEncoursByArticle({
    mos: inputs.mos,
    avancementByOf: computeAvancement(inputs.operations),
  })
  return {
    needs: netMaterial(raws, stock, encours),
    truncated: stats.truncated,
    cutParents: new Set(stats.cutParents ?? []),
  }
}

/**
 * Ligne composant : depth ≥ 1, OU racine achetée (négoce — le besoin d'achat
 * du PF est réel). Les racines fabriquées sont la demande elle-même, déjà lue
 * dans /charge : pas une ligne appro.
 */
function keepRow(article: string, depth: number, supplyByArticle: Record<string, string>): boolean {
  if (depth > 0) return true
  return supplyByArticle[article] === 'ACHAT'
}

function emptyRow(
  article: string,
  buckets: number,
  descByArticle: Record<string, string>,
  supplyByArticle: Record<string, string>
): MaterialRow {
  const zeros = () => new Array<number>(buckets).fill(0)
  return {
    article,
    description: descByArticle[article] ?? '',
    supplyType: supplyByArticle[article] === 'ACHAT' ? 'ACHAT' : 'FABRICATION',
    stock: 0,
    valeur: null,
    brutFerme: zeros(),
    brutPrevi: zeros(),
    netFerme: zeros(),
    netPrevi: zeros(),
    resteFerme: zeros(),
    restePrevi: zeros(),
    tronque: false,
  }
}

/**
 * Sous-ensemble du BOM réellement utilisable par une explosion : les liens dont
 * le PARENT a été visité par la passe de découverte.
 *
 * Le marcheur ne consulte `bomByParent` que pour les nœuds qu'il visite, et
 * `explodeAndNet` visite un SOUS-ensemble de la découverte (mêmes lignes, mêmes
 * prédicats, plus l'élagage par stock fantôme). Filtrer sur `reached` est donc
 * exact, pas approché : aucun lien atteignable n'est retiré.
 *
 * Motif : le snapshot pinné embarquait les ~34 000 entrées de la nomenclature
 * COMPLÈTE, retraversées par superjson vers le L2 (fichier en dev, Redis en
 * prod) à CHAQUE calcul de payload, pour une explosion qui n'en touche qu'une
 * fraction. C'est ce qui rend `PINNED_KEPT = 24` tenable.
 */
function reachableBom(entries: NomenclatureEntry[], reached: Set<string>): NomenclatureEntry[] {
  return entries.filter((e) => reached.has(e.parentArticle))
}

/** Snapshot pinné d'une exécution — le détail rejoue EXACTEMENT la même matière. */
interface PinnedMaterialSnapshot {
  inputs: MaterialInputs
  stock: Array<[string, number]>
}

/**
 * Snapshots simultanément conservés. Plus large que les 5 de la charge : depuis
 * que la version est unique PAR EXÉCUTION (et non par fenêtre), un rafraîchi SWR
 * de fond pousse une version de plus toutes les 2 min. À 5, une page laissée
 * ouverte quelques minutes voyait son propre snapshot évincé, et le détail
 * répondait « Snapshot expiré » sur une grille pourtant encore affichée. Le coût
 * mémoire est tenu par la réduction du BOM pinné (cf. `reachableBom`).
 */
const PINNED_KEPT = 24
const PINNED_TTL = 12 * 60 * 60 * 1000

/**
 * Identifiant unique d'une exécution du calcul.
 *
 * SURTOUT PAS la clé de cache du payload : elle est déterministe, donc chaque
 * recalcul (SWR de fond, ⟳, expiration du TTL) écrasait le snapshot sous la MÊME
 * version. La grille gardait ses chiffres pendant que le détail rejouait des
 * entrées plus récentes — exactement la divergence que le pinning existe pour
 * supprimer (cf. `pinChargeInputs`). Suffixe aléatoire : deux calculs concurrents
 * peuvent tomber dans la même milliseconde.
 */
const newVersion = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

async function pinMaterialInputs(version: string, snapshot: PinnedMaterialSnapshot): Promise<void> {
  await cacheNs('material').set({
    key: `material:inputs:${version}`,
    value: snapshot,
    ttl: PINNED_TTL,
  })
  const indexEntry = await cacheNs('material')
    .get<{ v: string[] }>({ key: 'material:inputs:index' })
    .catch(() => null)
  const known = indexEntry?.v ?? []
  const kept = [version, ...known.filter((v) => v !== version)].slice(0, PINNED_KEPT)
  await cacheNs('material').set({
    key: 'material:inputs:index',
    value: { v: kept },
    ttl: PINNED_TTL,
  })
  for (const stale of known) {
    if (!kept.includes(stale))
      await cacheNs('material')
        .delete({ key: `material:inputs:${stale}` })
        .catch(() => {})
  }
}

async function getPinnedMaterialInputs(version: string): Promise<PinnedMaterialSnapshot | null> {
  return cacheNs('material')
    .get<PinnedMaterialSnapshot>({ key: `material:inputs:${version}` })
    .catch(() => null)
}

export interface MaterialParams {
  from: string
  to: string
  gran: string
  force?: boolean
  /**
   * Ligne de production retenue (poste 1ʳᵉ op de gamme du PF de tête) —
   * absent/vide = toutes. Le filtrage porte sur les lignes de demande AVANT
   * explosion : les quantités affichées sont exactement celles de la ligne.
   */
  ligne?: string
}

/**
 * Pas de `fence` ici, volontairement : l'horizon de demande est au lot 3,
 * branché sur le FOH par produit fini (`ITMFACILIT.FOH_0` — plan D7, §8),
 * jamais une clôture globale ressaisie à la main. Le jour où il revient, il
 * s'applique au niveau 0 AVANT explosion (pas après, pour ne pas fausser le
 * netting) — et « clôture = +∞ » INCLUT tout, pas l'inverse.
 */
function parseParams(
  params: MaterialParams
): { from: Date; to: Date; gran: MaterialGran } | { error: string } {
  if (!ISO_RE.test(params.from) || !ISO_RE.test(params.to)) {
    return { error: 'from/to au format YYYY-MM-DD requis' }
  }
  if (params.gran !== 'jour' && params.gran !== 'semaine' && params.gran !== 'mois') {
    return { error: 'gran doit valoir jour, semaine ou mois' }
  }
  return {
    from: atMidnight(new Date(params.from)),
    to: atMidnight(new Date(params.to)),
    gran: params.gran,
  }
}

/**
 * Cœur du payload — sans HttpContext (endpoint HTTP + futur tool agent).
 * Le tri par défaut est le net total décroissant : l'appro lit ses manques.
 */
export async function loadMaterialPayloadData(params: MaterialParams) {
  const parsed = parseParams(params)
  if ('error' in parsed) throw new MaterialBadRequest(parsed.error)
  const { from, to, gran } = parsed
  const force = !!params.force
  const ligne = (params.ligne ?? '').trim()

  const bucketed = materialBuckets(from, to, gran)
  if ('error' in bucketed) throw new MaterialBadRequest(bucketed.error)
  const { buckets } = bucketed
  const idxByKey = new Map(buckets.map((bk, i) => [bk.key, i]))

  // Validation du poste AVANT le cache, et non dans la factory : bentocache
  // enveloppe toute erreur de factory dans un `E_FACTORY_ERROR` (cf. son
  // `#processFactoryError`), le `instanceof MaterialBadRequest` du contrôleur ne
  // matchait donc plus et une ligne inconnue rendait 500 au lieu de 400.
  // Un poste inconnu du référentiel gammes est un paramètre faux ; une ligne
  // connue sans demande sur la fenêtre rend honnêtement zéro ligne.
  // Lecture SQLite (~2 900 lignes), payée seulement quand un filtre est posé.
  if (ligne) {
    const labels = buildLigneLabelByWst(await staticSync.readGammes())
    // `Object.hasOwn` et non `!== undefined` : sur un objet nu, `__proto__` ou
    // `constructor` passeraient la garde et rendraient une grille vide.
    if (!Object.hasOwn(labels, ligne)) {
      throw new MaterialBadRequest(`ligne de production inconnue : ${ligne}`)
    }
  }

  // Suffixe ligne : une valeur pinnée « toutes » ne doit jamais servir à une
  // ligne (et réciproquement) — populations et versions divergentes.
  const cacheKey = `payload:material:${isoDay(from)}:${isoDay(to)}:${gran}${ligne ? `:${ligne}` : ''}`
  const materialCache = () => cacheNs('material')
  if (force) await materialCache().delete({ key: cacheKey })

  return materialCache().getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<MaterialPayload> => {
      const inputs = await fetchMaterialInputs(from, to, force)
      // Filtrage AVANT explosion ET pinning : le détail rejoue exactement la
      // population de la ligne choisie (un seul chemin de calcul, même motif
      // que agrégat ↔ détail).
      const activeInputs: MaterialInputs = ligne
        ? {
            ...inputs,
            orderLines: inputs.orderLines.filter((l) => inputs.ligneByArticle[l.article] === ligne),
          }
        : inputs
      // Options TOUJOURS sur la population complète : le sélecteur ne se
      // réduit pas quand une ligne est choisie.
      const lignes = collectLigneOptions(
        inputs.orderLines,
        inputs.ligneByArticle,
        inputs.ligneLabelByWst
      )
      const isPhantom = (a: string): boolean => isPhantomCat(activeInputs.catByArticle[a])
      const isPurchased = (a: string): boolean => activeInputs.supplyByArticle[a] === 'ACHAT'
      // Stock lu sur les articles appelés + les fantômes traversés : jamais
      // émis (pas des lignes du tableau), mais leur stock couvre les enfants
      // avant descente du reliquat (règle 2 de `rupture_engine`).
      // Passe de découverte sans déduction — le calcul final passe par
      // `explodeAndNet`, comme le détail depuis le snapshot pinné.
      const traversedPhantoms = new Set<string>()
      const discovery = explodeMaterialNeeds(activeInputs.orderLines, activeInputs.entries, {
        isPhantom: (a) => {
          const p = isPhantom(a)
          if (p) traversedPhantoms.add(a)
          return p
        },
        isPurchased,
      })
      // Tous les nœuds VISITÉS par la découverte : émis (non fantômes) +
      // fantômes traversés. Sert deux fois — périmètre de lecture du stock, et
      // réduction du BOM pinné (`reachableBom`).
      const reached = new Set([...discovery.map((r) => r.article), ...traversedPhantoms])
      const { stock, pmp } = await computeMaterialStock([...reached], force)
      // Un seul chemin de calcul agrégat ↔ détail : le snapshot pinné rejoue
      // exactement cette fonction.
      const { needs, truncated, cutParents } = explodeAndNet(activeInputs, stock)

      const rows = new Map<string, MaterialRow>()
      const rowFor = (article: string): MaterialRow => {
        let row = rows.get(article)
        if (!row) {
          row = emptyRow(
            article,
            buckets.length,
            activeInputs.descByArticle,
            activeInputs.supplyByArticle
          )
          const qty = stock.get(article) ?? 0
          const unit = pmp.get(article)
          row.stock = round2(qty)
          row.valeur = unit == null ? null : round2(qty * unit)
          row.tronque = cutParents.has(article)
          rows.set(article, row)
        }
        return row
      }
      for (const n of needs) {
        if (!keepRow(n.article, n.depth, activeInputs.supplyByArticle)) continue
        const idx = idxByKey.get(needBucketKey(n.date, gran))
        if (idx === undefined) continue // override sorti de fenêtre
        const row = rowFor(n.article)
        if (n.nature === 'ferme') {
          row.brutFerme[idx] += n.brutQty
          row.netFerme[idx] += n.netQty
          row.resteFerme[idx] += n.resteQty
        } else {
          row.brutPrevi[idx] += n.brutQty
          row.netPrevi[idx] += n.netQty
          row.restePrevi[idx] += n.resteQty
        }
      }
      // Arrondi UNIQUE en fin d'accumulation : arrondir à chaque ajout dérive
      // sur les gros consommateurs (E7768 : 332 nomenclatures parentes).
      for (const row of rows.values()) {
        for (const arr of [
          row.brutFerme,
          row.brutPrevi,
          row.netFerme,
          row.netPrevi,
          row.resteFerme,
          row.restePrevi,
        ]) {
          for (let i = 0; i < arr.length; i++) arr[i] = round2(arr[i])
        }
      }
      const sorted = [...rows.values()].sort((a, b) => {
        const netA = a.netFerme.reduce((s, v) => s + v, 0) + a.netPrevi.reduce((s, v) => s + v, 0)
        const netB = b.netFerme.reduce((s, v) => s + v, 0) + b.netPrevi.reduce((s, v) => s + v, 0)
        return netB - netA
      })

      // Pinne les ENTRÉES (pas le résultat) : le détail rejoue le même calcul —
      // ici la population FILTRÉE par ligne, pour un détail cohérent.
      const version = newVersion()
      await pinMaterialInputs(version, {
        inputs: { ...activeInputs, entries: reachableBom(activeInputs.entries, reached) },
        stock: [...stock.entries()],
      })

      return {
        buckets,
        lignes,
        rows: sorted,
        version,
        truncated,
        x3Error: activeInputs.x3Error,
      }
    }),
  })
}

/**
 * Détail « appelé par » d'un article — rejoué depuis le snapshot pinné de la
 * version affichée, jamais depuis des caches qui auraient tourné entre temps.
 * Regroupé par (commande, ligne, PF, nature, chemin) : deux appels par des
 * chemins différents restent deux lignes (traçabilité complète).
 */
export async function loadMaterialDetailData(
  version: string,
  article: string,
  from: string,
  to: string
): Promise<{ article: string; lignes: MaterialDetailLine[] } | null> {
  if (!ISO_RE.test(from) || !ISO_RE.test(to)) return null
  const pinned = await getPinnedMaterialInputs(version)
  if (!pinned) return null
  const { needs } = explodeAndNet(pinned.inputs, new Map(pinned.stock))
  const fromD = atMidnight(new Date(from))
  const toD = atMidnight(new Date(to))
  toD.setHours(23, 59, 59, 999)

  const grouped = new Map<string, MaterialDetailLine>()
  for (const n of needs) {
    if (n.article !== article) continue
    if (n.date < fromD || n.date > toD) continue
    if (!keepRow(n.article, n.depth, pinned.inputs.supplyByArticle)) continue
    const s = n.source
    // La date fait partie de l'identité : le panneau regroupe par semaine, une
    // agrégation toutes dates confondues rendrait ce regroupement impossible.
    const key = `${s?.numCommande ?? ''}#${s?.ligne ?? ''}#${s?.pfArticle ?? ''}#${n.nature}#${n.path.join('>')}:${isoDay(n.date)}`
    const line = grouped.get(key)
    if (line) {
      line.quantite += n.brutQty
    } else {
      grouped.set(key, {
        date: isoDay(n.date),
        numCommande: s?.numCommande ?? null,
        ligne: s?.ligne ?? null,
        client: s?.client ?? null,
        pfArticle: s?.pfArticle ?? n.article,
        nature: n.nature === 'ferme' ? 'ferme' : 'prevision',
        quantite: n.brutQty,
        path: n.path,
      })
    }
  }
  // Chronologique d'abord (lecture semaines), puis le manque en tête au sein
  // d'un même jour — l'ancien tri pur quantité scindait une semaine en morceaux.
  const lignes = [...grouped.values()]
    .map((l) => ({ ...l, quantite: round2(l.quantite) }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        b.quantite - a.quantite ||
        (a.numCommande ?? '').localeCompare(b.numCommande ?? '')
    )
  return { article, lignes }
}
