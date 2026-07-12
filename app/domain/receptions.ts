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
  /** Nb d'US par UC (ITMMASTER.PCUSTUCOE_0). */
  pcuStuCoe: number | null
  /** Nb d'UC par palette (ITMMASTER.PCUSTUCOE_1). */
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
 * Calcul : `ceil(qteUs / pcuStuCoe / ucParPal)` où
 *  - `pcuStuCoe` = nb d'US par UC (ITMMASTER.PCUSTUCOE_0),
 *  - `ucParPal`  = nb d'UC par palette (ITMMASTER.PCUSTUCOE_1).
 *
 * Retourne 0 si l'un des coefs est absent ou non positif (impossible à calculer —
 * l'article sera visible dans le tableau mais n'alimentera pas la charge palette).
 *
 * On arrondit au supérieur : une palette partielle occupe physiquement une palette
 * au sol. (Variante ESH / familles VB non gérée ici — cf. expedition_repository.)
 */
export function calcPalettes(
  qteUs: number,
  pcuStuCoe: number | null,
  ucParPal: number | null
): number {
  if (!Number.isFinite(qteUs) || qteUs <= 0) return 0
  if (!pcuStuCoe || pcuStuCoe <= 0) return 0
  if (!ucParPal || ucParPal <= 0) return 0
  const uc = qteUs / pcuStuCoe
  const pal = uc / ucParPal
  return Math.ceil(pal)
}

/** Enrichit une ligne brute avec la date retenue et le nombre de palettes. */
export function buildReceptionRow(input: ReceptionInput): ReceptionRow {
  return {
    ...input,
    date: pickReceptionDate(input.dateConfirmee, input.datePrevue),
    nbPalettes: calcPalettes(input.qteUs, input.pcuStuCoe, input.ucParPal),
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
