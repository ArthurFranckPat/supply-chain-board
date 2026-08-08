import {
  DRIVER_DIFF_NATURES,
  DRIVER_SOURCES,
  type DriverDiffEntry,
  type DriverDiffNature,
  type DriverSource,
} from '#app/domain/cbn_driver_diff'
import type { SourceEcartee } from '#app/domain/snapshot_perimetre'

/**
 * Chaînage des diffs jour à jour sur une plage (#143).
 *
 * Comparer deux bornes directement ignore tout ce qui s'est passé entre elles :
 * un besoin avancé puis reculé se lit « inchangé », une ligne disparue en cours
 * de route se marie de force à une ligne sans rapport. Ce module construit la
 * FRISE des mouvements : pour chaque pas consécutif de la série de photos
 * (30→31, 31→01, 01→02, …), le diff du pas est déjà le bon, et le résultat est
 * la chronologie — jamais le solde entre les deux bornes.
 *
 * Les diffs de paires adjacentes sont immuables (une photo est figée une fois
 * écrite) : le service cache chaque pas et ce module n'a aucune I/O.
 *
 * Deux choses à dire en plus de la frise :
 * - un TROU dans la série (une photo attendue entre deux photos consécutives)
 *   est signalé, jamais enjambé en silence — un mouvement observé sur un pas
 *   qui enjambe un trou n'est pas localisable au jour près ;
 * - l'agrégation par ARTICLE, pour que l'écran ne multiplie pas ses lignes par
 *   le nombre de pas.
 *
 * Pur, sans I/O — testable sur fixtures.
 */

export interface TrouFrise {
  /** Photo « avant » du pas qui enjambe le trou (incluse dans la série). */
  entre: string
  /** Photo « après » (incluse dans la série). */
  et: string
  /** Jours calendaires sans photo entre les deux bornes. */
  manquants: string[]
}

/** Un pas = le diff d'une paire consécutive de photos. */
export interface PasFrise {
  avant: string
  apres: string
  entrees: DriverDiffEntry[]
  /** Renseigné quand le pas n'a RIEN à comparer (aucune source commune). */
  message: string | null
  /** Périmètre réellement comparé par ce pas (#145) — propre à chaque paire. */
  sourcesEcartees: SourceEcartee[]
  sourcesComparees: string[]
}

/** Un mouvement de la frise : une entrée de diff datée du pas qui l'a vu. */
export interface MouvementFrise extends DriverDiffEntry {
  /** Date de la photo « après » du pas — le jour où le mouvement a été observé. */
  jour: string
}

export interface ArticleFrise {
  article: string
  designation: string | null
  famille: string | null
  /**
   * Mode de réapprovisionnement de l'article, remonté au groupe : la conduite à
   * tenir sur une suggestion dépend d'abord de lui (commander vs lancer un OF),
   * et il ne varie pas d'un mouvement à l'autre du même article.
   */
  approvisionnement: 'ACHAT' | 'FABRICATION' | null
  total: number
  /** Chronologique (jour croissant), stable pour un même jour. */
  mouvements: MouvementFrise[]
}

export interface FriseChaine {
  articles: ArticleFrise[]
  total: number
  totalParNature: Record<DriverDiffNature, number>
  totalParSource: Record<DriverSource, number>
}

const jourSuivant = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + 1))
  return date.toISOString().slice(0, 10)
}

/**
 * Jours calendaires sans photo entre deux photos consécutives de la série.
 *
 * Une photo est attendue chaque jour (run nocturne). Un écart de plus d'un
 * jour entre deux photos consécutives est un TROU d'instrumentation, pas un
 * fait métier : le pas qui l'enjambe existe toujours, mais un mouvement qui y
 * est observé n'est pas localisable au jour près — la frise doit le dire.
 *
 * Les dates sont triées croissamment (le tri fait partie du contrat).
 */
export function detecterTrous(datesPhotos: string[]): TrouFrise[] {
  const dates = [...datesPhotos].sort()
  const trous: TrouFrise[] = []
  for (let i = 0; i < dates.length - 1; i++) {
    const entre = dates[i]
    const et = dates[i + 1]
    const manquants: string[] = []
    for (let j = jourSuivant(entre); j < et; j = jourSuivant(j)) {
      manquants.push(j)
    }
    if (manquants.length > 0) trous.push({ entre, et, manquants })
  }
  return trous
}

/**
 * Compteur initialisé à 0 sur toutes les clés — jamais d'absence lue
 * `undefined` (défaut 3). Exporté : le contrôleur (`appro_controller.ts`,
 * `driversFrise`) construit les mêmes compteurs `parNature`/`parSource`
 * (globaux et par pas) et doit rester d'accord sur les mêmes listes de clés.
 */
export function compteurVide<T extends string>(cles: readonly T[]): Record<T, number> {
  const r = {} as Record<T, number>
  for (const cle of cles) r[cle] = 0
  return r
}

/** Méta + décompte d'un article, accumulés en passe 1 (sans mouvement matérialisé). */
interface AccumulateurArticle {
  designation: string | null
  famille: string | null
  approvisionnement: 'ACHAT' | 'FABRICATION' | null
  total: number
}

export interface ConstruireFriseOptions {
  /**
   * Nombre maximal de MOUVEMENTS conservés dans la réponse, tous articles
   * confondus (défaut 1). Consommé article par article dans l'ORDRE DE LA
   * FRISE (nombre de mouvements décroissant, le plus agité d'abord) ; un
   * article dont le budget tombe à zéro est écarté de la réponse plutôt que
   * rendu avec `mouvements: []` — même sémantique que le bornage qu'appliquait
   * jusqu'ici le contrôleur après coup.
   *
   * `total` par article et les compteurs globaux (`total`, `totalParNature`,
   * `totalParSource`) restent EXACTS, calculés sur la totalité des entrées :
   * seuls les mouvements RETENUS sont bornés. Contrat exploité tel quel par
   * `besoins-evolution.tsx` (« X mouvements sur N ») — préservé à l'identique.
   *
   * Omis : tout est matérialisé, comportement historique inchangé.
   */
  budget?: number
}

/**
 * Agrège les pas d'une plage en frise par article.
 *
 * - un mouvement porte le `jour` du pas qui l'a observé (sa borne « après ») ;
 * - les mouvements d'un article sont chronologiques (jour croissant), l'ordre
 *   d'insertion restant pour un même jour — l'ordre par amplitude du diff ne
 *   traverse pas le regroupement ;
 * - les articles sont triés par nombre de mouvements décroissant : la question
 *   de l'écran est « quels articles bougent le plus sur la période », pas « le
 *   plus fort mouvement » ;
 * - les pas sans aucune entrée (y compris pour une raison annoncée) ne
 *   contribuent rien ;
 * - désignation/famille se complètent au fil des entrées (`??=`), sans jamais
 *   écraser une valeur déjà connue (défaut 4) — la première entrée vue pour un
 *   article peut les porter nulles alors qu'une suivante les renseigne.
 *
 * Deux passes systématiques (défaut 1) : la première ne fait que COMPTER (une
 * frise de 800 000 mouvements coûte alors 800 000 incréments, pas 800 000
 * allocations d'objet) et détermine designation/famille/total par article — ce
 * qui suffit à connaître l'ordre final ET, avec `options.budget`, quels
 * articles seront réellement SERVIS avant de matérialiser quoi que ce soit. La
 * seconde passe ne construit les tableaux `mouvements` que pour ces
 * articles-là : sans budget, c'est tous ; avec budget, c'est au plus le
 * nombre d'articles qu'un budget ≤ 1000 peut jamais servir — pas les dizaines
 * de milliers d'articles inertes d'une plage large.
 */
export function construireFrise(pas: PasFrise[], options?: ConstruireFriseOptions): FriseChaine {
  const budget = options?.budget

  // Passe 1 : comptages exacts + méta, aucun mouvement matérialisé.
  const accum = new Map<string, AccumulateurArticle>()
  const ordreApparition: string[] = []
  const totalParNature = compteurVide(DRIVER_DIFF_NATURES)
  const totalParSource = compteurVide(DRIVER_SOURCES)
  let total = 0

  for (const pasEntry of pas) {
    for (const e of pasEntry.entrees) {
      total += 1
      totalParNature[e.nature] += 1
      totalParSource[e.source] += 1
      let a = accum.get(e.article)
      if (a === undefined) {
        a = {
          designation: e.designation,
          famille: e.famille,
          approvisionnement: e.approvisionnement,
          total: 0,
        }
        accum.set(e.article, a)
        ordreApparition.push(e.article)
      } else {
        a.designation ??= e.designation
        a.famille ??= e.famille
        a.approvisionnement ??= e.approvisionnement
      }
      a.total += 1
    }
  }

  // Ordre final : nombre de mouvements décroissant, égalité départagée par
  // l'ordre d'apparition — `Array.sort` est stable, même garantie que l'ancien
  // tri sur les `values()` d'une Map remplie dans cet ordre.
  const ordre = [...ordreApparition].sort((x, y) => accum.get(y)!.total - accum.get(x)!.total)

  // Qui est servi, et par combien de mouvements — décidé sur les COMPTEURS
  // seuls (passe 1), avant toute matérialisation. Sans budget, tout le monde
  // est servi pour son total entier (pas de cap = pas de troncature en passe 2).
  const capParArticle = new Map<string, number>()
  if (budget === undefined) {
    for (const article of ordre) capParArticle.set(article, accum.get(article)!.total)
  } else {
    let restant = budget
    for (const article of ordre) {
      if (restant <= 0) break
      const pris = Math.min(restant, accum.get(article)!.total)
      if (pris > 0) {
        capParArticle.set(article, pris)
        restant -= pris
      }
    }
  }

  // Passe 2 : ne matérialise les mouvements QUE pour les articles retenus par
  // `capParArticle` — le gros de la mémoire évitée quand un budget est fourni.
  const mouvementsParArticle = new Map<string, MouvementFrise[]>()
  for (const pasEntry of pas) {
    for (const e of pasEntry.entrees) {
      if (!capParArticle.has(e.article)) continue
      let arr = mouvementsParArticle.get(e.article)
      if (arr === undefined) {
        arr = []
        mouvementsParArticle.set(e.article, arr)
      }
      arr.push({ ...e, jour: pasEntry.apres })
    }
  }

  const articles: ArticleFrise[] = []
  for (const article of ordre) {
    const cap = capParArticle.get(article)
    if (cap === undefined) continue
    const a = accum.get(article)!
    const mouvements = mouvementsParArticle.get(article) ?? []
    mouvements.sort((x, y) => x.jour.localeCompare(y.jour))
    articles.push({
      article,
      designation: a.designation,
      famille: a.famille,
      approvisionnement: a.approvisionnement,
      total: a.total,
      // `cap` vaut `a.total` sans budget (posé plus haut) : le `slice` est un
      // no-op de valeur dans ce cas, pas une branche séparée à maintenir.
      mouvements: mouvements.slice(0, cap),
    })
  }

  return { articles, total, totalParNature, totalParSource }
}
