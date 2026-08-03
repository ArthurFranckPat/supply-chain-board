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

import type { SyntheseOf } from '#app/domain/production_realisee'

/** Fiabilité d'un article : le temps pointé colle-t-il à la gamme ? */
export interface FiabiliteArticle {
  article: string
  qty: number
  heuresPointees: number
  heuresTheoriques: number
  /** théorique / pointé : > 1 = plus rapide que la gamme, < 1 = plus lent.
   *  null si aucune heure pointée. */
  ratio: number | null
}

export interface FiabilitePoste {
  /** Articles à cadence exploitable seulement, triés par quantité décroissante. */
  articles: FiabiliteArticle[]
  /** Totaux sur ces articles uniquement. */
  heuresPointees: number
  heuresTheoriques: number
  ratioGlobal: number | null
  /** Nb d'articles écartés faute de cadence exploitable (rate ≤ 0 ou absent). */
  exclusFauteCadence: number
}

/**
 * Fiabilité des temps de gamme. `cadencePour` rend la cadence (u/h) de gamme
 * d'un article sur ce poste, ou null si la gamme ne la porte pas.
 */
export function fiabiliteTempsGamme(opts: {
  synthese: SyntheseOf[]
  cadencePour: (article: string) => number | null
}): FiabilitePoste {
  const parArticle = new Map<string, { qty: number; heures: number }>()
  let exclusFauteCadence = 0

  for (const of of opts.synthese) {
    if (!of.article) continue
    const cadence = opts.cadencePour(of.article)
    // Garde-fou #119 : pas de cadence exploitable → hors calcul, pas d'écart
    // aberrant. Le simple fait de produire sans cadence connue est déjà une
    // information, comptée séparément.
    if (!cadence || cadence <= 0) {
      exclusFauteCadence++
      continue
    }
    const cur = parArticle.get(of.article) ?? { qty: 0, heures: 0 }
    cur.qty += of.qty
    cur.heures += of.heures
    parArticle.set(of.article, cur)
  }

  const articles: FiabiliteArticle[] = []
  let heuresPointees = 0
  let heuresTheoriques = 0
  for (const [article, v] of parArticle) {
    if (v.qty <= 0) continue
    const cadence = opts.cadencePour(article) ?? 0
    const theo = v.qty / cadence
    heuresPointees += v.heures
    heuresTheoriques += theo
    articles.push({
      article,
      qty: v.qty,
      heuresPointees: Math.round(v.heures * 100) / 100,
      heuresTheoriques: Math.round(theo * 100) / 100,
      ratio: v.heures > 0 ? Math.round((theo / v.heures) * 100) / 100 : null,
    })
  }
  articles.sort((a, b) => b.qty - a.qty)

  return {
    articles,
    heuresPointees: Math.round(heuresPointees * 100) / 100,
    heuresTheoriques: Math.round(heuresTheoriques * 100) / 100,
    ratioGlobal:
      heuresPointees > 0 ? Math.round((heuresTheoriques / heuresPointees) * 100) / 100 : null,
    exclusFauteCadence,
  }
}

/** Une semaine d'adhérence au programme. `semaine` = lundi ISO. */
export interface AdherenceSemaine {
  semaine: string
  prevus: number
  pointes: number
  /** (prévus ∩ pointés) / prévus — null si rien de prévu. */
  taux: number | null
}

/**
 * Adhérence au programme, semaine par semaine (clé = lundi ISO).
 *
 * Limite assumée, à dire sur l'écran : les OF PRÉVUS viennent des OF OUVERTS
 * rattachés au poste (ORDERS) — ce qui est passé en stock n'existe plus dans
 * ORDERS et ne peut plus être « prévu ». L'adhérence mesure donc le périmètre
 * encore vivant, pas l'histoire complète ; la réplique de pointages, elle,
 * garde l'histoire des pointés.
 */
export function adherenceProgramme(opts: {
  /** OF ouverts du poste attendus par semaine : lundi ISO → numéros d'OF. */
  prevusParSemaine: Map<string, Set<string>>
  synthese: SyntheseOf[]
  /** Semaines à servir (lundis ISO), ordre indifférent. */
  semaines: string[]
}): AdherenceSemaine[] {
  // OF réellement pointés par semaine.
  const pointesParSemaine = new Map<string, Set<string>>()
  for (const of of opts.synthese) {
    for (const jour of of.joursPointes) {
      const lundi = lundiIso(jour)
      const cur = pointesParSemaine.get(lundi) ?? new Set<string>()
      cur.add(of.numOf)
      pointesParSemaine.set(lundi, cur)
    }
  }

  const out: AdherenceSemaine[] = []
  for (const semaine of [...opts.semaines].sort()) {
    const prevus = opts.prevusParSemaine.get(semaine) ?? new Set<string>()
    const pointes = pointesParSemaine.get(semaine) ?? new Set<string>()
    let tiens = 0
    for (const num of prevus) if (pointes.has(num)) tiens++
    out.push({
      semaine,
      prevus: prevus.size,
      pointes: pointes.size,
      taux: prevus.size > 0 ? Math.round((tiens / prevus.size) * 100) / 100 : null,
    })
  }
  return out
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
  const parArticle = new Map<string, { qty: number; heures: number; palettes: number | null }>()

  for (const of of opts.synthese) {
    if (!of.article || of.qty <= 0) continue
    const cur = parArticle.get(of.article) ?? { qty: 0, heures: 0, palettes: null }
    cur.qty += of.qty
    cur.heures += of.heures
    const coef = opts.usParPalette(of.article)
    if (coef && coef > 0) {
      // Pas de calcPalettes ici : le mix somme des quantités agrégées par
      // article, la conversion directe qty/coef est l'équivalent exact.
      cur.palettes = (cur.palettes ?? 0) + of.qty / coef
    }
    parArticle.set(of.article, cur)
  }

  return [...parArticle.entries()]
    .map(([article, v]) => {
      const cadence = opts.cadencePour(article)
      return {
        article,
        qty: v.qty,
        palettes: v.palettes !== null ? Math.round(v.palettes * 10) / 10 : null,
        heures: Math.round(v.heures * 100) / 100,
        piecesParHeure: v.heures > 0 ? Math.round((v.qty / v.heures) * 10) / 10 : null,
        cadenceGamme: cadence && cadence > 0 ? cadence : null,
      }
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, top)
}
