/**
 * Moteur de lissage de charge — repositionnement de DATES DE LIGNE DE COMMANDE
 * pour rattraper le jalonnement à capacité infinie du CBN.
 *
 * Domaine pur : aucune dépendance Adonis, aucune I/O. Même maison que
 * `plan_diff.ts` et `rupture_engine.ts`.
 *
 * ── Le problème ─────────────────────────────────────────────────────────────
 * Le CBN de X3 jalonne à capacité infinie : il pose chaque OF sur le seul temps
 * de gamme, sans jamais regarder combien d'ordres tombent le même jour ni ce que
 * le poste peut absorber. Le pic de début de semaine qu'affiche /charge n'est
 * donc PAS un fait de production, c'est un artefact d'entrée. Mesuré sur
 * `PP_091` (ligne emballage EAR, 7,5 h/j) semaine du 28/09/2026 : 20,5 h le
 * lundi (273 % de la journée) puis 1,4 h le vendredi, pour 41,3 h de reste à
 * produire sur 37,5 h de capacité. Ce moteur fait la passe que le CBN ne fait
 * pas.
 *
 * ── Ce que ce moteur N'EST PAS ──────────────────────────────────────────────
 * Ce n'est pas un ordonnanceur. On ne décide pas quel ordre passe à quelle
 * heure, on ne séquence rien à l'intérieur d'une journée. On repositionne des
 * DATES DE LIGNE DE COMMANDE CLIENT, et le CBN rejalonne derrière. L'unité
 * d'action est donc la ligne de commande, jamais l'opération de gamme.
 *
 * Corollaire : on ne coupe JAMAIS une ligne. Une ligne de 8,4 h posée sur un
 * jour de 7,5 h déborde naturellement sur le lendemain et s'y termine — c'est
 * une conséquence acceptée, pas une décision. Ce qu'il faut interdire, c'est
 * l'entrelacement (un ordre entamé, abandonné, repris plus tard) : en ne
 * déplaçant que des lignes entières, il ne peut pas se produire.
 *
 * ── Qui a le droit de bouger ────────────────────────────────────────────────
 * ALDES S.A. (`80001`) est le client France : des camions partent tous les jours
 * vers la plateforme, ses dates ont donc de la latitude — 10 jours ouvrés avant,
 * 5 après. Tous les autres clients sont des exports (Pologne, Hongrie,
 * Allemagne, Suisse…) avec un départ hebdomadaire à date contractuelle : on peut
 * les avancer de 10 jours ouvrés, JAMAIS les retarder d'un seul jour.
 *
 * C'est pourquoi retarder du ALDES est le levier par défaut et avancer le levier
 * de secours : retarder ne pose aucun problème matière (les composants sont déjà
 * là), alors qu'avancer suppose les composants présents — l'appelant plafonne
 * l'avance avec `material_projection` avant d'appeler, dans `auPlusTotIso`.
 *
 * ── L'objectif est LEXICOGRAPHIQUE, pas une somme pondérée ──────────────────
 * Dans l'ordre, sans compensation possible entre les rangs :
 *   1. annuler les dépassements de capacité journalière ;
 *   2. égaliser la charge entre les jours ;
 *   3. minimiser le nombre puis l'amplitude des déplacements.
 * Une somme pondérée laisserait un réglage de poids décider qu'un dépassement
 * de 3 h « vaut » deux déplacements de moins. Ce n'est pas la question posée :
 * un jour à 273 % n'est pas produisible, point.
 */

/** Client ALDES S.A. (`BPCORD`/`BPCNUM`) — le France, seul client déplaçable. */
export const CLIENT_ALDES = '80001'

/** Marge d'avance autorisée, en jours ouvrés — identique pour tous les clients. */
export const AVANCE_MAX_JOURS_OUVRES = 10

/** Marge de retard autorisée sur une ligne ALDES, en jours ouvrés. */
export const RETARD_MAX_JOURS_OUVRES_ALDES = 5

/** Une ligne de commande est déplaçable, ou sa date est contractuelle. */
export type Mobilite = 'deplacable' | 'ferme'

export interface MobiliteLigne {
  mobilite: Mobilite
  /** Motif affichable, en clair — l'écran ne doit pas redire la règle. */
  motif: string
  /** La ligne part à l'export : sa date ne peut jamais reculer dans le temps. */
  export: boolean
}

/**
 * Mobilité d'une ligne d'après son client.
 *
 * Une ligne sans code client est une PRÉVISION : X3 ne porte pas de tiers
 * dessus. On la traite en ferme — non pas parce que sa date serait
 * contractuelle, mais parce qu'il n'y a aucune ligne de commande à re-dater
 * derrière : déplacer une prévision ne produit rien de réel.
 */
export function mobiliteDeLigne(clientCode: string | null | undefined): MobiliteLigne {
  if (!clientCode) {
    return { mobilite: 'ferme', motif: 'Prévision — pas de ligne à re-dater', export: false }
  }
  if (clientCode.trim() === CLIENT_ALDES) {
    return { mobilite: 'deplacable', motif: 'Client France — départs quotidiens', export: false }
  }
  return { mobilite: 'ferme', motif: 'Client export — date contractuelle', export: true }
}

/**
 * Fenêtre de déplacement d'une ligne, en jours ouvrés, bornée par la liste des
 * jours ouvrés fournie par l'appelant (calendrier usine appliqué : fériés,
 * fermetures, schéma du poste).
 *
 * `joursOuvres` doit être triée et couvrir au moins la fenêtre demandée ; une
 * borne qui sortirait de la liste est ramenée à son extrémité — mieux vaut une
 * fenêtre trop étroite qu'une date proposée un jour où le poste est fermé.
 */
export function fenetreDeplacement(
  dateIso: string,
  mobilite: MobiliteLigne,
  joursOuvres: string[]
): { auPlusTotIso: string; auPlusTardIso: string } {
  // Jour ouvré de rattachement : si la date tombe un jour fermé, on prend le
  // premier ouvré qui suit — c'est là que la charge se produira de toute façon.
  let idx = joursOuvres.findIndex((d) => d >= dateIso)
  if (idx === -1) idx = joursOuvres.length - 1
  if (idx < 0) return { auPlusTotIso: dateIso, auPlusTardIso: dateIso }

  const tot = Math.max(0, idx - AVANCE_MAX_JOURS_OUVRES)
  const tard =
    mobilite.mobilite === 'deplacable'
      ? Math.min(joursOuvres.length - 1, idx + RETARD_MAX_JOURS_OUVRES_ALDES)
      : idx
  return { auPlusTotIso: joursOuvres[tot]!, auPlusTardIso: joursOuvres[tard]! }
}

/** Une ligne de commande datée, vue du poste qu'on lisse. */
export interface LigneLissage {
  numCommande: string
  ligne: string
  /** Heures de charge de CETTE ligne sur LE poste considéré. */
  heures: number
  /** Jour de rattachement actuel (ISO `YYYY-MM-DD`). */
  dateIso: string
  /** Bornes incluses de la fenêtre autorisée, matière déjà plafonnée. */
  auPlusTotIso: string
  auPlusTardIso: string
  /**
   * Ligne export : sa date ne doit JAMAIS reculer dans le temps. Redit ici en
   * plus de la fenêtre parce qu'une fenêtre mal calculée en amont coûte un
   * client — le moteur refuse l'aval quoi qu'on lui passe (cf. `estCandidat`).
   */
  export: boolean
}

/** Capacité nette du poste pour un jour de l'horizon (0 = fermé). */
export interface JourCapacite {
  dateIso: string
  capaciteH: number
}

export interface OptionsLissage {
  /**
   * Gain minimal, en heures, pour qu'un déplacement qui ne réduit AUCUN
   * dépassement soit tout de même proposé au titre de l'égalisation.
   *
   * Sans ce plancher, le moteur proposerait de re-dater une commande pour
   * gagner six minutes d'écart-type : un déplacement se négocie avec un client,
   * il doit se justifier en heures visibles.
   */
  gainEgalisationMinH: number
  /** Garde-fou d'itérations — le moteur converge bien avant. */
  maxIterations: number
}

export const DEFAULT_OPTIONS_LISSAGE: OptionsLissage = {
  gainEgalisationMinH: 0.25,
  maxIterations: 200,
}

export interface DeplacementPropose {
  numCommande: string
  ligne: string
  /** Heures déplacées — c'est le poids de la décision. */
  heures: number
  deIso: string
  versIso: string
  sens: 'avance' | 'retard'
  /** Amplitude en jours OUVRÉS du poste (pas en jours calendaires). */
  joursOuvres: number
}

export interface ProfilJour {
  dateIso: string
  capaciteH: number
  heuresAvant: number
  heuresApres: number
  /** Saturation = heures / capacité, en fraction (1 = 100 %). `null` si fermé. */
  saturationAvant: number | null
  saturationApres: number | null
}

export interface PlanLissage {
  deplacements: DeplacementPropose[]
  profil: ProfilJour[]
  /** Somme des heures au-dessus de la capacité journalière, avant / après. */
  depassementAvantH: number
  depassementApresH: number
  /** Écart quadratique moyen à la charge parfaitement lissée (h), avant / après. */
  ecartAvantH: number
  ecartApresH: number
  /** Lignes hors horizon fourni, laissées telles quelles — jamais un silence. */
  lignesIgnorees: { numCommande: string; ligne: string; dateIso: string }[]
}

/** Tolérance de comparaison flottante — 36 millisecondes d'heure. */
const EPS = 1e-6

const r1 = (n: number): number => Math.round(n * 10) / 10
const r2 = (n: number): number => Math.round(n * 100) / 100

/** Dépassement total : somme, jour par jour, de ce qui passe au-dessus du plafond. */
function depassement(charge: number[], cap: number[]): number {
  let total = 0
  for (let i = 0; i < charge.length; i++) total += Math.max(0, (charge[i] ?? 0) - (cap[i] ?? 0))
  return total
}

/**
 * Écart à la charge PARFAITEMENT lissée, en heures.
 *
 * La cible d'un jour n'est pas la moyenne mais `capacité × ρ`, avec ρ le taux de
 * charge global de la période : égaliser des JOURS de capacités différentes n'a
 * pas de sens, c'est la SATURATION qu'on égalise. Un vendredi à demi-journée
 * doit recevoir une demi-charge, pas la même que le lundi.
 *
 * Racine de la moyenne des carrés, donc homogène à des heures : le seuil de gain
 * de `OptionsLissage` se lit alors en heures, et non dans une unité inventée.
 */
function ecart(charge: number[], cap: number[]): number {
  let totalCharge = 0
  let totalCap = 0
  let ouverts = 0
  for (const [i, h] of charge.entries()) {
    totalCharge += h
    if ((cap[i] ?? 0) > 0) {
      totalCap += cap[i] ?? 0
      ouverts++
    }
  }
  if (ouverts === 0 || totalCap <= 0) return 0
  const rho = totalCharge / totalCap
  let somme = 0
  for (const [i, h] of charge.entries()) {
    if ((cap[i] ?? 0) <= 0) continue
    const delta = h - (cap[i] ?? 0) * rho
    somme += delta * delta
  }
  return Math.sqrt(somme / ouverts)
}

/**
 * Clé lexicographique d'un état. Les trois premiers rangs sont l'objectif métier ;
 * le quatrième départage à égalité stricte.
 */
interface Cle {
  depassement: number
  ecart: number
  nbDeplacements: number
  amplitude: number
  /**
   * Heures déplacées vers l'AMONT. Dernier rang, donc sans influence tant que le
   * profil ou le nombre de déplacements diffère : à choix strictement équivalent,
   * on retarde plutôt qu'on avance. Retarder ne coûte rien en matière (les
   * composants sont déjà là) ; avancer suppose de les avoir — c'est le levier de
   * secours, pas le levier par défaut.
   */
  heuresAvancees: number
}

/** < 0 si `a` est strictement meilleur que `b`, > 0 si pire, 0 si équivalent. */
function compareCle(a: Cle, b: Cle): number {
  if (Math.abs(a.depassement - b.depassement) > EPS) return a.depassement - b.depassement
  if (Math.abs(a.ecart - b.ecart) > EPS) return a.ecart - b.ecart
  if (a.nbDeplacements !== b.nbDeplacements) return a.nbDeplacements - b.nbDeplacements
  if (Math.abs(a.amplitude - b.amplitude) > EPS) return a.amplitude - b.amplitude
  return a.heuresAvancees - b.heuresAvancees
}

/**
 * Lisse la charge d'UN poste sur l'horizon fourni, en repositionnant des dates
 * de ligne de commande.
 *
 * Périmètre volontairement borné au poste passé — celui d'assemblage /
 * emballage final. L'effet d'un déplacement sur les autres postes de la gamme
 * n'est ni mesuré ni optimisé : le métier a écarté le sujet, et prétendre le
 * traiter à moitié serait pire que de ne pas le traiter.
 *
 * Recherche : amélioration itérative à MEILLEUR déplacement d'abord. À chaque
 * tour on évalue tout couple (ligne, jour candidat) et on applique le meilleur
 * s'il améliore strictement la clé lexicographique. On s'arrête quand plus
 * aucun ne l'améliore — donc un déplacement qui n'améliore rien n'est jamais
 * proposé, ce qui est la propriété qu'on veut opposer à un utilisateur qui
 * demandera « pourquoi celui-là ? ».
 */
export function lisserCharge(
  lignes: LigneLissage[],
  jours: JourCapacite[],
  options: Partial<OptionsLissage> = {}
): PlanLissage {
  const opt: OptionsLissage = { ...DEFAULT_OPTIONS_LISSAGE, ...options }
  const cap = jours.map((j) => Math.max(0, j.capaciteH))
  const idxByIso = new Map(jours.map((j, i) => [j.dateIso, i]))

  // Index OUVRÉ : l'amplitude d'un déplacement se compte en jours de production,
  // pas en jours calendaires — un lundi déplacé au lundi suivant, c'est 5 jours
  // ouvrés, pas 7, et c'est la lecture du planificateur.
  const rangOuvre: number[] = []
  let rang = 0
  for (let i = 0; i < jours.length; i++) {
    rangOuvre.push(rang)
    if ((cap[i] ?? 0) > 0) rang++
  }

  const chargeAvant = jours.map(() => 0)
  const lignesIgnorees: PlanLissage['lignesIgnorees'] = []

  /** Lignes retenues, avec leur position d'origine et leur position courante. */
  interface Suivi {
    ligne: LigneLissage
    origine: number
    courant: number
  }
  const suivis: Suivi[] = []
  for (const l of lignes) {
    const i = idxByIso.get(l.dateIso)
    if (i === undefined || l.heures <= 0) {
      // Une ligne hors de l'horizon fourni (ou sans heures sur ce poste) n'est
      // pas déplaçable ici : on la remonte plutôt que de la faire disparaître.
      if (i === undefined) {
        lignesIgnorees.push({ numCommande: l.numCommande, ligne: l.ligne, dateIso: l.dateIso })
      }
      continue
    }
    chargeAvant[i] = (chargeAvant[i] ?? 0) + l.heures
    suivis.push({ ligne: l, origine: i, courant: i })
  }

  const charge = [...chargeAvant]

  /**
   * Le jour `j` est-il un candidat légal pour cette ligne ?
   *
   * Le refus de l'aval sur une ligne export est redit ici, en plus de la
   * fenêtre : c'est l'invariant contractuel du moteur, et il ne doit pas
   * dépendre de la justesse d'un calcul fait ailleurs.
   */
  const estCandidat = (s: Suivi, j: number): boolean => {
    if (j === s.courant) return false
    if ((cap[j] ?? 0) <= 0) return false
    const iso = jours[j]!.dateIso
    if (iso < s.ligne.auPlusTotIso || iso > s.ligne.auPlusTardIso) return false
    if (s.ligne.export && iso > s.ligne.dateIso) return false
    return true
  }

  const cleCourante = (): Cle => {
    let nb = 0
    let amplitude = 0
    let heuresAvancees = 0
    for (const s of suivis) {
      if (s.courant === s.origine) continue
      nb++
      amplitude += Math.abs((rangOuvre[s.courant] ?? 0) - (rangOuvre[s.origine] ?? 0))
      if (s.courant < s.origine) heuresAvancees += s.ligne.heures
    }
    return {
      depassement: depassement(charge, cap),
      ecart: ecart(charge, cap),
      nbDeplacements: nb,
      amplitude,
      heuresAvancees,
    }
  }

  let cle = cleCourante()
  for (let iter = 0; iter < opt.maxIterations; iter++) {
    let meilleur: { s: Suivi; j: number; cle: Cle } | null = null

    for (const s of suivis) {
      for (let j = 0; j < jours.length; j++) {
        if (!estCandidat(s, j)) continue
        charge[s.courant] = (charge[s.courant] ?? 0) - s.ligne.heures
        charge[j] = (charge[j] ?? 0) + s.ligne.heures
        const avant = s.courant
        s.courant = j
        const candidat = cleCourante()
        s.courant = avant
        charge[j] = (charge[j] ?? 0) - s.ligne.heures
        charge[avant] = (charge[avant] ?? 0) + s.ligne.heures

        // Rang 1 (dépassement) : toute réduction franche est bonne à prendre.
        // Rangs suivants : à dépassement égal, l'égalisation doit rapporter plus
        // que le plancher — sinon on dérange un client pour rien.
        const gagneDepassement = cle.depassement - candidat.depassement > EPS
        const memeDepassement = Math.abs(cle.depassement - candidat.depassement) <= EPS
        const gagneEgalisation = cle.ecart - candidat.ecart >= opt.gainEgalisationMinH
        const dejaDeplacee = s.courant !== s.origine
        // Une ligne DÉJÀ déplacée peut être réajustée sans repayer le plancher :
        // le coût client est engagé, seule compte la qualité du profil final.
        const recevable =
          gagneDepassement || (memeDepassement && (gagneEgalisation || dejaDeplacee))
        if (!recevable) continue
        if (compareCle(candidat, cle) >= 0) continue
        if (!meilleur || compareCle(candidat, meilleur.cle) < 0) {
          meilleur = { s, j, cle: candidat }
        }
      }
    }

    if (!meilleur) break
    charge[meilleur.s.courant] = (charge[meilleur.s.courant] ?? 0) - meilleur.s.ligne.heures
    charge[meilleur.j] = (charge[meilleur.j] ?? 0) + meilleur.s.ligne.heures
    meilleur.s.courant = meilleur.j
    cle = cleCourante()
  }

  const deplacements: DeplacementPropose[] = []
  for (const s of suivis) {
    if (s.courant === s.origine) continue
    const deIso = jours[s.origine]!.dateIso
    const versIso = jours[s.courant]!.dateIso
    deplacements.push({
      numCommande: s.ligne.numCommande,
      ligne: s.ligne.ligne,
      heures: r1(s.ligne.heures),
      deIso,
      versIso,
      sens: s.courant > s.origine ? 'retard' : 'avance',
      joursOuvres: Math.abs((rangOuvre[s.courant] ?? 0) - (rangOuvre[s.origine] ?? 0)),
    })
  }
  // Le plus lourd d'abord : c'est le déplacement qui porte la décision.
  deplacements.sort((a, b) => b.heures - a.heures || a.deIso.localeCompare(b.deIso))

  const profil: ProfilJour[] = jours.map((j, i) => ({
    dateIso: j.dateIso,
    capaciteH: r1(cap[i] ?? 0),
    heuresAvant: r1(chargeAvant[i] ?? 0),
    heuresApres: r1(charge[i] ?? 0),
    saturationAvant: (cap[i] ?? 0) > 0 ? r2((chargeAvant[i] ?? 0) / (cap[i] ?? 1)) : null,
    saturationApres: (cap[i] ?? 0) > 0 ? r2((charge[i] ?? 0) / (cap[i] ?? 1)) : null,
  }))

  return {
    deplacements,
    profil,
    depassementAvantH: r1(depassement(chargeAvant, cap)),
    depassementApresH: r1(depassement(charge, cap)),
    ecartAvantH: r1(ecart(chargeAvant, cap)),
    ecartApresH: r1(ecart(charge, cap)),
    lignesIgnorees,
  }
}
