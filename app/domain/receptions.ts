/**
 * Domaine pur des réceptions fournisseurs (feature « Réceptions »).
 *
 * Calcul du nombre de palettes attendues à partir des quantités commandées (US) et
 * des coefficients de conditionnement article (ITMMASTER). Sans logique ESH/VB dans
 * un premier temps (simplification volontaire — cf. expedition_repository pour la
 * variante complète avec facteur de surface).
 *
 * AUCUN accès X3 ici : ce module ne fait que transformer des données déjà chargées
 * (testable isolément, cf. tests/domain/receptions.test.ts).
 */

/** Ligne de réception attendue enrichie, prête pour le calcul palette. */
export interface ReceptionInput {
  /** N° commande achat (PORDERQ.POHNUM). */
  noCommande: string
  /** Article (ITMREF). */
  article: string
  /** Désignation article. */
  designation: string | null
  /** Fournisseur (BPSNUM). */
  fournisseur: string
  /** Nom fournisseur (BPSNAM). */
  fournisseurNom: string
  /** Qté restante à recevoir en unité de stock (US). */
  qteUs: number
  /** Date de réception prévue (PORDERQ.EXTRCPDAT). */
  datePrevue: Date | null
  /** Date confirmée par le fournisseur (PORDERQ.ZDATCOF), plus fiable si renseignée. */
  dateConfirmee: Date | null
  /** Nb d'US par UC (ITMMASTER.PCUSTUCOE_0) — affichage seul, hors calcul palette. */
  pcuStuCoe: number | null
  /**
   * Nb d'US par palette (ITMMASTER.PCUSTUCOE_1). ATTENTION : les coefficients
   * PCUSTUCOE_n de X3 convertissent CHACUN leur unité de conditionnement vers
   * l'unité de STOCK — ils ne se composent pas entre eux. PCUSTUCOE_1 est donc
   * directement une quantité d'US par palette, pas un nombre d'UC.
   */
  ucParPal: number | null
}

/** Ligne enrichie du nombre de palettes calculé + date retenue (ISO YYYY-MM-DD). */
export interface ReceptionRow extends ReceptionInput {
  /** Date retenue pour le planning = dateConfirmée si renseignée, sinon datePrévue. */
  date: string | null
  /** Nombre de palettes pleines calculé (arrondi supérieur). 0 si coef manquant. */
  nbPalettes: number
}

/** Charge agrégée par jour calendaire (vue Calendrier). */
export interface DayCharge {
  /** Jour ISO (YYYY-MM-DD). */
  day: string
  /** Nombre total de palettes attendues ce jour (somme des nbPalettes). */
  palettes: number
  /** Nombre de lignes de réception ce jour. */
  lignes: number
  /** Nombre de fournisseurs distincts ce jour. */
  fournisseurs: number
}

/**
 * Date de réception retenue pour le planning : la date confirmée par le fournisseur
 * (ZDATCOF) est privilégiée car plus fiable, à défaut la date prévue (EXTRCPDAT).
 * Retourne un ISO YYYY-MM-DD, ou null si aucune des deux n'est renseignée.
 *
 * Utilise les composantes LOCALES (cf. isoLocalDay) : toISOString().slice(0,10)
 * reculerait d'un jour entre minuit et 1-2h du matin en fuseau UTC+1/+2.
 */
export function pickReceptionDate(
  dateConfirmee: Date | null,
  datePrevue: Date | null
): string | null {
  const d = dateConfirmee ?? datePrevue
  if (!d) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/**
 * Nombre de palettes pleines attendues pour une quantité donnée.
 *
 * Calcul : `ceil(qteUs / usParPal)` où `usParPal` = ITMMASTER.PCUSTUCOE_1, exprimé
 * en unités de STOCK par palette (cf. commentaire de ReceptionInput.ucParPal : les
 * coefs PCUSTUCOE_n ne se composent PAS, chacun ramène son conditionnement à l'US).
 * Le coef PCUSTUCOE_0 (US par UC) n'intervient donc pas : l'enchaîner divisait la
 * quantité une seconde fois et sous-estimait la charge d'un facteur pcuStuCoe.
 *
 * Retourne 0 si le coef est absent ou non positif (impossible à calculer —
 * l'article sera visible dans le tableau mais n'alimentera pas la charge palette).
 *
 * On arrondit au supérieur : une palette partielle occupe physiquement une palette
 * au sol. (Variante ESH / familles VB non gérée ici — cf. expedition_repository.)
 */
export function calcPalettes(qteUs: number, usParPal: number | null): number {
  if (!Number.isFinite(qteUs) || qteUs <= 0) return 0
  if (!usParPal || usParPal <= 0) return 0
  return Math.ceil(qteUs / usParPal)
}

// ───────────────────────────────────────────────────────────────────────────
// Criticité — jointure avec le module ruptures (issue #82)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Tension d'une réception attendue.
 *  - `retard`   : elle arrive APRÈS l'expédition client → retard projeté, déjà acquis.
 *  - `a_risque` : elle arrive entre la date de besoin et l'expédition → les buffers
 *                 sont entamés mais le client peut encore être servi. C'est le
 *                 niveau qui se pilote : au-delà, il n'y a plus qu'à constater.
 *
 * Les verdicts `couvert` (arrivée confortable), `sous_ensemble` (couverture par un OF
 * fils, pas par un PO) et `sans_couverture` (aucune réception) ne produisent pas
 * d'entrée : le premier n'appelle aucune décision, les deux autres ne désignent
 * aucune réception.
 */
export type CriticiteNiveau = 'retard' | 'a_risque'

/** Un OF que la réception débloque, avec son engagement client. */
export interface CriticiteOf {
  numOf: string
  /** Article produit par l'OF (PF). */
  articleParent: string
  numCommande: string | null
  client: string | null
  /** Date d'expédition client (ISO), null si OF non rattaché. */
  dateExpedition: string | null
  /** Marge signée (j) entre l'arrivée de la réception et l'expédition. ≤ 0 = retard. */
  joursMarge: number
}

/** Criticité d'une ligne de réception (clé POHNUM + article). */
export interface ReceptionCriticiteEntry {
  /** N° commande achat (PORDERQ.POHNUM) — clé de jointure avec le board. */
  noCommande: string
  /** Article attendu — seconde moitié de la clé. */
  article: string
  niveau: CriticiteNiveau
  /** Pire marge parmi les OF débloqués (la plus contrainte gouverne). */
  joursMarge: number
  /** Réception attendue dans le passé et non reçue. */
  overdue: boolean
  /** OF débloqués, du plus contraint au moins contraint. */
  ofs: CriticiteOf[]
}

/** Forme minimale de ShortageRow consommée ici (évite le couplage au module complet). */
interface ShortageRowLike {
  component: string
  numOf: string
  articleParent: string
  numCommande: string | null
  client: string | null
  dateExpedition: string | null
  joursMarge: number
  overdue: boolean
  reception: { id: string } | null
  verdict: string
}

/** `retard` domine `a_risque` : une réception tendue pour un OF l'est pour la feuille. */
function pireNiveau(a: CriticiteNiveau, b: CriticiteNiveau): CriticiteNiveau {
  return a === 'retard' || b === 'retard' ? 'retard' : 'a_risque'
}

/**
 * Inverse l'index du module ruptures : de « cette rupture est-elle couverte ? » à
 * « cette réception couvre-t-elle quelque chose de tendu ? ».
 *
 * Le pipeline ruptures apparie déjà chaque manque à la commande d'achat qui le
 * couvre (`ShortageRow.reception.id` = POHNUM) ; il n'y a donc ni requête ni calcul
 * de faisabilité à refaire, seulement un regroupement par (commande, article).
 *
 * Une même réception apparaît autant de fois qu'elle débloque d'OF : les OF sont
 * dédupliqués par numéro, et c'est la marge la plus faible qui gouverne l'entrée.
 */
export function buildCriticiteIndex(rows: ShortageRowLike[]): ReceptionCriticiteEntry[] {
  const acc = new Map<string, ReceptionCriticiteEntry & { seen: Set<string> }>()

  for (const row of rows) {
    if (!row.reception) continue
    if (row.verdict !== 'retard' && row.verdict !== 'a_risque') continue
    const niveau = row.verdict as CriticiteNiveau

    const key = `${row.reception.id}|${row.component}`
    let entry = acc.get(key)
    if (!entry) {
      entry = {
        noCommande: row.reception.id,
        article: row.component,
        niveau,
        joursMarge: row.joursMarge,
        overdue: row.overdue,
        ofs: [],
        seen: new Set<string>(),
      }
      acc.set(key, entry)
    }
    entry.niveau = pireNiveau(entry.niveau, niveau)
    entry.joursMarge = Math.min(entry.joursMarge, row.joursMarge)
    entry.overdue = entry.overdue || row.overdue

    if (!entry.seen.has(row.numOf)) {
      entry.seen.add(row.numOf)
      entry.ofs.push({
        numOf: row.numOf,
        articleParent: row.articleParent,
        numCommande: row.numCommande,
        client: row.client,
        dateExpedition: row.dateExpedition,
        joursMarge: row.joursMarge,
      })
    }
  }

  return [...acc.values()]
    .map(({ seen: _seen, ...entry }) => ({
      ...entry,
      ofs: entry.ofs.sort((x, y) => x.joursMarge - y.joursMarge),
    }))
    .sort(
      (x, y) =>
        Number(y.niveau === 'retard') - Number(x.niveau === 'retard') ||
        x.joursMarge - y.joursMarge
    )
}

/** Enrichit une ligne brute avec la date retenue et le nombre de palettes. */
export function buildReceptionRow(input: ReceptionInput): ReceptionRow {
  return {
    ...input,
    date: pickReceptionDate(input.dateConfirmee, input.datePrevue),
    nbPalettes: calcPalettes(input.qteUs, input.ucParPal),
  }
}

/**
 * Agrège les lignes par jour calendaire pour la vue Calendrier/Charge.
 *
 * Les lignes sans date retenue sont ignorées (pas rattachables à un jour). Les jours
 * sans réception n'apparaissent pas (pas de remplissage des trous — la charge est
 * représentée par les jours réellement chargés, l'absence = quai disponible).
 */
export function groupReceptionsByDay(rows: ReceptionRow[]): DayCharge[] {
  const byDay = new Map<string, { palettes: number; lignes: number; fournisseurs: Set<string> }>()
  for (const r of rows) {
    if (!r.date) continue
    const slot = byDay.get(r.date) ?? { palettes: 0, lignes: 0, fournisseurs: new Set<string>() }
    slot.palettes += r.nbPalettes
    slot.lignes += 1
    slot.fournisseurs.add(r.fournisseur)
    byDay.set(r.date, slot)
  }
  return [...byDay.entries()]
    .map(([day, s]) => ({
      day,
      palettes: s.palettes,
      lignes: s.lignes,
      fournisseurs: s.fournisseurs.size,
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
}
