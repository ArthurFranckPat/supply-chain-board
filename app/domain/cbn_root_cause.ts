import type { DriverDiffEntry, DriverSource, DriverDiffNature } from '#app/domain/cbn_driver_diff'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { fmtFr } from '#app/utils/dates'

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
 */

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * Écart brut (sans seuil) pour un article entre deux photos.
 *
 * Contrairement à `DriverDiffEntry`, aucun seuil de ±20 % / ±7 j n'est
 * appliqué : un mouvement de 5 % chez un parent peut expliquer un
 * avancement chez l'enfant (cf. contrainte 1 de l'issue #142).
 *
 * Approche agrégée par source : on compare le total des quantités et
 * l'échéance la plus proche, plutôt qu'un appariement ligne à ligne.
 * Suffit pour la remontée de cause, où l'on cherche « qui a bougé et
 * dans quel sens », pas le détail ligne à ligne.
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

/** Fournisseur de données pour la remontée — injecté par le service. */
export interface RootCauseLoader {
  /** Parents directs d'un composant dans la nomenclature. */
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
      raison: string
      parentsVerifies: string[]
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
const SOURCES_DEMANDE_INDEP: ReadonlySet<string> = new Set(['demande_ferme', 'demande_prevision'])

/**
 * Sources de disponibilité : une BAISSE ou un RECUL pousse le besoin du
 * composant plus tôt (moins de stock ou de réception → plus de production
 * pour compenser → plus de consommation composant).
 *
 * Pour toutes les AUTRES sources (of_*, demande_*, *_suggestion), c'est
 * l'inverse : une HAUSSE ou une AVANCE est cohérente avec un avancement
 * enfant. Le test se fait donc par négation : `estDispo ? sensInverse :
 * sensDirect`.
 */
const SOURCES_DISPONIBILITE: ReadonlySet<string> = new Set(['stock', 'appro'])

const MAX_NIVEAUX = 10

// ─── Helpers ─────────────────────────────────────────────────────────────

const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })

// ─── Écarts bruts ────────────────────────────────────────────────────────

interface ResumeSource {
  quantiteTotal: number
  echeanceMin: string | null
}

function grouperParSource(rows: DemandSnapshotRow[]): Map<string, ResumeSource> {
  const map = new Map<string, ResumeSource>()
  for (const r of rows) {
    const s = map.get(r.source) ?? { quantiteTotal: 0, echeanceMin: null }
    s.quantiteTotal += r.quantity
    if (r.date_echeance !== null && (s.echeanceMin === null || r.date_echeance < s.echeanceMin)) {
      s.echeanceMin = r.date_echeance
    }
    map.set(r.source, s)
  }
  return map
}

/**
 * Écarts bruts (sans seuil) pour un article entre deux photos.
 *
 * Détecte TOUT mouvement, même sous le seuil d'affichage de ±20 % / ±7 j.
 * Utilisé par la remontée de cause racine où un sous-seuil peut être
 * déterminant (cf. contrainte 1 de l'issue #142).
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
    const sa = parSourceAvant.get(source)
    const sp = parSourceApres.get(source)

    if (sa !== undefined && sp === undefined) {
      out.push({
        source: source as DriverSource,
        nature: 'disparue',
        quantiteAvant: sa.quantiteTotal,
        quantiteApres: null,
        echeanceAvant: sa.echeanceMin,
        echeanceApres: null,
        detail: `${source} disparue : ${qte(sa.quantiteTotal)} unités — source absente de la photo « après ».`,
      })
      continue
    }

    if (sa === undefined && sp !== undefined) {
      out.push({
        source: source as DriverSource,
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: sp.quantiteTotal,
        echeanceAvant: null,
        echeanceApres: sp.echeanceMin,
        detail: `${source} apparue : ${qte(sp.quantiteTotal)} unités${sp.echeanceMin ? `, échéance ${fmtFr(sp.echeanceMin)}` : ''}.`,
      })
      continue
    }

    if (sa !== undefined && sp !== undefined) {
      if (sa.quantiteTotal !== sp.quantiteTotal) {
        out.push({
          source: source as DriverSource,
          nature: 'quantite',
          quantiteAvant: sa.quantiteTotal,
          quantiteApres: sp.quantiteTotal,
          echeanceAvant: sa.echeanceMin,
          echeanceApres: sp.echeanceMin,
          detail: `${source} quantité ${qte(sa.quantiteTotal)} → ${qte(sp.quantiteTotal)}.`,
        })
      }

      if (sa.echeanceMin !== sp.echeanceMin) {
        const ecartJours = joursEntre(sa.echeanceMin, sp.echeanceMin)
        if (ecartJours !== null && ecartJours !== 0) {
          out.push({
            source: source as DriverSource,
            nature: 'date',
            quantiteAvant: sa.quantiteTotal,
            quantiteApres: sp.quantiteTotal,
            echeanceAvant: sa.echeanceMin,
            echeanceApres: sp.echeanceMin,
            detail: `${source} échéance ${fmtFr(sa.echeanceMin)} → ${fmtFr(sp.echeanceMin)} (${ecartJours > 0 ? '+' : ''}${ecartJours} j).`,
          })
        }
      }
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
 * - OF / demande / suggestion : une HAUSSE ou une AVANCE pousse le besoin
 *   du composant plus tôt (plus de production parent → plus de consommation
 *   enfant).
 * - Stock / appro : une BAISSE ou un RECUL pousse le besoin plus tôt
 *   (moins de disponibilité → plus de production → plus de consommation).
 *
 * Sans ce filtre, avec 38 ancêtres, on « expliquera » n'importe quoi :
 * n'importe quel parent qui a bougé dans n'importe quel sens ferait l'affaire.
 */
export function estCoherentAvancement(ecart: EcartBrut): boolean {
  const { source, nature, quantiteAvant, quantiteApres, echeanceAvant, echeanceApres } = ecart

  if (nature === 'renumerotation') return false

  const estDispo = SOURCES_DISPONIBILITE.has(source)

  if (nature === 'apparue') {
    return !estDispo
  }

  if (nature === 'disparue') {
    return estDispo
  }

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

// ─── Amplitude ───────────────────────────────────────────────────────────

function amplitudeEcart(ecart: EcartBrut): number {
  if (ecart.nature === 'apparue' || ecart.nature === 'disparue') {
    return ecart.quantiteApres ?? ecart.quantiteAvant ?? 0
  }
  if (ecart.nature === 'quantite') {
    return Math.abs((ecart.quantiteApres ?? 0) - (ecart.quantiteAvant ?? 0))
  }
  if (ecart.nature === 'date') {
    const d = joursEntre(ecart.echeanceAvant, ecart.echeanceApres)
    return d === null ? 1 : Math.abs(d)
  }
  return 0
}

// ─── Remontée ────────────────────────────────────────────────────────────

/**
 * Remonte la nomenclature pour expliquer pourquoi une ligne de suggestion
 * a avancé.
 *
 * @param entree La ligne `DriverDiffEntry` à expliquer (`nature = 'date'`,
 *   delta négatif = échéance avancée).
 * @param loader Fournit les parents BOM et les écarts bruts par article.
 *
 * @returns La chaîne de remontée + le point d'arrêt nommé.
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

  const visited = new Set<string>([entree.article])
  let articleCourant = entree.article

  for (let niveau = 1; niveau <= MAX_NIVEAUX; niveau++) {
    // 1. Vérifier la demande indépendante sur l'article courant.
    // Un mouvement cohérent sur demande_ferme / demande_prevision EST
    // la cause racine : elle n'est pas dérivée d'un parent.
    const ecartsCourant = loader.ecartsBruts(articleCourant)
    const demandeIndep = ecartsCourant.find(
      (e) => SOURCES_DEMANDE_INDEP.has(e.source) && estCoherentAvancement(e)
    )
    if (demandeIndep !== undefined) {
      return {
        article: entree.article,
        chaine,
        pointDArret: {
          type: 'demande_independante',
          article: articleCourant,
          source: demandeIndep.source,
          detail: demandeIndep.detail,
        },
      }
    }

    // 2. Chercher le mouvement cohérent le plus fort chez les parents.
    const parents = loader.parentsDe(articleCourant)
    let meilleur: { article: string; ecart: EcartBrut; amplitude: number } | null = null

    for (const parent of parents) {
      if (visited.has(parent.parentArticle)) continue
      const ecartsParent = loader.ecartsBruts(parent.parentArticle)
      for (const ecart of ecartsParent) {
        if (estCoherentAvancement(ecart)) {
          const amp = amplitudeEcart(ecart)
          if (meilleur === null || amp > meilleur.amplitude) {
            meilleur = { article: parent.parentArticle, ecart, amplitude: amp }
          }
        }
      }
    }

    // 3. Aucun parent n'a bougé de façon cohérente → point d'arrêt.
    if (meilleur === null) {
      return {
        article: entree.article,
        chaine,
        pointDArret: {
          type: 'cause_inconnue',
          article: articleCourant,
          raison: 'plus rien ne bouge au-dessus dans la nomenclature',
          parentsVerifies: parents.map((p) => p.parentArticle),
        },
      }
    }

    // 4. Ajouter le maillon et remonter d'un niveau.
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

  return {
    article: entree.article,
    chaine,
    pointDArret: {
      type: 'cause_inconnue',
      article: articleCourant,
      raison: `profondeur maximale (${MAX_NIVEAUX}) atteinte`,
      parentsVerifies: [],
    },
  }
}
