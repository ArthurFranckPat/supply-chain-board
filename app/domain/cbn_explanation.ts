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
 *  1 = of_suggestion/appro_suggestion, apparitions isolées
 */

/** Une corrélation driver → message. Jamais nommée "cause". */
export interface CbnCorrelation {
  source: string
  nature: string
  detail: string
  poids: number
}

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
}

const poidsSource: Record<string, number> = {
  stock: 3,
  demande_ferme: 3,
  appro: 3,
  of_ferme: 2,
  of_planifie: 2,
  demande_prevision: 2,
  of_suggestion: 1,
  appro_suggestion: 1,
}

const fmtPoids = (s: string): number => poidsSource[s] ?? 1

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
    if (
      d.source === 'appro' &&
      (d.nature === 'disparue' || d.nature === 'date' || d.nature === 'quantite')
    ) {
      // Réception retardée (date +) ou réduite/disparue → convergent pour avancer
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
    if (
      d.source === 'stock' &&
      d.nature === 'quantite' &&
      (d.quantiteApres ?? 0) > (d.quantiteAvant ?? 0)
    )
      return 'convergent'
    if (
      d.source === 'stock' &&
      d.nature === 'quantite' &&
      (d.quantiteApres ?? 0) < (d.quantiteAvant ?? 0)
    )
      return 'contradictoire'
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

    const convergent: CbnCorrelation[] = []
    const contradictoire: CbnCorrelation[] = []

    for (const d of forArticle) {
      const cls = isConvergent(code, d)
      if (cls === 'neutre') continue
      const cor: CbnCorrelation = {
        source: d.source,
        nature: d.nature,
        detail: d.detail,
        poids: fmtPoids(d.source),
      }
      if (cls === 'convergent') convergent.push(cor)
      else contradictoire.push(cor)
    }

    convergent.sort((a, b) => b.poids - a.poids)
    contradictoire.sort((a, b) => b.poids - a.poids)

    return {
      cle: m.cle,
      article: m.article,
      fournisseur: m.fournisseur,
      mrpmes: code,
      natureMessage: m.nature,
      correlations: convergent,
      contradictions: contradictoire,
    }
  })
}
