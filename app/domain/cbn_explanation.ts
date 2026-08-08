import type { CbnMessageDiffEntry } from '#app/domain/cbn_message_diff'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'

/**
 * Moteur d'explication (#138 lot 1).
 *
 * Croise le diff des messages avec le diff des drivers du même article et
 * attribue les variations **convergentes** (qui poussent dans le sens du
 * message) comme corrélations possibles, jamais comme causes certaines.
 *
 * Le CBN fait du netting par fenêtres temporelles ; ce moteur ne le rejoue
 * pas — il corrèle. Une corrélation fausse coûte plus cher que pas de
 * corrélation : le seuil `non expliqué` est assumé.
 *
 * Catalogue :
 * - Avancer (2) ← stock baisse, demande ferme/prev apparue ou ↑ quantité/avancée,
 *   réception retardée/réduite/disparue, OF consommateur apparu/augmenté.
 * - Retarder (3) = miroir.
 * - Inutile (6) ← disparition de demande ou d'OF, stock hausse couvrant le besoin.
 *
 * Poids (ordre décroissant, stable pour les tests) :
 *  3 = stock, demande_ferme, appro (réceptions)
 *  2 = of_ferme/of_planifie, demande_prevision
 *
 * ## Scoring de confiance (lot 2)
 *
 * Chaque corrélation porte une `amplitude` (la variation en unités qu'elle
 * représente), une `part` (sa proportion de l'explication) et une `confiance`
 * (0-1) :
 *
 * - `part` = amplitude de la corrélation / amplitude convergente totale. C'est
 *   la règle de la feuille de route : « si le stock a baissé de 400 et qu'une
 *   commande de 200 est apparue, le stock pèse ~67 % ». Normaliser sur le
 *   POIDS DE SOURCE à la place rendrait 50/50 — deux sources de poids 3 — et
 *   dirait donc l'inverse de la réalité.
 * - `confiance` : base par poids de source (3 → 0,85, 2 → 0,70, 1 → 0,55),
 *   +0,10 si plusieurs facteurs convergent (corroboration), −0,15 si un signal
 *   contradictoire atténue le message.
 *
 * ## Couverture et résidu inexpliqué
 *
 * `couverture` (0-1) = amplitude convergente / amplitude TOTALE des variations
 * de l'article, contradictoires ET neutres comprises. Le dénominateur est le
 * point clé : une variation neutre est une variation réelle que le catalogue
 * ne sait pas relier à ce code de message — c'est exactement le « résidu non
 * attribué » de la feuille de route, et il est rendu tel quel dans
 * `residuInexplique`.
 *
 * Normaliser sur les seules variations classées (convergent + contradictoire)
 * donnerait `couverture = 1` dès qu'aucune contradiction n'existe, quelle que
 * soit la part de la variation que le moteur n'explique pas — et le critère
 * d'acceptation « taux d'inexpliqué < 25 % » n'aurait aucun dénominateur.
 *
 * Amplitude d'une variation : `|quantité après − avant|` pour un changement de
 * quantité, la quantité concernée pour une ligne apparue/disparue, et la
 * quantité déplacée pour un glissement de date (aucune quantité ne change,
 * c'est la ligne entière qui bouge). Toutes les sources d'un même article sont
 * dans la même unité — la somme a un sens.
 *
 * L'explication porte enfin un `niveau` : `directe` / `probable` /
 * `correlation` / `non_explique`. Règle d'UI transverse : jamais le mot
 * « cause » sur une corrélation — les niveaux se lisent « corrélation
 * directe », « probable », « corrélation », « non expliqué ».
 *
 * ## Ce que le moteur refuse d'expliquer
 *
 * `of_suggestion` et `appro_suggestion` sont ÉCARTÉES, alors qu'elles pèsent
 * 17 295 des 36 638 lignes d'une photo (06/08/2026). Ce ne sont pas des
 * entrées du CBN : ce sont ses SORTIES, recréées à chaque run au même titre que
 * les messages qu'on cherche à expliquer. Les corréler reviendrait à expliquer
 * un symptôme par un autre symptôme du même calcul — une tautologie qui
 * s'afficherait pourtant comme une explication.
 *
 * Elles portaient un poids et une ligne de docstring qui promettaient un
 * traitement qu'`isConvergent` n'a jamais fait. Poids retiré : mieux vaut ne
 * rien promettre que promettre ce qu'on ne rend pas.
 */

/** Une corrélation driver → message. Jamais nommée "cause". */
export interface CbnCorrelation {
  source: string
  nature: string
  detail: string
  poids: number
  /**
   * Amplitude de la variation, en unités de l'article — la matière du scoring
   * (cf. docstring). Toujours ≥ 1 : une variation retenue par le diff a bougé.
   */
  amplitude: number
  /**
   * Part relative de l'explication (0-1) : amplitude de cette corrélation
   * rapportée à l'amplitude convergente totale. 0 sur une corrélation
   * contradictoire (elle n'explique pas, elle atténue).
   */
  part: number
  /** Confiance (0-1) de cette corrélation — cf. scoring dans la docstring. */
  confiance: number
}

/** Niveau de confiance d'une explication — jamais « cause » (règle d'UI). */
export type CbnNiveau = 'directe' | 'probable' | 'correlation' | 'non_explique'

export interface CbnExplanation {
  cle: string
  article: string
  fournisseur: string | null
  /** Code du message après (ou avant si disparu). */
  mrpmes: number | null
  natureMessage: string
  /** Vide = non expliqué. */
  correlations: CbnCorrelation[]
  /** Contradictoires (atténuent le message), informatifs seulement. */
  contradictions: CbnCorrelation[]
  /** Niveau de confiance de l'explication. */
  niveau: CbnNiveau
  /**
   * Couverture (0-1) : amplitude convergente / amplitude TOTALE des variations
   * de l'article (contradictoires et neutres comprises). 0 = non expliqué.
   */
  couverture: number
  /**
   * Résidu inexpliqué (0-1) : part de la variation de l'article que le
   * catalogue ne relie pas à ce code de message. C'est le `causesInexpliquees`
   * de la feuille de route — la métrique « taux d'inexpliqué » se lit ici.
   */
  residuInexplique: number
  /** Phrase de synthèse pour l'UI. */
  synthese: string
}

/** Sorties du CBN, jamais des causes — cf. docstring du module. */
const poidsSource: Record<string, number> = {
  stock: 3,
  demande_ferme: 3,
  appro: 3,
  of_ferme: 2,
  of_planifie: 2,
  demande_prevision: 2,
}

const poidsDe = (source: string): number => poidsSource[source] ?? 1

/** Confiance de base par poids de source (3 → 0,85, 2 → 0,70, 1 → 0,55). */
const CONF_BASE: Record<number, number> = { 3: 0.85, 2: 0.7, 1: 0.55 }
/** Plusieurs facteurs convergents renforcent la confiance (corroboration). */
const BONUS_CORROBORATION = 0.1
/** Un signal contradictoire baisse la confiance (atténue le message). */
const MALUS_CONTRADICTION = 0.15
const CONF_MIN = 0.1
const CONF_MAX = 0.95

const clampConfiance = (v: number): number =>
  Math.min(CONF_MAX, Math.max(CONF_MIN, Math.round(v * 100) / 100))

const confiance = (poids: number, nbConvergents: number, nbContradictions: number): number =>
  clampConfiance(
    (CONF_BASE[poids] ?? 0.55) +
      (nbConvergents >= 2 ? BONUS_CORROBORATION : 0) -
      (nbContradictions > 0 ? MALUS_CONTRADICTION : 0)
  )

/**
 * Seuils de niveau, exprimés sur la couverture réelle (amplitude convergente /
 * amplitude totale). Plus bas que des seuils « part des variations classées » :
 * un article dont la moitié de la variation est neutre peut porter une
 * corrélation parfaitement lisible. À calibrer en atelier sur données réelles.
 */
const COUVERTURE_DIRECTE = 0.6
const COUVERTURE_PROBABLE = 0.35
/** Une confiance de source de poids 3 (0,85) est requise pour « directe ». */
const CONFIANCE_DIRECTE = 0.8

/**
 * Amplitude d'une variation, en unités de l'article.
 *
 * `|| 1` en repli : une ligne apparue à quantité nulle, ou un glissement de
 * date sans quantité des deux côtés, donnerait 0 — et une explication entière
 * à amplitude 0 rendrait une couverture nulle alors que des corrélations
 * existent. Le repli les compte pour une unité chacune : elles pèsent peu,
 * jamais rien.
 */
const amplitudeDe = (d: DriverDiffEntry): number => {
  const avant = d.quantiteAvant
  const apres = d.quantiteApres
  if (d.nature === 'quantite') return Math.abs((apres ?? 0) - (avant ?? 0)) || 1
  if (d.nature === 'apparue') return Math.abs(apres ?? 0) || 1
  if (d.nature === 'disparue') return Math.abs(avant ?? 0) || 1
  // `date` : aucune quantité ne change, c'est la ligne entière qui se déplace.
  return Math.abs(apres ?? avant ?? 0) || 1
}

const arrondi2 = (v: number): number => Math.round(v * 100) / 100

function isConvergent(
  code: number | null,
  d: DriverDiffEntry
): 'convergent' | 'contradictoire' | 'neutre' {
  if (code === null) return 'neutre'

  // Avancer (2) : besoin ↑ ou ressource ↓
  if (code === 2) {
    if (d.source === 'stock' && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'apparue'
    )
      return 'convergent'
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'disparue'
    )
      return 'contradictoire'
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'quantite'
    ) {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    if ((d.source === 'demande_ferme' || d.source === 'demande_prevision') && d.nature === 'date') {
      // Avancée = besoin plus tôt
      const ecart =
        d.echeanceAvant && d.echeanceApres
          ? Math.round(
              (Date.parse(`${d.echeanceApres}T00:00:00Z`) -
                Date.parse(`${d.echeanceAvant}T00:00:00Z`)) /
                86_400_000
            )
          : 0
      if (ecart < 0) return 'convergent'
      if (ecart > 0) return 'contradictoire'
    }
    if (d.source === 'appro') {
      // Réception retardée (date +) ou réduite/disparue → convergent pour avancer.
      // Une réception NOUVELLE plaide au contraire contre l'avancement : le
      // miroir le traitait déjà côté « retarder », il manquait ici.
      if (d.nature === 'apparue') return 'contradictoire'
      if (d.nature === 'disparue') return 'convergent'
      if (d.nature === 'date') {
        const ecart =
          d.echeanceAvant && d.echeanceApres
            ? Math.round(
                (Date.parse(`${d.echeanceApres}T00:00:00Z`) -
                  Date.parse(`${d.echeanceAvant}T00:00:00Z`)) /
                  86_400_000
              )
            : 0
        if (ecart > 0) return 'convergent'
        if (ecart < 0) return 'contradictoire'
      }
      if (d.nature === 'quantite' && (d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0))
        return 'convergent'
      if (d.nature === 'quantite' && (d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0))
        return 'contradictoire'
    }
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'apparue')
      return 'convergent'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'disparue')
      return 'contradictoire'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    return 'neutre'
  }

  // Retarder (3) : miroir exact
  if (code === 3) {
    if (d.source === 'stock' && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'apparue'
    )
      return 'contradictoire'
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'disparue'
    )
      return 'convergent'
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'quantite'
    ) {
      if ((d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    if ((d.source === 'demande_ferme' || d.source === 'demande_prevision') && d.nature === 'date') {
      const ecart =
        d.echeanceAvant && d.echeanceApres
          ? Math.round(
              (Date.parse(`${d.echeanceApres}T00:00:00Z`) -
                Date.parse(`${d.echeanceAvant}T00:00:00Z`)) /
                86_400_000
            )
          : 0
      if (ecart > 0) return 'convergent'
      if (ecart < 0) return 'contradictoire'
    }
    if (d.source === 'appro' && d.nature === 'disparue') return 'contradictoire'
    if (d.source === 'appro' && d.nature === 'apparue') return 'convergent'
    if (d.source === 'appro' && d.nature === 'date') {
      const ecart =
        d.echeanceAvant && d.echeanceApres
          ? Math.round(
              (Date.parse(`${d.echeanceApres}T00:00:00Z`) -
                Date.parse(`${d.echeanceAvant}T00:00:00Z`)) /
                86_400_000
            )
          : 0
      if (ecart < 0) return 'convergent'
      if (ecart > 0) return 'contradictoire'
    }
    if (d.source === 'appro' && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      if ((d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)) return 'contradictoire'
    }
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'apparue')
      return 'contradictoire'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'disparue')
      return 'convergent'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    return 'neutre'
  }

  // Inutile (6) : disparition de besoin ou stock suffisant
  if (code === 6) {
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'disparue'
    )
      return 'convergent'
    if (
      (d.source === 'demande_ferme' || d.source === 'demande_prevision') &&
      d.nature === 'apparue'
    )
      return 'contradictoire'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'disparue')
      return 'convergent'
    if ((d.source === 'of_ferme' || d.source === 'of_planifie') && d.nature === 'apparue')
      return 'contradictoire'
    // Une baisse de besoin sans disparition compte aussi : « inutile » ne suit
    // pas que les annulations franches (74 messages/jour, dont une part vient
    // d'une demande simplement réduite).
    if (
      (d.source === 'demande_ferme' ||
        d.source === 'demande_prevision' ||
        d.source === 'of_ferme' ||
        d.source === 'of_planifie') &&
      d.nature === 'quantite'
    ) {
      if ((d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    // Une ressource qui arrive rend la commande superflue ; une qui s'évapore
    // plaide contre. `appro` était absent de cette branche.
    if (d.source === 'appro' && d.nature === 'apparue') return 'convergent'
    if (d.source === 'appro' && d.nature === 'disparue') return 'contradictoire'
    if (d.source === 'appro' && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    if (d.source === 'stock' && d.nature === 'quantite') {
      if ((d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)) return 'convergent'
      return 'contradictoire'
    }
    return 'neutre'
  }

  return 'neutre'
}

/**
 * Explique chaque message à partir des drivers du même article.
 * `drivers` : liste plate (filtrée par article à l'intérieur).
 * Rend une explication par message, triée par poids décroissant.
 */
export function explainCbnMessages(
  messages: CbnMessageDiffEntry[],
  drivers: DriverDiffEntry[]
): CbnExplanation[] {
  const parArticle = new Map<string, DriverDiffEntry[]>()
  for (const d of drivers) {
    const list = parArticle.get(d.article)
    if (list === undefined) parArticle.set(d.article, [d])
    else list.push(d)
  }

  return messages.map((m) => {
    const code = m.mrpmesApres ?? m.mrpmesAvant
    const forArticle = parArticle.get(m.article) ?? []

    // Ce qu'on explique, c'est le CHANGEMENT du message, pas le message.
    //
    // `isConvergent` raisonne « qu'est-ce qui pousse dans le sens de ce code »,
    // ce qui est juste pour un message qui APPARAÎT ou s'INTENSIFIE. Pour un
    // message qui s'atténue ou disparaît, la question est l'inverse : ce qui
    // l'explique, c'est ce qui pousse CONTRE lui.
    //
    // Sans cette inversion, un « avancer » passé de −15 j à −7 j pendant que le
    // stock remontait de 740 à 1 200 rendait « non expliqué », et rangeait la
    // vraie explication sous le repli « contradictoire ». Deux natures sur cinq
    // étaient concernées.
    //
    // `modifiee` n'est pas inversée : le code a changé, et `code` vaut déjà le
    // NOUVEAU — juger dans son sens est correct.
    const inverse = m.nature === 'attenuee' || m.nature === 'disparue'

    const convergent: CbnCorrelation[] = []
    const contradictoire: CbnCorrelation[] = []
    // Amplitude des variations NEUTRES : elles ont bougé sur l'article sans que
    // le catalogue sache les relier à ce code de message. Elles ne sont ni
    // affichées ni scorées, mais elles restent au dénominateur de la couverture
    // — c'est tout l'objet du résidu inexpliqué.
    let amplitudeNeutre = 0

    for (const d of forArticle) {
      const brut = isConvergent(code, d)
      const cls =
        !inverse || brut === 'neutre'
          ? brut
          : brut === 'convergent'
            ? 'contradictoire'
            : 'convergent'
      const amplitude = amplitudeDe(d)
      if (cls === 'neutre') {
        amplitudeNeutre += amplitude
        continue
      }
      const cor: CbnCorrelation = {
        source: d.source,
        nature: d.nature,
        detail: d.detail,
        poids: poidsDe(d.source),
        amplitude,
        // Remplis après le tri : `part` normalise l'amplitude sur la liste
        // finale, `confiance` dépend du nombre de convergents/contradictions.
        part: 0,
        confiance: 0,
      }
      if (cls === 'convergent') convergent.push(cor)
      else contradictoire.push(cor)
    }

    const amplitudeConvergente = convergent.reduce((s, c) => s + c.amplitude, 0)
    const amplitudeContradictoire = contradictoire.reduce((s, c) => s + c.amplitude, 0)

    for (const c of convergent) {
      c.part = amplitudeConvergente > 0 ? arrondi2(c.amplitude / amplitudeConvergente) : 0
      c.confiance = confiance(c.poids, convergent.length, contradictoire.length)
    }
    // Les contradictoires gardent `part: 0` et `confiance: 0` : elles
    // n'expliquent pas, elles atténuent — l'UI ne les lit que comme
    // avertissements, et les inclure diluerait la part des vraies.

    // Tri par amplitude décroissante — ce que la feuille de route demande
    // (« classer par amplitude relative »). Le poids de source ne départage
    // plus que les ex æquo : deux variations de même ampleur, le stock passe
    // devant une prévision.
    const parAmpleur = (a: CbnCorrelation, b: CbnCorrelation): number =>
      b.amplitude - a.amplitude || b.poids - a.poids
    convergent.sort(parAmpleur)
    contradictoire.sort(parAmpleur)

    const amplitudeTotale = amplitudeConvergente + amplitudeContradictoire + amplitudeNeutre
    const couverture = amplitudeTotale > 0 ? arrondi2(amplitudeConvergente / amplitudeTotale) : 0
    const residuInexplique = amplitudeTotale > 0 ? arrondi2(amplitudeNeutre / amplitudeTotale) : 0

    const maxConfiance = convergent.length > 0 ? Math.max(...convergent.map((c) => c.confiance)) : 0
    const niveau: CbnNiveau =
      convergent.length === 0
        ? 'non_explique'
        : couverture >= COUVERTURE_DIRECTE && maxConfiance >= CONFIANCE_DIRECTE
          ? 'directe'
          : couverture >= COUVERTURE_PROBABLE
            ? 'probable'
            : 'correlation'

    const sources = convergent.map((c) => c.source).join(', ')
    const synthese =
      convergent.length === 0
        ? `Non expliqué — aucune variation convergente au-delà des seuils (±20 % quantité, ±7 j) sur ${m.article}.`
        : `Corrélation${convergent.length > 1 ? 's' : ''} ${sources} — couverture ${Math.round(couverture * 100)} %` +
          (contradictoire.length > 0
            ? `, ${contradictoire.length} contradiction${contradictoire.length > 1 ? 's' : ''}`
            : '') +
          (residuInexplique > 0
            ? `, ${Math.round(residuInexplique * 100)} % de variation inexpliquée`
            : '') +
          '.'

    return {
      cle: m.cle,
      article: m.article,
      fournisseur: m.fournisseur,
      mrpmes: code,
      natureMessage: m.nature,
      correlations: convergent,
      contradictions: contradictoire,
      niveau,
      couverture,
      residuInexplique,
      synthese,
    }
  })
}
