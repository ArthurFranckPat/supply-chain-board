import type { ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'
import type { CbnExplanation } from '#app/domain/cbn_explanation'

/**
 * Patterns émergents du CBN (#138 lot 2).
 *
 * Avec 3+ semaines d'historique de photos, des régularités apparaissent que le
 * diff J-1 ne montre pas :
 *
 * - **articles volatils** — un article porte message sur message : c'est du
 *   bruit structurel, son explication importe moins et il faut le signaler
 *   plutôt que de le laisser encombrer la file ;
 * - **fournisseurs problématiques** — un fournisseur dont une part élevée des
 *   messages est liée à des réceptions glissées (`appro`) est un signal
 *   fournisseur, pas un signal CBN : l'acheteur peut l'attaquer à la source.
 *
 * ## Deux règles de comptage, apprises à la revue
 *
 * 1. **Un message = une clé stable**, pas une ligne de photo. Un message
 *    présent 21 jours d'affilée est UN message qui dure, pas 21 messages. Le
 *    compter par ligne classait en tête les messages les plus anciens — la
 *    persistance, pas la volatilité.
 * 2. **La dominance se mesure sur plusieurs diffs.** L'appelant passe les
 *    explications de N couples de photos consécutifs (`diffs`), pas d'un diff
 *    unique étalé sur la fenêtre. « Cet article reçoit systématiquement
 *    "avancer" à cause du stock » est une régularité DANS LE TEMPS : un seul
 *    diff J-21 vs J ne peut pas la voir, il ne rend qu'une photo de plus.
 *
 * Pur, sans I/O : le service lit les photos et calcule les explications, ce
 * module ne fait qu'agréger — en une passe, sans boucle imbriquée sur les
 * lignes (16 000 lignes × 150 fournisseurs se paient comptant sinon).
 */

/** Volatilité d'un article sur la fenêtre, dérivée de sa fréquence de messages. */
export type Volatilite = 'haute' | 'moyenne' | 'basse'

export interface PatternArticle {
  article: string
  /** Messages DISTINCTS (clé stable) portés sur la fenêtre. */
  nbMessages: number
  /** Jours de photo où l'article portait au moins un message. */
  joursSousMessage: number
  /** Messages distincts par semaine, sur l'étendue calendaire réelle. */
  messagesSemaine: number
  /** Source la plus fréquente parmi les corrélations convergentes des diffs. */
  sourceDominante: string | null
  /** Part de la source dominante (0-1), `null` si aucune corrélation. */
  partSourceDominante: number | null
  /** Nombre de diffs de la fenêtre où l'article portait une corrélation. */
  diffsExpliques: number
  volatilite: Volatilite
}

export interface PatternFournisseur {
  fournisseur: string
  /** Messages DISTINCTS portés par ce fournisseur sur la fenêtre. */
  nbMessages: number
  /**
   * Part des messages distincts du fournisseur dont l'EXPLICATION PRINCIPALE
   * du message (corrélation dominante, agrégée sur les diffs) est une
   * réception (`appro`), sur TOUS les messages du fournisseur — expliqués ou
   * non, un message sans explication compte dans le dénominateur (il ne peut
   * pas être une réception glissée).
   *
   * `null` si aucun message du fournisseur n'a d'explication connue.
   */
  partReceptionsGlissees: number | null
}

/**
 * Qualité du moteur sur le diff le plus récent de la fenêtre — les métriques
 * d'acceptation du lot 2, mesurées et non promises.
 */
export interface QualiteExplications {
  messages: number
  nonExpliques: number
  /** `nonExpliques / messages` (0-1), `null` si aucun message. */
  tauxNonExplique: number | null
  /** Couverture moyenne des messages expliqués (0-1), `null` si aucun. */
  couvertureMoyenne: number | null
  /** Résidu inexpliqué moyen (0-1), `null` si aucun message. */
  residuMoyen: number | null
}

export interface ApproPatterns {
  /** Fenêtre de photos couverte, `[apres, avant]`. */
  apres: string
  avant: string
  /** Nombre de jours de la fenêtre demandée. */
  fenetreJours: number
  /** Jours de photos réellement couverts dans la fenêtre. */
  joursCouverts: number
  /** Couples de photos consécutifs réellement analysés pour la dominance. */
  diffsAnalyses: number
  articles: PatternArticle[]
  fournisseurs: PatternFournisseur[]
  qualite: QualiteExplications
}

/** Seuils de volatilité, en messages/semaine (hypothèse, à calibrer en atelier). */
const VOLATILITE_HAUTE = 2
const VOLATILITE_MOYENNE = 0.5

const volatilite = (messagesSemaine: number): Volatilite => {
  if (messagesSemaine >= VOLATILITE_HAUTE) return 'haute'
  if (messagesSemaine >= VOLATILITE_MOYENNE) return 'moyenne'
  return 'basse'
}

const arrondi2 = (v: number): number => Math.round(v * 100) / 100

/** Clé stable d'un message — la même qu'en base (#107). */
const cleMessage = (l: ApproMessageSnapshotRow): string => `${l.vcrnum}:${l.vcrlin}:${l.vcrseq}`

/** Étendue calendaire réelle couverte par des photos, en jours (minimum 1). */
function etendueCalendaire(datesTriees: string[]): number {
  if (datesTriees.length < 2) return 1
  const debut = Date.parse(`${datesTriees[0]}T00:00:00Z`)
  const fin = Date.parse(`${datesTriees.at(-1)}T00:00:00Z`)
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return 1
  return Math.max(1, Math.round((fin - debut) / 86_400_000) + 1)
}

/** Qualité du moteur sur une liste d'explications (le diff le plus récent). */
function mesureQualite(explications: CbnExplanation[]): QualiteExplications {
  const messages = explications.length
  if (messages === 0) {
    return {
      messages: 0,
      nonExpliques: 0,
      tauxNonExplique: null,
      couvertureMoyenne: null,
      residuMoyen: null,
    }
  }
  let nonExpliques = 0
  let sommeCouverture = 0
  let nbExpliques = 0
  let sommeResidu = 0
  for (const e of explications) {
    if (e.niveau === 'non_explique') nonExpliques += 1
    else {
      sommeCouverture += e.couverture
      nbExpliques += 1
    }
    sommeResidu += e.residuInexplique
  }
  return {
    messages,
    nonExpliques,
    tauxNonExplique: arrondi2(nonExpliques / messages),
    couvertureMoyenne: nbExpliques > 0 ? arrondi2(sommeCouverture / nbExpliques) : null,
    residuMoyen: arrondi2(sommeResidu / messages),
  }
}

/**
 * Agrège les patterns à partir des photos de messages d'une fenêtre et des
 * explications de plusieurs diffs de cette même fenêtre.
 *
 * `lignes` : toutes les lignes de photos de messages dans la fenêtre.
 * `diffs` : les explications par couple de photos consécutif, du plus récent
 * au plus ancien — `diffs[0]` sert aussi de base aux métriques de qualité.
 * `photosFenetre` : les jours de PHOTO de la fenêtre, du plus récent au plus
 * ancien (calendrier des photos du besoin, PAS les dates des lignes de
 * messages : un jour de photo sans aucun message est un jour de fenêtre comme
 * un autre, et l'oublier ferait gonfler la fréquence hebdomadaire d'un article
 * présent sur une seule photo — un événement rare deviendrait « haute
 * volatilité »). C'est lui qui porte l'étendue calendaire du dénominateur.
 */
export function detectPatterns(
  lignes: ApproMessageSnapshotRow[],
  diffs: CbnExplanation[][],
  fenetreJours: number,
  photosFenetre: string[]
): ApproPatterns {
  // 1. Dominance par article, agrégée sur TOUS les diffs de la fenêtre, et
  //    par MESSAGE (clé stable) pour la part fournisseur — deux messages du
  //    même article expliqués par des sources différentes ne partagent pas
  //    l'explication de l'autre (revue lot 2).
  const sourcesParArticle = new Map<string, Map<string, number>>()
  const sourcesParCle = new Map<string, Map<string, number>>()
  const diffsExpliquesParArticle = new Map<string, number>()
  for (const explications of diffs) {
    const vusDansCeDiff = new Set<string>()
    for (const e of explications) {
      if (e.correlations.length === 0) continue
      const compteur = sourcesParArticle.get(e.article) ?? new Map<string, number>()
      const compteurCle = sourcesParCle.get(e.cle) ?? new Map<string, number>()
      for (const c of e.correlations) {
        compteur.set(c.source, (compteur.get(c.source) ?? 0) + 1)
        compteurCle.set(c.source, (compteurCle.get(c.source) ?? 0) + 1)
      }
      sourcesParArticle.set(e.article, compteur)
      sourcesParCle.set(e.cle, compteurCle)
      if (!vusDansCeDiff.has(e.article)) {
        vusDansCeDiff.add(e.article)
        diffsExpliquesParArticle.set(e.article, (diffsExpliquesParArticle.get(e.article) ?? 0) + 1)
      }
    }
  }

  const dominanteParArticle = new Map<string, { source: string; part: number }>()
  for (const [article, compteur] of sourcesParArticle) {
    let total = 0
    let best: { source: string; n: number } | null = null
    for (const [source, n] of compteur) {
      total += n
      if (best === null || n > best.n) best = { source, n }
    }
    if (best !== null && total > 0) {
      dominanteParArticle.set(article, { source: best.source, part: arrondi2(best.n / total) })
    }
  }
  const dominanteParCle = new Map<string, string>()
  for (const [cle, compteur] of sourcesParCle) {
    let best: { source: string; n: number } | null = null
    for (const [source, n] of compteur) {
      if (best === null || n > best.n) best = { source, n }
    }
    if (best !== null) dominanteParCle.set(cle, best.source)
  }

  // 2. Comptage des messages DISTINCTS, en une passe sur les lignes.
  const clesVues = new Set<string>()
  const messagesParArticle = new Map<string, { messages: number; jours: Set<string> }>()
  const messagesParFournisseur = new Map<
    string,
    { messages: number; appro: number; avecSource: number }
  >()

  for (const l of lignes) {
    const article = messagesParArticle.get(l.itmref) ?? { messages: 0, jours: new Set<string>() }
    article.jours.add(l.snapshot_date)
    messagesParArticle.set(l.itmref, article)

    // Un message qui dure ne compte qu'une fois — les jours qu'il traverse sont
    // dans `jours`, pas dans le décompte.
    const cle = cleMessage(l)
    if (clesVues.has(cle)) continue
    clesVues.add(cle)
    article.messages += 1

    if (l.fournisseur === null) continue
    const f = messagesParFournisseur.get(l.fournisseur) ?? {
      messages: 0,
      appro: 0,
      avecSource: 0,
    }
    f.messages += 1
    // Source de CE message, pas celle de son article : un article peut porter
    // des messages expliqués par des sources différentes, et les leur
    // substituer l'explication de l'autre fausserait la surveillance
    // fournisseur (revue lot 2).
    const sourceDuMessage = dominanteParCle.get(cle)
    if (sourceDuMessage !== undefined) {
      f.avecSource += 1
      if (sourceDuMessage === 'appro') f.appro += 1
    }
    messagesParFournisseur.set(l.fournisseur, f)
  }

  const datesTriees = [...photosFenetre].sort()
  const etendueJours = etendueCalendaire(datesTriees)

  const articles: PatternArticle[] = []
  for (const [article, agg] of messagesParArticle) {
    // Fréquence normalisée sur l'étendue CALENDAIRE réelle (avant → apres),
    // pas sur la fenêtre demandée : avec des trous (week-ends, pannes),
    // diviser par la fenêtre demandée sous-estime la fréquence observée.
    // L'étendue vient des jours de PHOTO couverts (tous, même sans message) :
    // un article présent sur une seule photo au milieu d'une fenêtre de 21
    // jours vaut ~0,33 message/semaine, pas 7 (revue lot 2).
    const messagesSemaine = (agg.messages / etendueJours) * 7
    const dominante = dominanteParArticle.get(article)
    articles.push({
      article,
      nbMessages: agg.messages,
      joursSousMessage: agg.jours.size,
      messagesSemaine: Math.round(messagesSemaine * 10) / 10,
      sourceDominante: dominante?.source ?? null,
      partSourceDominante: dominante?.part ?? null,
      diffsExpliques: diffsExpliquesParArticle.get(article) ?? 0,
      volatilite: volatilite(messagesSemaine),
    })
  }
  articles.sort((x, y) => y.messagesSemaine - x.messagesSemaine || y.nbMessages - x.nbMessages)

  const fournisseurs: PatternFournisseur[] = []
  for (const [fournisseur, f] of messagesParFournisseur) {
    fournisseurs.push({
      fournisseur,
      nbMessages: f.messages,
      partReceptionsGlissees: f.avecSource > 0 ? arrondi2(f.appro / f.messages) : null,
    })
  }
  fournisseurs.sort(
    (x, y) =>
      (y.partReceptionsGlissees ?? -1) - (x.partReceptionsGlissees ?? -1) ||
      y.nbMessages - x.nbMessages
  )

  return {
    apres: photosFenetre[0] ?? '',
    avant: photosFenetre.at(-1) ?? '',
    fenetreJours,
    joursCouverts: photosFenetre.length,
    diffsAnalyses: diffs.length,
    articles,
    fournisseurs,
    qualite: mesureQualite(diffs[0] ?? []),
  }
}
