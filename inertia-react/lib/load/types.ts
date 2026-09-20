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
  /** Charge NETTE (besoin − stock strict/CQ), parallèle à monthly/weekly. */
  monthlyNet: LoadPeriod[]
  weeklyNet: LoadPeriod[]
  /** RESTE À PRODUIRE (net − en-cours de fabrication non déclaré) — cran par défaut. */
  monthlyReste: LoadPeriod[]
  weeklyReste: LoadPeriod[]
  /**
   * Charge en PIÈCES (quantités opérées), mêmes crans et mailles que les séries
   * d'heures. Émises par le serveur, jamais dérivées des heures : l'efficience
   * poste pondère le temps et non la quantité, donc une multiplication par la
   * cadence ne retomberait pas juste.
   *
   * Pas d'équivalent pièces pour la capacité : un temps de poste n'est pas une
   * quantité. La bascule Heures/Pièces masque donc le plafond et la courbe de
   * capacité au lieu de les convertir.
   */
  monthlyQty: LoadPeriod[]
  weeklyQty: LoadPeriod[]
  monthlyNetQty: LoadPeriod[]
  weeklyNetQty: LoadPeriod[]
  monthlyResteQty: LoadPeriod[]
  weeklyResteQty: LoadPeriod[]
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

/** Date utilisée pour positionner la charge d'un OF. */
export type OfDateMode = 'start' | 'end'

/**
 * Cran de la bascule de quantité (vue commande) :
 *  - `brut`  : besoin explosé depuis les commandes ;
 *  - `net`   : brut − stock disponible (strict + CQ) ;
 *  - `reste` : net − en-cours de fabrication déjà produit non déclaré. Défaut,
 *              parce que c'est le seul des trois qui répond à « qu'est-ce qu'il
 *              reste à faire ? ».
 */
export type LoadQtyMode = 'brut' | 'net' | 'reste'

/**
 * Unité d'affichage de la charge :
 *  - `h` : heures de poste (historique) — `Σ qté / cadence`, l'unité de la capacité ;
 *  - `u` : pièces opérées — ce qui traverse la gamme, la lecture « combien de
 *          pièces sur ce poste » du responsable d'atelier.
 *
 * La capacité et la saturation restent en heures dans les deux cas : un temps de
 * poste ne se convertit pas en pièces sans cadence, et la comparer à un nombre de
 * pièces serait une fausse équation.
 */
export type LoadUnit = 'h' | 'u'

export interface LoadPageProps {
  /** Libellé d'en-tête : « Juillet → Décembre 2026 · 6 mois ». */
  rangeLabel: string
  /** Ancre d'horizon résolue (ISO, 1er du mois de départ) — renvoyée telle
   *  quelle à l'endpoint de détail pour viser la même fenêtre. */
  startIso: string
  /** Positionnement des OF : date de début (défaut) ou date de fin. */
  ofDate: OfDateMode
  /** Version du snapshot charge : renvoyée à l'endpoint de détail (`?v=`) pour
   *  que la table soit calculée des mêmes entrées X3 que la barre cliquée —
   *  sinon un cache périmé faisait afficher 14 h à la barre et 9,9 h à la
   *  table pour la même semaine. */
  version: string
  /** Libellés mensuels courts (« Juil », « Août »…). */
  months: string[]
  /** Libellés hebdo (« S27 », « S28 »…). */
  weeks: string[]
  /** Clés de bucket mensuel (« 2026-7 »), alignées sur `months` — non affichées :
   *  renvoyées telles quelles à l'endpoint de détail d'une période. */
  monthKeys: string[]
  /** Clés de bucket hebdo (ISO du lundi), alignées sur `weeks`. */
  weekKeys: string[]
  /** Charge OF, segments Ferme(f) / Planifié(p) / Suggéré(s). */
  ofLines: LoadLine[]
  /** Charge demande, segments Commande(f) / Prévision(s) — `p` toujours 0. */
  cmdLines: LoadLine[]
  /** Même demande sans appliquer FOH/FOHUOT, pour le filtre utilisateur. */
  cmdLinesWithoutDemandHorizon: LoadLine[]
  /** Ateliers présents (postes avec charge), pour le filtre transverse. */
  ateliers: AtelierOption[]
  /**
   * Troncature du plafond de profondeur (4) sur la vue commande : nombre de
   * besoins fabriqués coupés et parents concernés (D9). Absent = rien de coupé.
   */
  depthCut?: { truncated: number; parents: string[] }
  /**
   * Proposition de schéma horaire par poste (lot 1). Calculée sur le RESTE À
   * PRODUIRE, jamais sur le cran de lecture courant : une décision
   * d'organisation ne suit pas une bascule d'affichage.
   */
  shiftPlan: ShiftPlanPayload
  x3Error: string | null
}

/* ── Plan de schéma horaire (lot 1) ───────────────────────────────────────── */

/** Schéma horaire planifiable, servi une fois : les plans ne portent que des codes. */
export interface ShiftScheduleOption {
  code: string
  label: string
  /** Équipes à staffer en simultané. */
  crews: number
  /** Jours de production par semaine. */
  openDays: number
  /** Semaine pleine — le schéma que l'usine vise. */
  target: boolean
}

/**
 * État d'une semaine, lu sur le CUMUL de son palier et non sur elle seule : une
 * semaine creuse dans un palier qui tient n'est pas un problème, c'est le
 * lissage qui fonctionne.
 */
export type ShiftWeekState = 'tenu' | 'sous_charge' | 'retard'

export interface ShiftWeek {
  index: number
  load: number
  capacity: number
  /** Équipes-jour staffées — l'unité qui s'additionne à l'échelle de l'atelier. */
  crewDays: number
  state: ShiftWeekState
}

export interface ShiftPlateau {
  /** Index de première et dernière semaine (inclus) dans `shiftPlan.weekKeys`. */
  from: number
  to: number
  schedule: ShiftScheduleOption
  /** Palier imposé par le préavis : constaté, pas décidé. */
  frozen: boolean
  /** Heures que le palier ne tient pas — 0 = soutenable. */
  debtHours: number
  /** Heures de capacité ouvertes pour rien. */
  idleHours: number
  /** Charge (h) à produire sur le palier. */
  loadHours: number
  /** Capacité (h) ouverte par le schéma retenu. */
  capacityHours: number
  /** Capacité (h) qu'on aurait en ne changeant rien — `null` sur le 1er palier. */
  keepHours: number | null
}

export interface ShiftPlanLine {
  code: string
  /** Code du schéma X3 courant, `null` si hors catalogue. */
  current: string | null
  plan: {
    plateaus: ShiftPlateau[]
    weeks: ShiftWeek[]
    switches: number
    cost: number
  }
}

/** Pourquoi un poste n'a pas de plan — l'absence d'une ligne doit se lire. */
export type ShiftPlanSkip = 'hors_catalogue' | 'sans_charge'

export interface ShiftPlanPayload {
  /** ISO des lundis couverts — plus court que l'horizon du graphe (12 semaines). */
  weekKeys: string[]
  catalog: ShiftScheduleOption[]
  of: ShiftPlanLine[]
  commande: ShiftPlanLine[]
  skipped: { code: string; reason: ShiftPlanSkip }[]
}
