import type { DriverDiffEntry, DriverDiffNature, DriverSource } from '#app/domain/cbn_driver_diff'
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
 *   contribuent rien.
 */
export function construireFrise(pas: PasFrise[]): FriseChaine {
  const parArticle = new Map<string, ArticleFrise>()
  const totalParNature: Record<string, number> = {}
  const totalParSource: Record<string, number> = {}
  let total = 0

  for (const pasEntry of pas) {
    for (const e of pasEntry.entrees) {
      const mouvement: MouvementFrise = { ...e, jour: pasEntry.apres }
      total += 1
      totalParNature[e.nature] = (totalParNature[e.nature] ?? 0) + 1
      totalParSource[e.source] = (totalParSource[e.source] ?? 0) + 1
      let article = parArticle.get(e.article)
      if (article === undefined) {
        article = {
          article: e.article,
          designation: e.designation,
          famille: e.famille,
          total: 0,
          mouvements: [],
        }
        parArticle.set(e.article, article)
      }
      article.total += 1
      article.mouvements.push(mouvement)
    }
  }

  for (const a of parArticle.values()) {
    a.mouvements.sort((x, y) => x.jour.localeCompare(y.jour))
  }

  const articles = [...parArticle.values()].sort((a, b) => b.total - a.total)

  return {
    articles,
    total,
    totalParNature: totalParNature as Record<DriverDiffNature, number>,
    totalParSource: totalParSource as Record<DriverSource, number>,
  }
}
