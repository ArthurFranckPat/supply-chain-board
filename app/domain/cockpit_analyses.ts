/**
 * Analyses du cockpit poste (#119, lot 6) — domaine pur, aucune I/O.
 *
 * Trois lectures, toutes construites sur le résumé par OF (`syntheseParOf`) et
 * la fenêtre répliquée :
 *
 * - **Fiabilité des temps de gamme** : heures pointées face au temps standard
 *   (`hoursForQuantity`, cadence `ROUOPE.CAD_0`). Si la cadence ment, la charge
 *   affichée sur /programme et /charge est fausse pour ce poste — c'est le seul
 *   endroit de l'application où on peut le constater. Garde-fou de l'issue : les
 *   gammes sans cadence exploitable SORTENT du calcul au lieu d'afficher un
 *   écart infini/aberrant.
 * - **Adhérence au programme** : OF planifiés sur le poste pour la semaine S vs
 *   OF réellement pointés en S. Personne ne la mesure aujourd'hui — c'est la
 *   métrique qui dit si le séquenceur sert à quelque chose.
 * - **Mix articles et cadence réelle** : top articles produits et pièces/h
 *   CONSTATÉES par article, face à la cadence gamme. Affichage seul en v1 —
 *   aucune boucle de retour vers la charge avant d'avoir regardé l'écart.
 */

import { calcPalettes } from '#app/domain/receptions'
import type { SyntheseOf } from '#app/domain/production_realisee'

/** Nombre de semaines d'adhérence affichées (hors semaine en cours) — l'historique
 *  ORDERS ne garde pas les OF soldés, au-delà le taux tend vers 0 (revue #119). */
export const ADHERENCE_SEMAINES_RECENTES = 4

/** Fiabilité d'un article : le temps pointé colle-t-il à la gamme ? */
export interface FiabiliteArticle {
  article: string
  qty: number
  /** Heures OPÉRATOIRES pointées (total − réglage) — comparées au théorique
   *  (`hoursForQuantity` ne porte pas de standard de réglage, revue #119). */
  heuresPointees: number
  /** Heures de réglage pointées, affichage seul — jamais comparées. */
  heuresReglage: number
  heuresTheoriques: number
  /** théorique / pointé : > 1 = plus rapide que la gamme, < 1 = plus lent.
   *  null si aucune heure pointée. */
  ratio: number | null
}

export interface FiabilitePoste {
  /** Articles à cadence exploitable seulement, triés par quantité décroissante. */
  articles: FiabiliteArticle[]
  /** Totaux sur ces articles uniquement (opératoire / théorique). */
  heuresPointees: number
  heuresTheoriques: number
  /** Total des heures de réglage sur ces articles — affichage seul. */
  heuresReglage: number
  ratioGlobal: number | null
  /** Nb d'ARTICLES distincts écartés faute de cadence exploitable. */
  exclusFauteCadence: number
}

/**
 * Fiabilité des temps de gamme. `cadencePour` rend la cadence (u/h) de gamme
 * d'un article sur ce poste, ou null si la gamme ne la porte pas.
 *
 * Opératoire à opératoire : le théorique vient de `hoursForQuantity`
 * (`qty / rate`, opératoire pur), donc le pointé entrant dans le ratio est le
 * temps opératoire (total − réglage). Comparer le total au théorique mentait
 * d'environ 10 % (14,6 % des heures pointées de la réplique sont du réglage,
 * revue #119, 04/08). Le réglage reste affiché, il n'est juste pas comparé.
 */
export function fiabiliteTempsGamme(opts: {
  synthese: SyntheseOf[]
  cadencePour: (article: string) => number | null
}): FiabilitePoste {
  const parArticle = new Map<
    string,
    { qty: number; heuresOperatoire: number; heuresReglage: number }
  >()
  const articlesSansCadence = new Set<string>()

  for (const of of opts.synthese) {
    if (!of.article) continue
    const cadence = opts.cadencePour(of.article)
    // Garde-fou #119 : pas de cadence exploitable → hors calcul, pas d'écart
    // aberrant. Compté une fois par article, pas par OF (revue #119).
    if (!cadence || cadence <= 0) {
      articlesSansCadence.add(of.article)
      continue
    }
    const cur = parArticle.get(of.article) ?? { qty: 0, heuresOperatoire: 0, heuresReglage: 0 }
    cur.qty += of.qty
    cur.heuresOperatoire += of.heures - of.dontHeuresReglage
    cur.heuresReglage += of.dontHeuresReglage
    parArticle.set(of.article, cur)
  }
  const exclusFauteCadence = articlesSansCadence.size

  const articles: FiabiliteArticle[] = []
  let heuresPointees = 0
  let heuresReglage = 0
  let heuresTheoriques = 0
  for (const [article, v] of parArticle) {
    if (v.qty <= 0) continue
    const cadence = opts.cadencePour(article) ?? 0
    const theo = v.qty / cadence
    heuresPointees += v.heuresOperatoire
    heuresReglage += v.heuresReglage
    heuresTheoriques += theo
    articles.push({
      article,
      qty: v.qty,
      heuresPointees: Math.round(v.heuresOperatoire * 100) / 100,
      heuresReglage: Math.round(v.heuresReglage * 100) / 100,
      heuresTheoriques: Math.round(theo * 100) / 100,
      ratio: v.heuresOperatoire > 0 ? Math.round((theo / v.heuresOperatoire) * 100) / 100 : null,
    })
  }
  articles.sort((a, b) => b.qty - a.qty)

  return {
    articles,
    heuresPointees: Math.round(heuresPointees * 100) / 100,
    heuresTheoriques: Math.round(heuresTheoriques * 100) / 100,
    heuresReglage: Math.round(heuresReglage * 100) / 100,
    ratioGlobal:
      heuresPointees > 0 ? Math.round((heuresTheoriques / heuresPointees) * 100) / 100 : null,
    exclusFauteCadence,
  }
}

/** Une semaine d'adhérence au programme. `semaine` = lundi ISO.
 *
 * Pas de taux ici (revue #119, 04/08) : les PRÉVUS viennent des OF OUVERTS
 * rattachés au poste (ORDERS), et ce qui est passé en stock a quitté ORDERS —
 * le dénominateur des semaines passées ne contiendrait que les retardataires,
 * et le taux tendrait vers 0 quelle que soit la performance réelle. On montre
 * donc les deux comptages bruts ; le lecteur compare des OF, pas des pourcents
 * de populations différentes. */
export interface AdherenceSemaine {
  semaine: string
  /** OF ouverts du poste dont le lancement tombe cette semaine. */
  prevus: number
  /** OF distincts ayant pointé sur le poste cette semaine. */
  pointes: number
}

/**
 * Adhérence au programme, semaine par semaine (clé = lundi ISO).
 *
 * Limite assumée, à dire sur l'écran : les OF PRÉVUS viennent des OF OUVERTS
 * rattachés au poste (ORDERS) — ce qui est passé en stock n'existe plus dans
 * ORDERS. On borne donc aux `ADHERENCE_SEMAINES_RECENTES` semaines les plus
 * récentes de `semaines` (revue #119) et on n'affiche AUCUN taux : les deux
 * populations ne sont pas comparables au-delà de la semaine courante.
 */
export function adherenceProgramme(opts: {
  /** OF ouverts du poste attendus par semaine : lundi ISO → numéros d'OF. */
  prevusParSemaine: Map<string, Set<string>>
  synthese: SyntheseOf[]
  /** Semaines candidates (lundis ISO), ordre indifférent. */
  semaines: string[]
  /** Override du plafond de semaines récentes (tests). */
  maxSemaines?: number
}): AdherenceSemaine[] {
  const pointesParSemaine = new Map<string, Set<string>>()
  for (const of of opts.synthese) {
    for (const jour of of.joursPointes) {
      const lundi = lundiIso(jour)
      const cur = pointesParSemaine.get(lundi) ?? new Set<string>()
      cur.add(of.numOf)
      pointesParSemaine.set(lundi, cur)
    }
  }

  const max = opts.maxSemaines ?? ADHERENCE_SEMAINES_RECENTES
  const semainesRetenues = [...opts.semaines].sort().slice(-max)

  return semainesRetenues.map((semaine) => ({
    semaine,
    prevus: (opts.prevusParSemaine.get(semaine) ?? new Set<string>()).size,
    pointes: (pointesParSemaine.get(semaine) ?? new Set<string>()).size,
  }))
}

/** Lundi ISO d'un jour (YYYY-MM-DD → YYYY-MM-DD du lundi). */
export function lundiIso(jour: string): string {
  const d = new Date(`${jour}T00:00:00`)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Une ligne du mix articles : production + cadence constatée vs gamme. */
export interface MixArticle {
  article: string
  qty: number
  /** Équivalent palette — null si l'article n'a pas de coefficient (#119). */
  palettes: number | null
  heures: number
  /** pièces/heure CONSTATÉES — null si aucune heure pointée. */
  piecesParHeure: number | null
  /** Cadence gamme (u/h) pour comparer — null si non exploitable. */
  cadenceGamme: number | null
}

/**
 * Mix articles et cadence réelle : top articles produits sur la fenêtre, avec
 * la cadence CONSTATÉE (qty / heures pointées) face à la cadence gamme.
 * Affichage seul en v1 — pas de recalage automatique de la charge.
 */
export function mixArticles(opts: {
  synthese: SyntheseOf[]
  cadencePour: (article: string) => number | null
  usParPalette: (article: string) => number | null
  top?: number
}): MixArticle[] {
  const top = opts.top ?? 10
  const parArticle = new Map<string, { qty: number; heures: number }>()

  for (const of of opts.synthese) {
    if (!of.article || of.qty <= 0) continue
    const cur = parArticle.get(of.article) ?? { qty: 0, heures: 0 }
    cur.qty += of.qty
    cur.heures += of.heures
    parArticle.set(of.article, cur)
  }

  return [...parArticle.entries()]
    .map(([article, v]) => {
      const cadence = opts.cadencePour(article)
      const coef = opts.usParPalette(article)
      // Une conversion après sommation — même règle que palettesRealisees.
      const palettes = coef && coef > 0 ? calcPalettes(v.qty, coef) : null
      return {
        article,
        qty: v.qty,
        palettes,
        heures: Math.round(v.heures * 100) / 100,
        piecesParHeure: v.heures > 0 ? Math.round((v.qty / v.heures) * 10) / 10 : null,
        cadenceGamme: cadence && cadence > 0 ? cadence : null,
      }
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, top)
}
