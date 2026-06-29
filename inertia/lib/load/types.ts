/**
 * Contrat de la page « Projection de charge » (vision long terme, variante 3
 * « Charge par ligne »). Émis par LoadController.index, consommé par
 * inertia/pages/scheduler/load.tsx.
 *
 * Charge en heures absolues, ventilée Ferme/Planifié/Suggéré (statut OF 1/2/3),
 * par poste de charge (workstation gamme), sur un horizon de N mois. Deux mailles :
 * mensuelle (`monthly`) et hebdomadaire (`weekly`), alignées sur `months` / `weeks`.
 */

/** Triplet de charge (heures) d'une période : ferme / planifié / suggéré. */
export interface LoadPeriod {
  f: number
  p: number
  s: number
  /** Charge induite (besoin brut depth-1) depuis des commandes fermes — vue commande. */
  fi: number
  /** Charge induite (besoin brut depth-1) depuis des prévisions — vue commande. */
  si: number
}

/** Capacité nette (heures) par bucket, alignée sur `monthly` / `weekly` (issue #35). */
export interface LoadCapacity {
  monthly: number[]
  weekly: number[]
}

/** Catégorie d'atelier dérivée de STOLOC (issue #36). */
export type AtelierCategory = 'montage' | 'fabrication'

/** Série de charge d'un poste de charge sur l'horizon. */
export interface LoadLine {
  /** Code workstation (WST). */
  code: string
  /** Libellé du poste. */
  name: string
  /** Couleur de la pastille / mini-graphe. */
  color: string
  /** Articles produits sur le poste (« CODE désignation »), pour la recherche client. */
  articles: string[]
  /** Charge par mois (longueur = `months`). */
  monthly: LoadPeriod[]
  /** Charge par semaine ISO (longueur = `weeks`). */
  weekly: LoadPeriod[]
  /** Charge NETTE (besoin − stock strict/CQ), parallèle à monthly/weekly — toggle brut/net. */
  monthlyNet: LoadPeriod[]
  weeklyNet: LoadPeriod[]
  /** Capacité nette (heures), mêmes mailles que `monthly` / `weekly`. */
  capacity: LoadCapacity
  /** Atelier (STOLOC) du poste. */
  atelier: string
  /** Libellé lisible de l'atelier. */
  atelierLabel: string
  /** Centre de charge (WCR). */
  workCenter: string
  /** Montage (commandes clients) ou fabrication (sous-ensembles). */
  category: AtelierCategory
}

/** Atelier présent dans la fenêtre, pour le filtre (issue #36). */
export interface AtelierOption {
  code: string
  label: string
  category: AtelierCategory
}

/** Vue de charge : OF (ordres) ou Commande (demande). */
export type LoadView = 'of' | 'commande'

export interface LoadPageProps {
  /** Libellé d'en-tête : « Juillet → Décembre 2026 · 6 mois ». */
  rangeLabel: string
  /** Libellés mensuels courts (« Juil », « Août »…). */
  months: string[]
  /** Libellés hebdo (« S27 », « S28 »…). */
  weeks: string[]
  /** Charge OF, segments Ferme(f) / Planifié(p) / Suggéré(s). */
  ofLines: LoadLine[]
  /** Charge demande, segments Commande(f) / Prévision(s) — `p` toujours 0. */
  cmdLines: LoadLine[]
  /** Ateliers présents (postes avec charge), pour le filtre transverse. */
  ateliers: AtelierOption[]
  x3Error: string | null
}
