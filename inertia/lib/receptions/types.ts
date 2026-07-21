/**
 * Formes renvoyées par ReceptionsController.rows (GET /api/v1/receptions/rows).
 * Lignes DÉJÀ pré-formatées côté serveur (dates FR, quantités, palettes) — la page
 * Solid les rend telles quelles. Voir `computePayload` dans receptions_controller.ts.
 */

/** Ligne de réception attendue (1 ligne de commande achat non soldée). */
export interface ReceptionDisplayRow {
  /** N° commande achat (PORDERQ.POHNUM). */
  noCommande: string
  /** Article (ITMREF). */
  article: string
  /** Désignation article. */
  designation: string
  /** Fournisseur code (BPSNUM). */
  fournisseur: string
  /** Nom fournisseur (BPSNAM). */
  fournisseurNom: string
  /** Qté restante à recevoir (US, numérique). */
  qteUs: number
  /** Qté US pré-formatée (« 100 », « 12,5 »). */
  qteUsFmt: string
  /** Nombre de palettes calculé (0 si coef manquant). */
  nbPalettes: number
  /** Palettes pré-formatées (« 3 », « — » si coef manquant). */
  nbPalettesFmt: string
  /** Vrai si le coef PCUSTUCOE est manquant ET qu'aucune estimation n'a été trouvée. */
  coefManquant: boolean
  /** Vrai si le coef a été estimé (STOCK/STOJOU) — nbPalettes calculé depuis l'estimé. */
  coefEstime: boolean
  /** Source de l'estimation quand `coefEstime`. null sinon. */
  coefSource: 'STOCK' | 'STOJOU' | null
  /** Nb d'US par UC (ITMMASTER.PCUSTUCOE_0). null si non renseigné. */
  pcuStuCoe: number | null
  /** Nb d'UC par palette (ITMMASTER.PCUSTUCOE_1). null si non renseigné. */
  ucParPal: number | null
  /** Conditionnement formaté (« 10 US/UC · 5 UC/pal », ou '—'). */
  conditionnement: string
  /** Date retenue ISO (YYYY-MM-DD) — tri / regroupement. */
  date: string | null
  /** Date JJ/MM/AA — affichage. */
  dateFmt: string
  /** Date relative (« auj. », « +5j ») — affichage compact. */
  dateRelatif: string
}

/** Charge d'un jour (vue Calendrier). */
export interface DayChargeDisplay {
  /** Jour ISO (YYYY-MM-DD). */
  day: string
  /** Jour JJ/MM/AA. */
  dayFmt: string
  /** Jour relatif (« +5j »). */
  dayRelatif: string
  /** Nombre total de palettes ce jour. */
  palettes: number
  /** Nombre de lignes de réception ce jour. */
  lignes: number
  /** Nombre de fournisseurs distincts ce jour. */
  fournisseurs: number
}

export interface ReceptionsStats {
  totalPalettes: number
  totalLignes: number
  totalFournisseurs: number
  /** Pic de charge (palettes) sur la période. */
  picPalettes: number
  /** Jour du pic (ISO), null si vide. */
  picJour: string | null
  /** Nb de lignes dont le coef a pu être estimé (STOCK/STOJOU). */
  lignesEstimees: number
  /** Nb de lignes sans coef palette ni estimation (charge sous-estimée). */
  lignesSansCoef: number
}

export interface ReceptionsRowsResponse {
  rows: ReceptionDisplayRow[]
  chargeByDay: DayChargeDisplay[]
  stats: ReceptionsStats
  range: { from: string; to: string; horizonDays: number }
  x3Error: string | null
}

/**
 * Bascule de vue : tableau détail, calendrier de charge, ou board de planification
 * (grille temps × fournisseur — issue #82, React uniquement).
 */
export type ReceptionViewKind = 'tableau' | 'calendrier' | 'board'

// ───────────────────────────────────────────────────────────────────────────
// Criticité (GET /api/v1/receptions/criticite) — jointure avec le module ruptures.
// Miroir de app/domain/receptions.ts. Chargée SÉPARÉMENT de /rows : le pipeline
// ruptures est lourd, le board s'affiche sans l'attendre et reste utilisable si
// elle échoue.
// ───────────────────────────────────────────────────────────────────────────

/**
 * `retard` = la réception arrive après l'expédition client (retard projeté).
 * `a_risque` = elle arrive entre la date de besoin et l'expédition (buffers entamés,
 * client encore servi) — le seul niveau sur lequel un décalage se pilote encore.
 */
export type CriticiteNiveau = 'retard' | 'a_risque'

/** Un OF que la réception débloque, avec son engagement client. */
export interface CriticiteOf {
  numOf: string
  articleParent: string
  numCommande: string | null
  client: string | null
  dateExpedition: string | null
  /** Marge signée (j) entre l'arrivée et l'expédition. ≤ 0 = retard. */
  joursMarge: number
}

/** Criticité d'une ligne de réception. Clé de jointure : `noCommande` + `article`. */
export interface ReceptionCriticite {
  noCommande: string
  article: string
  niveau: CriticiteNiveau
  /** Pire marge parmi les OF débloqués. */
  joursMarge: number
  overdue: boolean
  ofs: CriticiteOf[]
}

export interface ReceptionsCriticiteResponse {
  items: ReceptionCriticite[]
  /** Fenêtre du calcul : les OF DÉMARRANT dans les N jours. Hors fenêtre = non évalué. */
  horizonDays: number
  x3Error: string | null
}
