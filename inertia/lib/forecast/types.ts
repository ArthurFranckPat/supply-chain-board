/**
 * Contrat de la page « Projection de charge » (vision long terme, variante 3
 * « Charge par ligne »). Émis par ForecastController.index, consommé par
 * inertia/pages/scheduler/forecast.tsx.
 *
 * Charge en heures absolues, ventilée Ferme/Planifié/Suggéré (statut OF 1/2/3),
 * par poste de charge (workstation gamme), sur un horizon de N mois. Deux mailles :
 * mensuelle (`monthly`) et hebdomadaire (`weekly`), alignées sur `months` / `weeks`.
 */

/** Triplet de charge (heures) d'une période : ferme / planifié / suggéré. */
export interface ForecastPeriod {
  f: number
  p: number
  s: number
}

/** Série de charge d'un poste de charge sur l'horizon. */
export interface ForecastLine {
  /** Code workstation (WST). */
  code: string
  /** Libellé du poste. */
  name: string
  /** Couleur de la pastille / mini-graphe. */
  color: string
  /** Articles produits sur le poste (« CODE désignation »), pour la recherche client. */
  articles: string[]
  /** Charge par mois (longueur = `months`). */
  monthly: ForecastPeriod[]
  /** Charge par semaine ISO (longueur = `weeks`). */
  weekly: ForecastPeriod[]
}

/** Vue de charge : OF (ordres) ou Commande (demande). */
export type ForecastView = 'of' | 'commande'

export interface ForecastPageProps {
  /** Libellé d'en-tête : « Juillet → Décembre 2026 · 6 mois ». */
  rangeLabel: string
  /** Libellés mensuels courts (« Juil », « Août »…). */
  months: string[]
  /** Libellés hebdo (« S27 », « S28 »…). */
  weeks: string[]
  /** Charge OF, segments Ferme(f) / Planifié(p) / Suggéré(s). */
  ofLines: ForecastLine[]
  /** Charge demande, segments Commande(f) / Prévision(s) — `p` toujours 0. */
  cmdLines: ForecastLine[]
  x3Error: string | null
}
