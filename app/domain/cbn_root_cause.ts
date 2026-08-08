import type { DriverDiffEntry, DriverSource, DriverDiffNature } from '#app/domain/cbn_driver_diff'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { fmtFr, joursEntre } from '#app/utils/dates'
import { TOLERANCE_ECHEANCE_JOURS } from '#app/domain/appro_decision'

/**
 * Moteur de cause racine : remonter la nomenclature pour expliquer un
 * besoin avancé (#142).
 *
 * Le moteur `cbn_explanation.ts` (lot 1/2) ne lit que les drivers du MÊME
 * article. Or un composant acheté comme `A7370` n'a ni demande ferme ni
 * prévision : son besoin est entièrement dérivé de ses parents dans la
 * nomenclature. Le moteur actuel ne remontera jamais à la cause.
 *
 * Ce module remonte la nomenclature à partir d'une ligne avancée, en suivant
 * l'intersection entre la nomenclature et le diff — pas la nomenclature
 * entière. Sur l'exemple réel : 38 ancêtres, 3 seulement ont bougé.
 *
 * Pur, sans I/O. Le service passe un `RootCauseLoader` qui fournit les
 * parents BOM et les écarts bruts (sans seuil) par article.
 *
 * ## Doctrine des suggestions vs `cbn_explanation.ts`
 *
 * `cbn_explanation.ts:66-76` écarte délibérément `of_suggestion` et
 * `appro_suggestion` comme causes : « ce ne sont pas des entrées du CBN,
 * ce sont ses SORTIES — expliquer un symptôme par un autre symptôme du même
 * calcul, une tautologie ».
 *
 * Ici, les suggestions du **parent** ne sont PAS la suggestion de l'**enfant** :
 * ce sont deux calculs indépendants du CBN sur deux articles différents. La
 * suggestion du parent est une entrée pour le besoin du composant. Et le point
 * d'arrêt ne nomme JAMAIS une suggestion comme cause racine — il s'arrête sur
 * `demande_ferme` / `demande_prevision` (demande indépendante) ou sur
 * `cause_inconnue`.
 *
 * ## Limite : glouton sans retour arrière
 *
 * Un seul parent (le mouvement cohérent le plus fort) est retenu par niveau.
 * Si ce parent mène à une impasse alors qu'un frère de moindre amplitude
 * menait à une demande indépendante, le résultat est « cause inconnue » — un
 * faux négatif. Cette limite est assumée pour la V1 ; la levée exigerait une
 * recherche en profondeur avec回-track, hors périmètre.
 */

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Écart brut (sans seuil) pour un article entre deux photos.
 *
 * Contrairement à `DriverDiffEntry`, aucun seuil de ±20 % / ±7 j n'est
 * appliqué : un mouvement de 5 % chez un parent peut expliquer un
 * avancement chez l'enfant (cf. contrainte 1 de l'issue #142).
 *
 * Produit ligne à ligne par `ecartsBrutsPour` — pas par agrégat. Chaque
 * écart correspond à un couple de lignes appariées (ou une ligne orpheline),
 * pas à un total `SUM`/`MIN` par source.
 */
export interface EcartBrut {
  source: DriverSource
  nature: DriverDiffNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
}

/**
 * Fournisseur de données pour la remontée — injecté par le service.
 *
 * **Exclusion Z** : `parentsDe` doit exclure les liens de catégorie `Z*`
 * (~29 % des liens), comme le fait déjà `static_sync_service.ts:365-392`
 * (`readNomenclatures`). Le module est pur et délègue au loader : pas de
 * violation de fait, mais un futur loader adossé à une requête BOM
 * différente réintroduirait ces composants en silence.
 */
export interface RootCauseLoader {
  /** Parents directs d'un composant dans la nomenclature (exclut les liens Z*). */
  parentsDe: (article: string) => NomenclatureEntry[]
  /** Écarts bruts (sans seuil) pour un article entre les deux photos. */
  ecartsBruts: (article: string) => EcartBrut[]
}

export interface MaillonChaine {
  niveau: number
  article: string
  source: DriverSource
  nature: DriverDiffNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
}

export type MotifCauseInconnue = 'aucun_parent_coherent' | 'cycle_detecte' | 'profondeur_max'

export type PointDArret =
  | {
      type: 'demande_independante'
      article: string
      source: DriverSource
      detail: string
    }
  | {
      type: 'cause_inconnue'
      article: string
      motif: MotifCauseInconnue
      /** Profondeur atteinte à l'arrêt (nombre de maillons hors racine). */
      profondeur: number
      /**
       * Articles dont les écarts ont été réellement lus (`ecartsBruts` appelé).
       * Sur `cycle_detecte` : parents déjà visités et donc sautés.
       * Sur `profondeur_max` : vide (les parents n'ont pas été explorés).
       */
      parentsVerifies: string[]
    }
  | {
      type: 'hors_perimetre'
      article: string
      raison: string
    }

export interface RootCauseResult {
  article: string
  chaine: MaillonChaine[]
  pointDArret: PointDArret
}

// ─── Constantes ─────────────────────────────────────────────────────────

/**
 * Sources de demande indépendante : commandes client fermes et prévisions.
 *
 * Un mouvement cohérent sur l'une de ces sources EST la cause racine :
 * elle n'est pas dérivée d'un parent, c'est le déclencheur original.
 */
const SOURCES_DEMANDE_INDEP: ReadonlySet<DriverSource> = new Set<DriverSource>([
  'demande_ferme',
  'demande_prevision',
])

/**
 * Sources de disponibilité : une BAISSE ou un RECUL pousse le besoin du
 * composant plus tôt (moins de stock, de réception ou de suggestion d'achat
 * → plus de production pour compenser → plus de consommation composant).
 *
 * `appro_suggestion` est inclus : c'est la version suggérée de `appro`. Acheter
 * davantage du parent réduit ce qu'on en fabrique, donc réduit le besoin du
 * composant — sens INVERSÉ par rapport aux OF/demande.
 *
 * Typé `Set<DriverSource>` (pas `Set<string>`) : une faute de frappe dans un
 * littéral source est détectée à la compilation, pas en production.
 */
const SOURCES_DISPONIBILITE: ReadonlySet<DriverSource> = new Set<DriverSource>([
  'stock',
  'appro',
  'appro_suggestion',
])

/** Profondeur maximale de remontée dans la nomenclature. Exportée pour les tests. */
export const MAX_NIVEAUX = 10

// ─── Helpers ─────────────────────────────────────────────────────────────

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })

/**
 * Référence du ratio de variation : la plus petite MAGNITUDE, jamais la plus
 * petite valeur signée (le stock strict passe sous zéro). Réplique de
 * `cbn_driver_diff.ts:152` — non exporté là-bas.
 */
const baseRatio = (qa: number, qp: number): number => Math.abs(Math.min(qa, qp)) || 1

const distEcheance = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  if (a === null || b === null) return Number.POSITIVE_INFINITY
  const d = joursEntre(a, b)
  return d === null ? Number.POSITIVE_INFINITY : Math.abs(d)
}

const sortByDateThenQty = (a: DemandSnapshotRow, b: DemandSnapshotRow): number => {
  const da = a.date_echeance ?? '9999'
  const db = b.date_echeance ?? '9999'
  if (da !== db) return da.localeCompare(db)
  return a.quantity - b.quantity
}

// ─── Écarts bruts : appariement ligne à ligne ───────────────────────────

/**
 * Appariement simplifié des lignes d'une source entre deux photos.
 *
 * Deux passes, sans seuil ni plafond :
 * - Passe 0 : jumeaux exacts (même échéance + même quantité). Sans elle, la
 *   passe 1 gloutonne laisse une ligne d'avant voler le jumeau d'une voisine.
 * - Passe 1 : échéance la plus proche, départagée par quantité la plus proche.
 *
 * Plus simple que `apparie()` de `cbn_driver_diff.ts` (pas de passe 2, pas de
 * plafond, pas de garde-fou quantité) : la remontée de cause cherche « qui a
 * bougé », pas l'appariement parfait au pixel.
 */
function apparierLignes(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[]
): {
  paires: Array<[DemandSnapshotRow, DemandSnapshotRow]>
  surplusAvant: DemandSnapshotRow[]
  surplusApres: DemandSnapshotRow[]
} {
  const as = [...avant].sort(sortByDateThenQty)
  const ps = [...apres].sort(sortByDateThenQty)
  const usedP = new Set<number>()
  const paires: Array<[DemandSnapshotRow, DemandSnapshotRow]> = []
  const appariees = new Set<DemandSnapshotRow>()

  for (const a of as) {
    const idx = ps.findIndex(
      (p, i) => !usedP.has(i) && p.date_echeance === a.date_echeance && p.quantity === a.quantity
    )
    if (idx >= 0) {
      usedP.add(idx)
      appariees.add(a)
      paires.push([a, ps[idx]])
    }
  }

  for (const a of as) {
    if (appariees.has(a)) continue
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    let bestQtyDelta = Number.POSITIVE_INFINITY
    ps.forEach((p, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(a.date_echeance, p.date_echeance)
      const qtyDelta = Math.abs(p.quantity - a.quantity)
      if (d < bestDist || (d === bestDist && qtyDelta < bestQtyDelta)) {
        bestDist = d
        bestQtyDelta = qtyDelta
        best = idx
      }
    })
    if (best >= 0) {
      usedP.add(best)
      appariees.add(a)
      paires.push([a, ps[best]])
    }
  }

  return {
    paires,
    surplusAvant: as.filter((a) => !appariees.has(a)),
    surplusApres: ps.filter((_, i) => !usedP.has(i)),
  }
}

function grouperParSource(rows: DemandSnapshotRow[]): Map<string, DemandSnapshotRow[]> {
  const map = new Map<string, DemandSnapshotRow[]>()
  for (const r of rows) {
    const list = map.get(r.source)
    if (list === undefined) map.set(r.source, [r])
    else list.push(r)
  }
  return map
}

/**
 * Écarts bruts (sans seuil) pour un article entre deux photos — ligne à ligne.
 *
 * Détecte TOUT mouvement, même sous le seuil d'affichage de ±20 % / ±7 j, au
 * grain de la LIGNE et non de l'agrégat `SUM`/`MIN` par source (revue PR #158
 * point 2 : l'agrégat perdait le signal quand une ligne bougeait parmi
 * plusieurs de la même source).
 *
 * Les transitions d'échéance `null ↔ date` sont émises comme des écarts
 * `date` à part entière (revue PR #158 point 11).
 *
 * @param avant Rows de l'article sur la photo « avant » (toutes sources)
 * @param apres Rows de l'article sur la photo « après » (toutes sources)
 */
export function ecartsBrutsPour(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[]
): EcartBrut[] {
  const parSourceAvant = grouperParSource(avant)
  const parSourceApres = grouperParSource(apres)
  const sources = new Set([...parSourceAvant.keys(), ...parSourceApres.keys()])
  const out: EcartBrut[] = []

  for (const source of sources) {
    const lignesAvant = parSourceAvant.get(source) ?? []
    const lignesApres = parSourceApres.get(source) ?? []
    const src = source as DriverSource

    if (lignesAvant.length === 0) {
      for (const r of lignesApres) {
        out.push({
          source: src,
          nature: 'apparue',
          quantiteAvant: null,
          quantiteApres: r.quantity,
          echeanceAvant: null,
          echeanceApres: r.date_echeance,
          detail: `${source} apparue : ${qte(r.quantity)} unités${r.date_echeance ? `, échéance ${fmtFr(r.date_echeance)}` : ''}.`,
        })
      }
      continue
    }

    if (lignesApres.length === 0) {
      for (const r of lignesAvant) {
        out.push({
          source: src,
          nature: 'disparue',
          quantiteAvant: r.quantity,
          quantiteApres: null,
          echeanceAvant: r.date_echeance,
          echeanceApres: null,
          detail: `${source} disparue : ${qte(r.quantity)} unités${r.date_echeance ? `, échéance ${fmtFr(r.date_echeance)}` : ''}.`,
        })
      }
      continue
    }

    if (source === 'stock') {
      const qa = lignesAvant[0]!.quantity
      const qp = lignesApres[0]!.quantity
      if (qa !== qp) {
        out.push({
          source: 'stock',
          nature: 'quantite',
          quantiteAvant: qa,
          quantiteApres: qp,
          echeanceAvant: null,
          echeanceApres: null,
          detail: `stock quantité ${qte(qa)} → ${qte(qp)}.`,
        })
      }
      continue
    }

    const { paires, surplusAvant, surplusApres } = apparierLignes(lignesAvant, lignesApres)

    for (const [a, p] of paires) {
      if (a.quantity !== p.quantity) {
        out.push({
          source: src,
          nature: 'quantite',
          quantiteAvant: a.quantity,
          quantiteApres: p.quantity,
          echeanceAvant: a.date_echeance,
          echeanceApres: p.date_echeance,
          detail: `${source} quantité ${qte(a.quantity)} → ${qte(p.quantity)}.`,
        })
      }
      if (a.date_echeance !== p.date_echeance) {
        const d = joursEntre(a.date_echeance, p.date_echeance)
        out.push({
          source: src,
          nature: 'date',
          quantiteAvant: a.quantity,
          quantiteApres: p.quantity,
          echeanceAvant: a.date_echeance,
          echeanceApres: p.date_echeance,
          detail:
            d === null
              ? `${source} échéance ${fmtFr(a.date_echeance)} → ${fmtFr(p.date_echeance)}.`
              : `${source} échéance ${fmtFr(a.date_echeance)} → ${fmtFr(p.date_echeance)} (${d > 0 ? '+' : ''}${d} j).`,
        })
      }
    }

    for (const r of surplusAvant) {
      out.push({
        source: src,
        nature: 'disparue',
        quantiteAvant: r.quantity,
        quantiteApres: null,
        echeanceAvant: r.date_echeance,
        echeanceApres: null,
        detail: `${source} ligne disparue : ${qte(r.quantity)} unités${r.date_echeance ? `, échéance ${fmtFr(r.date_echeance)}` : ''}.`,
      })
    }
    for (const r of surplusApres) {
      out.push({
        source: src,
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: r.quantity,
        echeanceAvant: null,
        echeanceApres: r.date_echeance,
        detail: `${source} ligne apparue : ${qte(r.quantity)} unités${r.date_echeance ? `, échéance ${fmtFr(r.date_echeance)}` : ''}.`,
      })
    }
  }

  return out
}

// ─── Cohérence de sens ──────────────────────────────────────────────────

/**
 * Un écart chez un parent est-il COHÉRENT avec l'avancement de l'enfant ?
 *
 * « Un parent qui grossit ou s'avance explique un enfant avancé ;
 *   un parent qui recule au même moment est une coïncidence. » (#142)
 *
 * La direction attendue dépend de la source :
 * - OF / demande : une HAUSSE ou une AVANCE pousse le besoin du composant
 *   plus tôt (plus de production parent → plus de consommation enfant).
 * - Stock / appro / appro_suggestion : une BAISSE ou un RECUL pousse le
 *   besoin plus tôt (moins de disponibilité → plus de production → plus de
 *   consommation).
 *
 * Sans ce filtre, avec 38 ancêtres, on « expliquera » n'importe quoi.
 */
export function estCoherentAvancement(ecart: EcartBrut): boolean {
  const { source, nature, quantiteAvant, quantiteApres, echeanceAvant, echeanceApres } = ecart

  if (nature === 'renumerotation') return false

  const estDispo = SOURCES_DISPONIBILITE.has(source)

  if (nature === 'apparue') return !estDispo
  if (nature === 'disparue') return estDispo

  if (nature === 'quantite') {
    const augmentation = (quantiteApres ?? 0) > (quantiteAvant ?? 0)
    return estDispo ? !augmentation : augmentation
  }

  if (nature === 'date') {
    const delta = joursEntre(echeanceAvant, echeanceApres)
    if (delta === null) return true
    return estDispo ? delta > 0 : delta < 0
  }

  return false
}

// ─── Amplitude normalisée ───────────────────────────────────────────────

/**
 * Amplitude normalisée d'un écart, MÊME formule que `driverDiffAmplitude`
 * de `cbn_driver_diff.ts:112-126` — pas de réécriture ad hoc (revue PR #158
 * point 1 : la version précédente comparait des pièces avec des jours).
 *
 * - `quantite` : |après−avant| / baseRatio (ratio sans unité)
 * - `date` : |jours| / TOLERANCE_ECHEANCE_JOURS (ratio sans unité) ; `1` pour
 *   une transition null↔date (pas de delta calculable mais événement réel)
 * - `apparue`/`disparue` : 1000 + log10(|qty|+1) (toujours en tête, trié par volume)
 * - `renumerotation` : 0
 */
export function amplitudeEcart(ecart: EcartBrut): number {
  if (ecart.nature === 'renumerotation') return 0
  if (ecart.nature === 'apparue' || ecart.nature === 'disparue') {
    const q = ecart.nature === 'apparue' ? (ecart.quantiteApres ?? 0) : (ecart.quantiteAvant ?? 0)
    return 1000 + Math.log10(Math.abs(q) + 1)
  }
  if (ecart.nature === 'date') {
    const d = joursEntre(ecart.echeanceAvant, ecart.echeanceApres)
    if (d === null) return 1
    return Math.abs(d) / TOLERANCE_ECHEANCE_JOURS
  }
  if (ecart.quantiteAvant === null || ecart.quantiteApres === null) return 0
  return (
    Math.abs(ecart.quantiteApres - ecart.quantiteAvant) /
    baseRatio(ecart.quantiteAvant, ecart.quantiteApres)
  )
}

// ─── Remontée ────────────────────────────────────────────────────────────

/**
 * Remonte la nomenclature pour expliquer pourquoi une ligne de suggestion
 * a avancé.
 *
 * **Périmètre V1** : uniquement les avancements (`nature = 'date'`, delta
 * négatif). Une entrée hors périmètre rend un `pointDArret` `hors_perimetre`
 * sans remonter.
 *
 * **Algorithme glouton** : à chaque niveau, un seul parent (le mouvement
 * cohérent le plus fort) est suivi. Voir la limite documentée en tête de
 * module.
 *
 * @param entree La ligne `DriverDiffEntry` à expliquer.
 * @param loader Fournit les parents BOM et les écarts bruts par article.
 */
export function findRootCause(entree: DriverDiffEntry, loader: RootCauseLoader): RootCauseResult {
  const chaine: MaillonChaine[] = [
    {
      niveau: 0,
      article: entree.article,
      source: entree.source,
      nature: entree.nature,
      quantiteAvant: entree.quantiteAvant,
      quantiteApres: entree.quantiteApres,
      echeanceAvant: entree.echeanceAvant,
      echeanceApres: entree.echeanceApres,
      detail: entree.detail,
    },
  ]

  // Garde périmètre V1 (point 9) : uniquement les avancements.
  const deltaEntree = joursEntre(entree.echeanceAvant, entree.echeanceApres)
  if (entree.nature !== 'date' || deltaEntree === null || deltaEntree >= 0) {
    return {
      article: entree.article,
      chaine,
      pointDArret: {
        type: 'hors_perimetre',
        article: entree.article,
        raison: `V1 limité aux avancements (nature=date, delta négatif) ; reçu nature=${entree.nature}, delta=${deltaEntree}`,
      },
    }
  }

  // Mémo local des écarts par article (point 12) : chaque article est
  // requêté une seule fois, même s'il apparaît sur plusieurs lignes BOM
  // ou s'il est interrogé comme parent puis comme article courant.
  const memo = new Map<string, EcartBrut[]>()
  const ecartsMemo = (article: string): EcartBrut[] => {
    let cached = memo.get(article)
    if (cached === undefined) {
      cached = loader.ecartsBruts(article)
      memo.set(article, cached)
    }
    return cached
  }

  // Demande indépendante sur l'article de départ (cause racine au niveau 0).
  const demandeDepart = ecartsMemo(entree.article).find(
    (e) => SOURCES_DEMANDE_INDEP.has(e.source) && estCoherentAvancement(e)
  )
  if (demandeDepart !== undefined) {
    return {
      article: entree.article,
      chaine,
      pointDArret: {
        type: 'demande_independante',
        article: entree.article,
        source: demandeDepart.source,
        detail: demandeDepart.detail,
      },
    }
  }

  const visited = new Set<string>([entree.article])
  let articleCourant = entree.article

  for (let niveau = 1; niveau <= MAX_NIVEAUX; niveau++) {
    // Parents uniques non visités (point 12 : dédup des liens BOM).
    const parentsBruts = loader.parentsDe(articleCourant)
    const parentsUniques = new Map<string, NomenclatureEntry>()
    for (const p of parentsBruts) {
      if (!parentsUniques.has(p.parentArticle)) parentsUniques.set(p.parentArticle, p)
    }

    // Chercher le mouvement cohérent le plus fort parmi les parents.
    let meilleur: { article: string; ecart: EcartBrut; amplitude: number } | null = null
    const parentsInterroges: string[] = []
    let tousVisites = true

    for (const article of parentsUniques.keys()) {
      if (visited.has(article)) continue
      tousVisites = false
      parentsInterroges.push(article)

      for (const ecart of ecartsMemo(article)) {
        if (estCoherentAvancement(ecart)) {
          const amp = amplitudeEcart(ecart)
          if (
            meilleur === null ||
            amp > meilleur.amplitude ||
            (amp === meilleur.amplitude && article < meilleur.article)
          ) {
            meilleur = { article, ecart, amplitude: amp }
          }
        }
      }
    }

    // Aucun parent cohérent (point 6 : motif typé, point 7 : sémantique fixe).
    if (meilleur === null) {
      const motif: MotifCauseInconnue =
        parentsUniques.size === 0
          ? 'aucun_parent_coherent'
          : tousVisites
            ? 'cycle_detecte'
            : 'aucun_parent_coherent'

      return {
        article: entree.article,
        chaine,
        pointDArret: {
          type: 'cause_inconnue',
          article: articleCourant,
          motif,
          profondeur: niveau - 1,
          parentsVerifies:
            motif === 'cycle_detecte'
              ? [...parentsUniques.keys()].filter((a) => visited.has(a))
              : parentsInterroges,
        },
      }
    }

    // Demande indépendante sur le parent retenu (point 5 : chaine et
    // pointDArret ne se contredisent pas sur le même nœud). Si le parent a
    // une demande cohérente, c'est ELLE la cause racine — pas le mouvement
    // OF qui n'est qu'un intermédiaire de propagation.
    const demandeMeilleur = ecartsMemo(meilleur.article).find(
      (e) => SOURCES_DEMANDE_INDEP.has(e.source) && estCoherentAvancement(e)
    )
    if (demandeMeilleur !== undefined) {
      chaine.push({
        niveau,
        article: meilleur.article,
        source: demandeMeilleur.source,
        nature: demandeMeilleur.nature,
        quantiteAvant: demandeMeilleur.quantiteAvant,
        quantiteApres: demandeMeilleur.quantiteApres,
        echeanceAvant: demandeMeilleur.echeanceAvant,
        echeanceApres: demandeMeilleur.echeanceApres,
        detail: demandeMeilleur.detail,
      })
      return {
        article: entree.article,
        chaine,
        pointDArret: {
          type: 'demande_independante',
          article: meilleur.article,
          source: demandeMeilleur.source,
          detail: demandeMeilleur.detail,
        },
      }
    }

    visited.add(meilleur.article)
    chaine.push({
      niveau,
      article: meilleur.article,
      source: meilleur.ecart.source,
      nature: meilleur.ecart.nature,
      quantiteAvant: meilleur.ecart.quantiteAvant,
      quantiteApres: meilleur.ecart.quantiteApres,
      echeanceAvant: meilleur.ecart.echeanceAvant,
      echeanceApres: meilleur.ecart.echeanceApres,
      detail: meilleur.ecart.detail,
    })

    articleCourant = meilleur.article
  }

  // Profondeur max (point 8) : tester la demande du dernier ancêtre avant
  // de déclarer l'arrêt.
  const demandeDernier = ecartsMemo(articleCourant).find(
    (e) => SOURCES_DEMANDE_INDEP.has(e.source) && estCoherentAvancement(e)
  )
  if (demandeDernier !== undefined) {
    return {
      article: entree.article,
      chaine,
      pointDArret: {
        type: 'demande_independante',
        article: articleCourant,
        source: demandeDernier.source,
        detail: demandeDernier.detail,
      },
    }
  }

  return {
    article: entree.article,
    chaine,
    pointDArret: {
      type: 'cause_inconnue',
      article: articleCourant,
      motif: 'profondeur_max',
      profondeur: MAX_NIVEAUX,
      parentsVerifies: [],
    },
  }
}
