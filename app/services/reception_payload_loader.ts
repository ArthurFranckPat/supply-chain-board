/**
 * Assemblage du payload « Réceptions fournisseurs » — planning des arrivées
 * attendues (PORDERQ), calcul palette et charge par jour, plus l'index de
 * criticité issu du pipeline ruptures.
 *
 * Extrait de `ReceptionsController.computePayload` : la page /receptions ET le
 * tool agent `listerReceptions` consomment ce module, donc un seul calcul fait
 * autorité. Toute divergence entre l'écran et le copilote serait un bug de
 * véracité, pas une différence de vue.
 *
 * Source : PORDERQ (réceptions ATTENDUES). Les réceptions effectives
 * (STOJOU/PINVD) sont hors scope — c'est une projection, pas un constat.
 */

import { cacheNs } from '#services/cache_ns'
import logger from '@adonisjs/core/services/logger'

import { X3ReceptionRepository } from '#repositories/reception_repository'
import {
  buildCriticiteIndex,
  buildReceptionRow,
  calcPalettes,
  groupReceptionsByDay,
  type ReceptionCriticiteEntry,
  type ReceptionInput,
  type ReceptionRow,
} from '#app/domain/receptions'
import { isoLocalDay } from '#app/domain/shortages'
import { loadShortageRowsData } from '#services/shortage_payload_loader'
import boardDataset from '#services/board_dataset'
import type { EstimationResult, EstimationsPaire } from '#app/domain/conditionnement_estimator'

/** Horizon par défaut (jours) quand aucune plage n'est passée : J → J+14. */
export const DEFAULT_HORIZON_DAYS = 14

/** Formatte une qté : entier si rond, sinon 2 décimales. */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Formatte une date ISO (YYYY-MM-DD) en JJ/MM/AA — '' si absente. */
function fmtFrShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

/**
 * Date ISO → relatif actionnable : « auj. », « demain », « +5j », « −3j ». Le planificateur
 * n'a pas à soustraire mentalement la date du jour. '' si absente.
 */
function fmtRelatif(iso: string | null | undefined): string {
  if (!iso) return ''
  const todayIso = isoLocalDay()
  const a = Date.parse(`${todayIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(b)) return ''
  const days = Math.round((b - a) / 86_400_000)
  if (days === 0) return 'auj.'
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  return days > 0 ? `+${days}j` : `${days}j`
}

/**
 * Conditionnement article formaté depuis les coefs ITMMASTER :
 *  - coefs complets     → « 10 US/UC · 500 US/pal »
 *  - un seul coef       → « 10 US/UC · US/pal ? » (rattache ce qui manque au rattrapage)
 *  - aucun coef         → « — » (marque la ligne coefManquant)
 *
 * `pcuStuCoe` = US par UC (PCUSTUCOE_0), informatif ; `usParPal` = US par palette
 * (PCUSTUCOE_1), seul coef nécessaire au calcul du nombre de palettes.
 */
function fmtConditionnement(pcuStuCoe: number | null, usParPal: number | null): string {
  const usUc = pcuStuCoe && pcuStuCoe > 0 ? fmtQty(pcuStuCoe) : null
  const usPal = usParPal && usParPal > 0 ? fmtQty(usParPal) : null
  if (usUc && usPal) return `${usUc} US/UC · ${usPal} US/pal`
  if (usUc) return `${usUc} US/UC · US/pal ?`
  if (usPal) return `US/UC ? · ${usPal} US/pal`
  return '—'
}

/** Ligne de réception pré-formatée pour le frontend (une seule source de vérité). */
export interface ReceptionDisplayRow {
  noCommande: string
  article: string
  designation: string
  fournisseur: string
  fournisseurNom: string
  qteUs: number
  qteUsFmt: string
  nbPalettes: number
  nbPalettesFmt: string
  /**
   * Vrai si le calcul palette est impossible (PCUSTUCOE_1 manquant/nul) ET qu'aucune
   * estimation n'a pu être produite. La ligne est conservée mais n'alimente pas la
   * charge. Marquée visuellement (badge « Coef manquant »).
   */
  coefManquant: boolean
  /**
   * Vrai si le coef a été estimé (STOCK ou STOJOU) faute de coef ITMMASTER. Le
   * nbPalettes est alors calculé depuis l'estimation — la ligne alimente la charge,
   * mais reste marquée pour transparence (badge « Estimé (STOCK/STOJOU) »).
   */
  coefEstime: boolean
  /** Source de l'estimation quand `coefEstime` = true. null sinon. */
  coefSource: 'STOCK' | 'STOJOU' | null
  /** Nb d'US par UC (ITMMASTER.PCUSTUCOE_0). null si non renseigné. */
  pcuStuCoe: number | null
  /** Nb d'US par palette (ITMMASTER.PCUSTUCOE_1). null si non renseigné. */
  ucParPal: number | null
  /** Conditionnement formaté « 10 US/UC · 500 US/pal », ou '—' si incomplet. */
  conditionnement: string
  /** Date retenue ISO (YYYY-MM-DD) — tri/grp. */
  date: string | null
  /** Date retenue JJ/MM/AA — affichage. */
  dateFmt: string
  /** Date retenue en relatif (+5j, auj.) — affichage compact. */
  dateRelatif: string
}

/** Charge d'un jour, pré-formatée pour le frontend. */
export interface DayChargeDisplay {
  day: string
  dayFmt: string
  dayRelatif: string
  palettes: number
  lignes: number
  fournisseurs: number
}

/** Criticité d'une réception (jointure ruptures) — cf. buildCriticiteIndex. */
export type ReceptionCriticite = ReceptionCriticiteEntry

export interface ReceptionsPayloadStats {
  totalPalettes: number
  totalLignes: number
  totalFournisseurs: number
  picPalettes: number
  picJour: string | null
  /** Nb de lignes dont le coef a pu être estimé (STOCK/STOJOU). */
  lignesEstimees: number
  /** Nb de lignes sans coef palette ni estimation (charge palette sous-estimée). */
  lignesSansCoef: number
}

export interface ReceptionsPayload {
  rows: ReceptionDisplayRow[]
  chargeByDay: DayChargeDisplay[]
  stats: ReceptionsPayloadStats
}

const EMPTY_STATS: ReceptionsPayloadStats = {
  totalPalettes: 0,
  totalLignes: 0,
  totalFournisseurs: 0,
  picPalettes: 0,
  picJour: null,
  lignesEstimees: 0,
  lignesSansCoef: 0,
}

/** Charge X3 + calcule palettes + agrégation (exécuté dans la factory du cache). */
async function computePayload(from: string, to: string): Promise<ReceptionsPayload> {
  const inputs = await new X3ReceptionRepository().getReceptionPlanning({ from, to })

  // Estimateur de US/palette (cache global 2h) pour les articles au coef manquant.
  // Récupéré une fois pour toute la fenêtre ; un échec X3 sur l'estimateur ne doit
  // pas faire planter la page → repli sur Map vide (lignes restent « coef manquant »).
  let estimator: Map<string, EstimationsPaire> = new Map()
  try {
    estimator = await boardDataset.getConditionnementEstimator()
  } catch (e) {
    logger.warn({ err: e }, '[receptions] estimateur indisponible — repli sans estimation')
  }

  // Enrichit les lignes au coef manquant avec une estimation US/palette, puis calcule
  // le nbPalettes via calcPalettes (cas réel) ou directement (cas estimé, coef direct).
  // Priorité STOCK > STOJOU depuis la paire pré-calculée par l'estimateur (la page
  // Conditionnements affiche les deux pour comparaison, ici on n'en garde qu'une).
  const enriched: { input: ReceptionInput; estimation: EstimationResult | null }[] = inputs.map(
    (input) => {
      // Seul PCUSTUCOE_1 (US/palette) conditionne le calcul : PCUSTUCOE_0 est
      // informatif (colisage) et son absence n'empêche pas de compter les palettes.
      const coefManquant = !(input.ucParPal && input.ucParPal > 0)
      const paire = coefManquant ? (estimator.get(input.article) ?? null) : null
      const estimation: EstimationResult | null = paire
        ? (paire.stock ?? paire.stojou ?? null)
        : null
      return { input, estimation }
    }
  )

  const receptionRows: ReceptionRow[] = enriched.map(({ input, estimation }) => {
    const base = buildReceptionRow(input)
    if (estimation && estimation.usParPalette > 0 && base.nbPalettes === 0) {
      // Coef estimé (US/palette) — même unité que PCUSTUCOE_1, il s'y substitue tel
      // quel. Le coef ITMMASTER reste affiché brut dans la colonne Conditionnement,
      // l'origine estimée étant marquée séparément.
      return {
        ...base,
        nbPalettes: calcPalettes(input.qteUs, estimation.usParPalette),
      }
    }
    return base
  })

  // Lignes pré-formatées (date FR + relatif + palettes + conditionnement + estimation).
  const rows: ReceptionDisplayRow[] = receptionRows.map((r, i) => {
    const estimation = enriched[i]!.estimation
    const coefManquant = !(r.ucParPal && r.ucParPal > 0)
    const coefEstime = !!estimation && r.nbPalettes > 0
    return {
      noCommande: r.noCommande,
      article: r.article,
      designation: r.designation ?? '',
      fournisseur: r.fournisseur,
      fournisseurNom: r.fournisseurNom,
      qteUs: r.qteUs,
      qteUsFmt: fmtQty(r.qteUs),
      nbPalettes: r.nbPalettes,
      nbPalettesFmt: r.nbPalettes > 0 ? fmtQty(r.nbPalettes) : '—',
      coefManquant: coefManquant && !coefEstime,
      coefEstime,
      coefSource: coefEstime ? estimation!.source : null,
      pcuStuCoe: r.pcuStuCoe,
      ucParPal: r.ucParPal,
      conditionnement: fmtConditionnement(r.pcuStuCoe, r.ucParPal),
      date: r.date,
      dateFmt: fmtFrShort(r.date),
      dateRelatif: fmtRelatif(r.date),
    }
  })

  // Tri par défaut : date asc (du plus proche au plus lointain), puis fournisseur.
  rows.sort(
    (x, y) =>
      (x.date ?? '9999').localeCompare(y.date ?? '9999') ||
      x.fournisseurNom.localeCompare(y.fournisseurNom)
  )

  // Charge agrégée par jour.
  const charge = groupReceptionsByDay(receptionRows)
  const chargeByDay: DayChargeDisplay[] = charge.map((c) => ({
    day: c.day,
    dayFmt: fmtFrShort(c.day),
    dayRelatif: fmtRelatif(c.day),
    palettes: c.palettes,
    lignes: c.lignes,
    fournisseurs: c.fournisseurs,
  }))

  // KPI période.
  const totalPalettes = charge.reduce((s, c) => s + c.palettes, 0)
  const pic = charge.reduce(
    (m, c) => (c.palettes > m.palettes ? c : m),
    charge[0] ?? { day: null, palettes: 0 }
  )
  const lignesSansCoef = rows.filter((r) => r.coefManquant).length
  const lignesEstimees = rows.filter((r) => r.coefEstime).length
  const fournisseurs = new Set(receptionRows.map((r) => r.fournisseur))

  const stats: ReceptionsPayloadStats = {
    totalPalettes,
    totalLignes: receptionRows.length,
    totalFournisseurs: fournisseurs.size,
    picPalettes: pic?.palettes ?? 0,
    picJour: pic?.day ?? null,
    lignesEstimees,
    lignesSansCoef,
  }

  return { rows, chargeByDay, stats }
}

/**
 * Payload réceptions sur une plage, avec cache SWR.
 *
 * Clé GLOBALE (payload dérivé des données usine, identique pour tous les
 * utilisateurs — cf. ruptures issue #39). `force` invalide la clé.
 *
 * L'erreur X3 remonte à l'appelant : le catch doit rester AUTOUR du getOrSet,
 * jamais dans la factory, sinon un incident transient est mis en cache et un
 * payload vide est servi à tous pendant le TTL.
 */
export async function loadReceptionPayload(opts: {
  from: string
  to: string
  force?: boolean
}): Promise<ReceptionsPayload> {
  const recepCache = cacheNs('receptions')
  const cacheKey = `payload:${opts.from}:${opts.to}`
  if (opts.force) await recepCache.delete({ key: cacheKey })

  return recepCache.getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    // SWR : timeout 0 = vrai stale-while-revalidate. NE PAS mettre > 0 (cf. board_dataset,
    // suivi, ruptures) → refresh hors background → unhandled rejection → crash serveur.
    timeout: 0,
    factory: async () => computePayload(opts.from, opts.to),
  })
}

/** Payload réceptions tolérant à la panne X3 (page + tool) — jamais de throw. */
export async function loadReceptionPayloadSafe(opts: {
  from: string
  to: string
  force?: boolean
}): Promise<ReceptionsPayload & { x3Error: string | null }> {
  try {
    const payload = await loadReceptionPayload(opts)
    return { ...payload, x3Error: null }
  } catch (e) {
    logger.error({ err: e }, '[receptions] rows — échec chargement X3')
    return {
      rows: [],
      chargeByDay: [],
      stats: EMPTY_STATS,
      x3Error: 'Données X3 indisponibles — réceptions momentanément incalculables.',
    }
  }
}

/**
 * Quelles réceptions attendues débloquent une rupture, et avec quelle marge
 * (issue #82).
 *
 * Aucune requête X3 propre : `loadShortageRowsData` apparie DÉJÀ les ruptures aux
 * commandes d'achat (`ShortageRow.reception.id` = POHNUM). On ne fait qu'inverser
 * son index — de « cette rupture est-elle couverte ? » à « cette réception
 * couvre-t-elle quelque chose de tendu ? ».
 *
 * Volontairement séparé du payload : le pipeline ruptures est lourd (~18 s à
 * froid) là où /receptions est tenu rapide. Les fusionner ferait payer ce coût
 * à chaque cache froid, et rendrait le planning indisponible quand le pipeline
 * ruptures tombe.
 */
export async function loadReceptionCriticite(opts: {
  from: string
  /** Horizon ruptures en jours (borné 1–90, limite du loader). */
  horizonDays: number
  force?: boolean
}): Promise<{ items: ReceptionCriticite[]; horizonDays: number; x3Error: string | null }> {
  const horizonDays = Math.min(Math.max(opts.horizonDays, 1), 90)
  try {
    const { rows } = await loadShortageRowsData({
      start: opts.from,
      days: horizonDays,
      force: opts.force,
    })
    return { items: buildCriticiteIndex(rows), horizonDays, x3Error: null }
  } catch (e) {
    logger.error({ err: e }, '[receptions] criticité — échec pipeline ruptures')
    return {
      items: [],
      horizonDays,
      x3Error: 'Criticité indisponible — pipeline ruptures injoignable.',
    }
  }
}

/** Nombre de jours inclusifs d'une plage ISO, `DEFAULT_HORIZON_DAYS` si invalide. */
export function spanDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return DEFAULT_HORIZON_DAYS
  return Math.round((b - a) / 86_400_000) + 1
}
