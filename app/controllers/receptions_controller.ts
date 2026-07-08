import { type HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import logger from '@adonisjs/core/services/logger'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import {
  buildReceptionRow,
  calcPalettes,
  groupReceptionsByDay,
  type ReceptionInput,
  type ReceptionRow,
} from '#app/domain/receptions'
import { isoLocalDay } from '#app/domain/shortages'
import boardDataset from '#services/board_dataset'
import type { EstimationResult, EstimationsPaire } from '#app/domain/conditionnement_estimator'

/**
 * Page « Réceptions fournisseurs » : planning des réceptions attendues + charge palettes
 * par jour pour anticiper la charge du service réception.
 *
 * Même motif que /expeditions et /ruptures : coquille Inertia instantanée, calcul lourd
 * (X3 + calcul palette + agrégation) chargé en différé via /api/v1/receptions/rows.
 *
 * Source : PORDERQ (réceptions attendues). Les réceptions effectives (STOJOU/PINVD) sont
 * hors scope — cette vue est une projection, pas un constat.
 */

/** Horizon par défaut (jours) quand aucune plage n'est passée : J → J+14. */
const DEFAULT_HORIZON_DAYS = 14

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
 *  - coefs complets     → « 10 US/UC · 5 UC/pal »
 *  - un seul coef       → « 10 US/UC · UC/pal ? » (rattache ce qui manque au rattrapage)
 *  - aucun coef         → « — » (marque la ligne coefManquant)
 *
 * `pcuStuCoe` = US par UC (PCUSTUCOE_0) ; `ucParPal` = UC par palette (PCUSTUCOE_1).
 * Les deux doivent être > 0 pour calculer un nombre de palettes.
 */
function fmtConditionnement(pcuStuCoe: number | null, ucParPal: number | null): string {
  const usUc = pcuStuCoe && pcuStuCoe > 0 ? fmtQty(pcuStuCoe) : null
  const ucPal = ucParPal && ucParPal > 0 ? fmtQty(ucParPal) : null
  if (usUc && ucPal) return `${usUc} US/UC · ${ucPal} UC/pal`
  if (usUc) return `${usUc} US/UC · UC/pal ?`
  if (ucPal) return `US/UC ? · ${ucPal} UC/pal`
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
   * Vrai si le calcul palette est impossible (un des coefs PCUSTUCOE manquant/nul)
   * ET qu'aucune estimation n'a pu être produite. La ligne est conservée mais
   * n'alimente pas la charge. Marquée visuellement (badge « Coef manquant »).
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
  /** Nb d'UC par palette (ITMMASTER.PCUSTUCOE_1). null si non renseigné. */
  ucParPal: number | null
  /** Conditionnement formaté « 10 US/UC · 5 UC/pal », ou '—' si incomplet. */
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

export interface ReceptionsRowsResponse {
  rows: ReceptionDisplayRow[]
  chargeByDay: DayChargeDisplay[]
  stats: {
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
  range: { from: string; to: string; horizonDays: number }
  x3Error: string | null
}

export default class ReceptionsController {
  /** GET /receptions — coquille Inertia (instantanée, aucun calcul X3). */
  async index(ctx: HttpContext) {
    const today = isoLocalDay()
    const from = (ctx.request.input('from') as string | undefined) || today
    const horizon = Number(ctx.request.input('horizon')) || DEFAULT_HORIZON_DAYS

    // Calcule `to` côté serveur pour le shell (cohérent avec l'endpoint rows).
    const toMs = Date.parse(`${from}T00:00:00Z`)
    const to =
      Number.isFinite(toMs) && horizon > 0
        ? new Date(toMs + horizon * 86_400_000).toISOString().slice(0, 10)
        : new Date(Date.now() + horizon * 86_400_000).toISOString().slice(0, 10)

    const params = new URLSearchParams({ from, to })
    const rowsHref = `/api/v1/receptions/rows?${params.toString()}`

    return ctx.inertia.render('receptions', {
      from,
      to,
      horizon,
      rowsHref,
      todayHref: `/receptions?from=${today}&horizon=${DEFAULT_HORIZON_DAYS}`,
      defaultHorizon: DEFAULT_HORIZON_DAYS,
    })
  }

  /** GET /api/v1/receptions/rows — planning réceptions (calcul lourd différé + cache SWR). */
  async rows(ctx: HttpContext) {
    const today = isoLocalDay()
    const from = (ctx.request.input('from') as string | undefined) || today
    const to = (ctx.request.input('to') as string | undefined) || from

    // Horizon dérivé (pour les KPI/affichage).
    const a = Date.parse(`${from}T00:00:00Z`)
    const b = Date.parse(`${to}T00:00:00Z`)
    const horizonDays =
      Number.isFinite(a) && Number.isFinite(b) && b >= a
        ? Math.round((b - a) / 86_400_000) + 1
        : DEFAULT_HORIZON_DAYS

    const force = ctx.request.input('refresh') === '1'

    // Cache du payload (calcul X3 + palette + agrégation) + SWR. Clé GLOBALE
    // (payload dérivé des données usine, identique pour tous les utilisateurs —
    // cf. ruptures issue #39). ?refresh=1 invalide la clé.
    const recepCache = () => cache.namespace('receptions')
    const cacheKey = `payload:${from}:${to}`
    if (force) await recepCache().delete({ key: cacheKey })

    // Catch AUTOUR du getOrSet, jamais dans la factory : une erreur X3 transiente
    // ne doit pas être mise en cache (sinon payload vide servi à tous pendant le TTL).
    // Factory qui throw → bentocache sert le stale s'il existe, sinon l'erreur remonte.
    let rows: ReceptionDisplayRow[] = []
    let chargeByDay: DayChargeDisplay[] = []
    let stats: ReceptionsRowsResponse['stats'] = {
      totalPalettes: 0,
      totalLignes: 0,
      totalFournisseurs: 0,
      picPalettes: 0,
      picJour: null,
      lignesEstimees: 0,
      lignesSansCoef: 0,
    }
    let x3Error: string | null = null

    try {
      const cached = await recepCache().getOrSet({
        key: cacheKey,
        ttl: 2 * 60 * 1000,
        // SWR : timeout 0 = vrai stale-while-revalidate. NE PAS mettre > 0 (cf. board_dataset,
        // suivi, ruptures) → refresh hors background → unhandled rejection → crash serveur.
        timeout: 0,
        factory: async () => this.computePayload(from, to),
      })
      rows = cached.rows
      chargeByDay = cached.chargeByDay
      stats = cached.stats
    } catch (e) {
      logger.error({ err: e }, '[receptions] rows — échec chargement X3')
      x3Error = 'Données X3 indisponibles — réceptions momentanément incalculables.'
    }

    const response: ReceptionsRowsResponse = {
      rows,
      chargeByDay,
      stats,
      range: { from, to, horizonDays },
      x3Error,
    }
    return response
  }

  /** Charge X3 + calcule palettes + agrégation (exécuté dans la factory du cache). */
  private async computePayload(
    from: string,
    to: string
  ): Promise<Omit<ReceptionsRowsResponse, 'range' | 'x3Error'>> {
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
        const coefManquant = !(
          input.pcuStuCoe &&
          input.pcuStuCoe > 0 &&
          input.ucParPal &&
          input.ucParPal > 0
        )
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
        // Coef estimé direct (US/palette) → calcPalettes avec pcuStuCoe=1 équivaut à
        // ceil(qteUs / usParPalette). On évite de muter le pcuStuCoe réel (affiché tel
        // quel dans la colonne Conditionnement, marqué « estimé » séparément).
        return {
          ...base,
          nbPalettes: calcPalettes(input.qteUs, 1, estimation.usParPalette),
        }
      }
      return base
    })

    // Lignes pré-formatées (date FR + relatif + palettes + conditionnement + estimation).
    const rows: ReceptionDisplayRow[] = receptionRows.map((r, i) => {
      const estimation = enriched[i]!.estimation
      const coefManquant = !(r.pcuStuCoe && r.pcuStuCoe > 0 && r.ucParPal && r.ucParPal > 0)
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

    const stats = {
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
}
