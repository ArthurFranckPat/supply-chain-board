import type {
  ApproFetchResult,
  ApproMessageRow,
  ApproSuggestionRow,
  MrpMessageCode,
} from '#app/repositories/appro_repository'
import { MRP_MESSAGE } from '#app/repositories/appro_repository'
import type { ApproTriageResult } from './appro_triage.js'

/**
 * Domaine pur du module `/approvisionnements` (issue #103) : regroupe ce que le
 * CBN a produit en **dossiers par fournisseur**.
 *
 * ## Pourquoi le fournisseur, et pas l'article
 *
 * Mesuré sur AE1 le 01/08/2026, sur les échéances ≤ 31/10 : 706 lignes, 371
 * articles, 72 fournisseurs. À 30 jours, une ligne vaut exactement un article
 * (40 pour 40) — grouper par article n'y gagne rien. Grouper par fournisseur
 * ramène ces 40 lignes à 13 dossiers, et 251 lignes à 42 dossiers à 60 jours.
 *
 * Surtout, c'est la maille à laquelle une commande est réellement passée : trois
 * fournisseurs portent 51 % des lignes. Le regroupement n'est pas une commodité
 * d'affichage, c'est l'unité de décision.
 *
 * ## Ce que ce module ne fait PAS
 *
 * **Aucun calcul de verdict lui-même.** Les règles vivent dans `appro_triage.ts`
 * (lot 1, #103) ; ce module ne fait que les PORTER sur chaque ligne quand le
 * payload le demande (`attacheTriage`). Construit brut, il MONTRE ce que X3 dit,
 * groupé et trié — le verdict n'est jamais inventé ici.
 *
 * Le tri par urgence n'est pas un verdict : c'est l'échéance, telle quelle.
 */

/** Une ligne à décider, quelle que soit sa nature. */
export interface ApproItem {
  /**
   * Identité d'affichage. Stable pour un message (`VCRNUM`+`VCRLIN`), PAS pour
   * une suggestion — le CBN les recrée à chaque run. Ne rien y attacher qui
   * doive survivre à la nuit tant que #112 n'a pas tranché.
   */
  cle: string
  nature: 'suggestion' | 'message'
  /** `null` pour une suggestion, qui ne porte aucun message CBN. */
  message: MrpMessageCode | null
  article: string
  designation: string
  /** Échéance, en ISO (`YYYY-MM-DD`). `null` si X3 n'en porte pas. */
  echeance: string | null
  /** Jours d'ici l'échéance. Négatif = déjà dépassée. `null` si pas d'échéance. */
  jours: number | null
  /** Date proposée par le CBN, messages « avancer »/« retarder » seulement. */
  dateProposee: string | null
  /** Décalage proposé, en jours. Négatif = avancer. `null` si sans objet. */
  decalage: number | null
  quantite: number
  /**
   * Délai de réappro effectif (OFS_0, repli PRPLTI_0 — #114/#132). Suggestion
   * seule : `null` sur un message. `null` sur une suggestion = délai non
   * renseigné → repli d'affichage 14 j + signal « sans délai ».
   */
  delaiReappro: number | null
  /**
   * Verdict de triage (lot 1 #103) : verdict + score + preuves sourcées, calculé
   * par `appro_triage.ts` et rattaché par `attacheTriage`. `null` sur un payload
   * brut — la page ne juge que si l'appelant l'a demandé.
   */
  triage: ApproTriageResult | null
}

/** Un fournisseur et tout ce qu'il porte. */
export interface ApproDossier {
  fournisseur: string
  nom: string
  items: ApproItem[]
  /** Échéance la plus proche du dossier, ISO. Porte le tri. */
  premiereEcheance: string | null
  /** Jours jusqu'à `premiereEcheance`. */
  jours: number | null
  nbArticles: number
  nbSuggestions: number
  nbMessages: number
}

export interface ApproStats {
  nbDossiers: number
  nbItems: number
  nbArticles: number
  nbSuggestions: number
  nbMessages: number
  /** Détail des messages par code, pour la barre de résumé. */
  parMessage: Record<MrpMessageCode, number>
}

export interface ApproPayload {
  dossiers: ApproDossier[]
  stats: ApproStats
}

/** Libellés du menu local 318, restreints aux codes que le site produit. */
export const MESSAGE_LABEL: Record<MrpMessageCode, string> = {
  [MRP_MESSAGE.AVANCER]: 'Avancer',
  [MRP_MESSAGE.RETARDER]: 'Retarder',
  [MRP_MESSAGE.INUTILE]: 'Inutile',
}

const isoDay = (d: Date | null): string | null => (d === null ? null : d.toISOString().slice(0, 10))

/**
 * Écart en jours entiers entre deux jours ISO. Calculé sur les jours et non sur
 * des horodatages : deux dates à minuit UTC ne peuvent pas rendre 0,9 jour, et
 * l'arrondi ne dépend pas du fuseau du serveur.
 */
const joursEntre = (deIso: string, aIso: string): number => {
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return 0
  return Math.round((a - de) / 86_400_000)
}

const itemFromSuggestion = (row: ApproSuggestionRow, todayIso: string): ApproItem => {
  const echeance = isoDay(row.date)
  return {
    cle: `S:${row.numero}`,
    nature: 'suggestion',
    message: null,
    article: row.article,
    designation: row.designation,
    echeance,
    jours: echeance === null ? null : joursEntre(todayIso, echeance),
    dateProposee: null,
    decalage: null,
    quantite: row.quantite,
    delaiReappro: row.delaiReappro,
    triage: null,
  }
}

const itemFromMessage = (row: ApproMessageRow, todayIso: string): ApproItem => {
  const echeance = isoDay(row.date)
  const proposee = isoDay(row.dateProposee)
  return {
    cle: `M:${row.numero}:${row.ligne}`,
    nature: 'message',
    message: row.message,
    article: row.article,
    designation: row.designation,
    echeance,
    jours: echeance === null ? null : joursEntre(todayIso, echeance),
    dateProposee: proposee,
    decalage: echeance !== null && proposee !== null ? joursEntre(echeance, proposee) : null,
    quantite: row.quantite,
    delaiReappro: null,
    triage: null,
  }
}

/**
 * Tri des items DANS un dossier : l'échéance, du plus proche au plus lointain.
 *
 * Une ligne sans échéance passe en dernier plutôt que d'être traitée comme le
 * 01/01/1970 — l'absence de date n'est pas une urgence maximale.
 */
const parEcheance = (a: ApproItem, b: ApproItem): number => {
  if (a.echeance === null && b.echeance === null) return a.article.localeCompare(b.article)
  if (a.echeance === null) return 1
  if (b.echeance === null) return -1
  return a.echeance.localeCompare(b.echeance) || a.article.localeCompare(b.article)
}

/**
 * Construit les dossiers fournisseur.
 *
 * `todayIso` est un PARAMÈTRE et non un `new Date()` interne : la fonction reste
 * pure, donc testable sans figer l'horloge, et les jours affichés ne changent pas
 * en cours de rendu.
 */
export function buildApproPayload(source: ApproFetchResult, todayIso: string): ApproPayload {
  // Le code fournisseur porte le regroupement mais n'a rien à faire dans l'item,
  // qui vit DÉJÀ à l'intérieur d'un dossier : on l'apparie ici, puis on l'oublie.
  const apparies: Array<{ code: string; item: ApproItem }> = [
    ...source.suggestions.map((r) => ({
      code: r.fournisseur,
      item: itemFromSuggestion(r, todayIso),
    })),
    ...source.messages.map((r) => ({ code: r.fournisseur, item: itemFromMessage(r, todayIso) })),
  ]
  const items = apparies.map((a) => a.item)

  const parFournisseur = new Map<string, ApproItem[]>()
  for (const { code, item } of apparies) {
    const list = parFournisseur.get(code)
    if (list === undefined) parFournisseur.set(code, [item])
    else list.push(item)
  }

  const dossiers: ApproDossier[] = [...parFournisseur.entries()].map(([code, list]) => {
    const tries = [...list].sort(parEcheance)
    return construitDossier(
      code,
      source.fournisseurs[code] || (code === '' ? 'Sans fournisseur' : `Tiers ${code}`),
      tries,
      todayIso
    )
  })

  // Tri des dossiers : l'échéance la plus proche d'abord. Un dossier sans aucune
  // échéance ferme la marche, pour la même raison que les items.
  dossiers.sort((a, b) => {
    if (a.premiereEcheance === null && b.premiereEcheance === null)
      return a.nom.localeCompare(b.nom)
    if (a.premiereEcheance === null) return 1
    if (b.premiereEcheance === null) return -1
    return a.premiereEcheance.localeCompare(b.premiereEcheance) || a.nom.localeCompare(b.nom)
  })

  return {
    dossiers,
    stats: buildStats(items, dossiers.length),
  }
}

/**
 * Dossier fournisseur construit depuis ses items — même définition pour la vue
 * brute et la vue dérivée, pour que le sommaire ne dérive jamais de la table.
 */
const construitDossier = (
  code: string,
  nom: string,
  tries: ApproItem[],
  todayIso: string
): ApproDossier => {
  const premiere = tries.find((i) => i.echeance !== null)?.echeance ?? null
  return {
    fournisseur: code,
    // Un code sans raison sociale reste identifiable par son code : l'afficher
    // vide ferait un dossier anonyme sur lequel personne ne peut agir.
    nom,
    items: tries,
    premiereEcheance: premiere,
    jours: premiere === null ? null : joursEntre(todayIso, premiere),
    nbArticles: new Set(tries.map((i) => i.article)).size,
    nbSuggestions: tries.filter((i) => i.nature === 'suggestion').length,
    nbMessages: tries.filter((i) => i.nature === 'message').length,
  }
}

/** Stats du payload — une seule source pour la vue brute et la vue dérivée. */
const buildStats = (items: ApproItem[], nbDossiers: number): ApproStats => {
  const parMessage: Record<MrpMessageCode, number> = {
    [MRP_MESSAGE.AVANCER]: 0,
    [MRP_MESSAGE.RETARDER]: 0,
    [MRP_MESSAGE.INUTILE]: 0,
  }
  for (const item of items) {
    if (item.message !== null) parMessage[item.message] += 1
  }
  return {
    nbDossiers,
    nbItems: items.length,
    nbArticles: new Set(items.map((i) => i.article)).size,
    nbSuggestions: items.filter((i) => i.nature === 'suggestion').length,
    nbMessages: items.filter((i) => i.nature === 'message').length,
    parMessage,
  }
}

/**
 * Restreint le payload à la fenêtre dérivée du délai (décision #114) : une
 * suggestion entre dans la file quand `échéance ≤ aujourd'hui + délai de
 * réappro` — le moment où ne pas décider coûte. Le délai est celui de la ligne
 * (`OFS_0`, repli `PRPLTI_0`, puis 14 j pour une ligne sans délai renseigné,
 * qui reste signalée par `delaiReappro === null`).
 *
 * Les messages de replanif ne sont PAS bornés par le délai : leur décision est
 * le décalage proposé, pas l'échéance — la file unique #115 les conserve tels
 * quels, dans la borne de chargement (90 j). Une suggestion sans échéance est
 * écartée (jamais décidable sans date), une échéance dépassée reste (cas le
 * plus urgent). Pur : renvoie un nouveau payload, l'original reste intact.
 */
export function filtreFenetreDerivee(payload: ApproPayload, todayIso: string): ApproPayload {
  const DELAI_REPLI = 14
  const dansFenetre = (item: ApproItem): boolean => {
    if (item.nature === 'message') return true
    if (item.echeance === null) return false
    const delai = item.delaiReappro ?? DELAI_REPLI
    return joursEntre(todayIso, item.echeance) <= delai
  }

  const dossiers = payload.dossiers
    .map((dossier) => {
      const items = dossier.items.filter(dansFenetre)
      if (items.length === 0) return null
      return construitDossier(dossier.fournisseur, dossier.nom, items, todayIso)
    })
    .filter((dossier): dossier is ApproDossier => dossier !== null)
  const items = dossiers.flatMap((dossier) => dossier.items)

  return { dossiers, stats: buildStats(items, dossiers.length) }
}
