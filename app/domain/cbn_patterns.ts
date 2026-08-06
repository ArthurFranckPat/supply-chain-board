import type { ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'
import type { CbnExplanation } from '#app/domain/cbn_explanation'

/**
 * Patterns émergents du CBN (#138 lot 2).
 *
 * Avec 3+ semaines d'historique de photos, des régularités apparaissent que le
 * diff J-1 ne montre pas :
 *
 * - **articles volatils** — un article porte un message presque tous les
 *   jours : c'est du bruit structurel, son explication importe moins et il
 *   faut le signaler plutôt que de le laisser encombrer la file ;
 * - **fournisseurs problématiques** — un fournisseur dont une part élevée des
 *   messages est liée à des réceptions glissées (`appro`) est un signal
 *   fournisseur, pas un signal CBN : l'acheteur peut l'attaquer à la source.
 *
 * Pur, sans I/O : le service lit les photos de la fenêtre et les explications,
 * ce module ne fait qu'agréger.
 */

/** Volatilité d'un article sur la fenêtre, dérivée de sa fréquence de messages. */
export type Volatilite = 'haute' | 'moyenne' | 'basse'

export interface PatternArticle {
  article: string
  /** Nombre de messages portés sur la fenêtre (toutes natures confondues). */
  nbMessages: number
  /** Messages par semaine en moyenne sur la fenêtre. */
  messagesSemaine: number
  /** Source dominante des corrélations convergentes de l'article, `null` si aucune. */
  sourceDominante: string | null
  /** Part de la source dominante (0-1), `null` si aucune. */
  partSourceDominante: number | null
  volatilite: Volatilite
}

export interface PatternFournisseur {
  fournisseur: string
  /** Messages portés par ce fournisseur sur la fenêtre. */
  nbMessages: number
  /**
   * Part des messages du fournisseur dont la cause dominante de l'article est
   * une réception (`appro`), `null` si aucune cause connue.
   */
  partReceptionsGlissees: number | null
}

export interface ApproPatterns {
  /** Fenêtre de photos couverte, `[apres, avant]`. */
  apres: string
  avant: string
  /** Nombre de jours de la fenêtre demandée. */
  fenetreJours: number
  /** Jours de photos réellement couverts dans la fenêtre. */
  joursCouverts: number
  articles: PatternArticle[]
  fournisseurs: PatternFournisseur[]
}

/** Seuils de volatilité, en messages/semaine (hypothèse, à calibrer en atelier). */
const VOLATILITE_HAUTE = 2
const VOLATILITE_MOYENNE = 0.5

const volatilite = (messagesSemaine: number): Volatilite => {
  if (messagesSemaine >= VOLATILITE_HAUTE) return 'haute'
  if (messagesSemaine >= VOLATILITE_MOYENNE) return 'moyenne'
  return 'basse'
}

/** Source dominante d'une liste de corrélations, avec sa part (0-1). */
function causeDominante(
  explications: CbnExplanation[],
  article: string
): { source: string; part: number } | null {
  const compteur = new Map<string, number>()
  let total = 0
  for (const e of explications) {
    if (e.article !== article) continue
    for (const c of e.correlations) {
      compteur.set(c.source, (compteur.get(c.source) ?? 0) + 1)
      total += 1
    }
  }
  if (total === 0) return null
  let best: { source: string; n: number } | null = null
  for (const [source, n] of compteur) {
    if (best === null || n > best.n) best = { source, n }
  }
  if (best === null) return null
  return { source: best.source, part: Math.round((best.n / total) * 100) / 100 }
}

/**
 * Agrège les patterns à partir des photos de messages d'une fenêtre et des
 * explications de la même fenêtre.
 *
 * `lignes` : toutes les lignes de photos de messages dont la date est dans la
 * fenêtre. `explications` : les explications calculées sur le dernier diff de
 * la fenêtre (elles portent l'article et les corrélations).
 */
export function detectPatterns(
  lignes: ApproMessageSnapshotRow[],
  explications: CbnExplanation[],
  fenetreJours: number
): ApproPatterns {
  const parArticle = new Map<string, PatternArticle>()
  const parFournisseur = new Map<string, { nbMessages: number }>()

  const jours = new Set(lignes.map((l) => l.snapshot_date))
  const joursCouverts = jours.size
  // Étendue CALENDAIRE réelle couverte (avant → apres), en jours — la bonne
  // base pour une fréquence hebdomadaire. Distinct de `joursCouverts` : deux
  // photos espacées de 20 jours couvrent 20 jours calendaires mais seulement
  // 2 jours de photos ; diviser par 2 surévaluerait la fréquence.
  const datesTriees = [...jours].sort()
  const etendueJours =
    datesTriees.length >= 2
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${datesTriees.at(-1)}T00:00:00Z`) -
              Date.parse(`${datesTriees[0]}T00:00:00Z`)) /
              86_400_000
          ) + 1
        )
      : 1

  for (const l of lignes) {
    const a = parArticle.get(l.itmref) ?? {
      article: l.itmref,
      nbMessages: 0,
      messagesSemaine: 0,
      sourceDominante: null,
      partSourceDominante: null,
      volatilite: 'basse' as Volatilite,
    }
    a.nbMessages += 1
    parArticle.set(l.itmref, a)

    if (l.fournisseur !== null) {
      const f = parFournisseur.get(l.fournisseur) ?? { nbMessages: 0 }
      f.nbMessages += 1
      parFournisseur.set(l.fournisseur, f)
    }
  }

  const articles: PatternArticle[] = []
  for (const a of parArticle.values()) {
    // Fréquence normalisée sur l'étendue CALENDAIRE réelle (avant → apres),
    // pas sur la fenêtre demandée : avec des trous (week-ends, pannes),
    // diviser par la fenêtre demandée sous-estime la fréquence observée.
    const messagesSemaine = (a.nbMessages / etendueJours) * 7
    const cause = causeDominante(explications, a.article)
    articles.push({
      article: a.article,
      nbMessages: a.nbMessages,
      messagesSemaine: Math.round(messagesSemaine * 10) / 10,
      sourceDominante: cause?.source ?? null,
      partSourceDominante: cause?.part ?? null,
      volatilite: volatilite(messagesSemaine),
    })
  }
  articles.sort((x, y) => y.messagesSemaine - x.messagesSemaine)

  // Part des réceptions glissées par fournisseur : la cause dominante de
  // l'article porte le message ; si elle vaut `appro`, le message est lié à
  // une réception attendue qui a glissé — le signal fournisseur par excellence.
  const causeParArticle = new Map<string, string | null>()
  for (const a of articles) causeParArticle.set(a.article, a.sourceDominante)

  const fournisseurs: PatternFournisseur[] = []
  for (const [fournisseur, f] of parFournisseur) {
    let appro = 0
    let causesConnues = 0
    for (const l of lignes) {
      if (l.fournisseur !== fournisseur) continue
      const cause = causeParArticle.get(l.itmref)
      if (cause === undefined || cause === null) continue
      causesConnues += 1
      if (cause === 'appro') appro += 1
    }
    fournisseurs.push({
      fournisseur,
      nbMessages: f.nbMessages,
      partReceptionsGlissees:
        causesConnues > 0 ? Math.round((appro / causesConnues) * 100) / 100 : null,
    })
  }
  fournisseurs.sort((x, y) => y.nbMessages - x.nbMessages)

  return {
    apres: jours.size > 0 ? ([...jours].sort().at(-1) ?? '') : '',
    avant: jours.size > 0 ? [...jours].sort()[0] : '',
    fenetreJours,
    joursCouverts,
    articles,
    fournisseurs,
  }
}
