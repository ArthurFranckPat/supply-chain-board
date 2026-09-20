import staticSync from '#services/static_sync_service'
import StaticArticle from '#models/static_article'
import {
  X3ProducedHoursRepository,
  type PosteTrackingDetail,
} from '#repositories/produced_hours_repository'

export interface WorkstationProducedCard {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number // 1: Machine, 2: MO, 3: ST
  operationHours: number
  setupHours: number
  totalHours: number
  allocatedOperationHours: number
  allocatedSetupHours: number
  totalAllocatedHours: number
  deltaHours: number
  efficiency: number
  quantity: number
  rejectQuantity: number
  rejectRate: number
  nbOfs: number
  nbTrackings: number
  weeklyCapacity: number
  timeline: {
    date: string
    hours: number
    allocated: number
    qty: number
    morningHours?: number
    afternoonHours?: number
  }[]
}

export interface ProducedHoursKPIs {
  totalHours: number
  totalOperationHours: number
  totalSetupHours: number
  totalAllocatedHours: number
  globalDeltaHours: number
  globalEfficiency: number
  totalQuantity: number
  totalRejects: number
  rejectRate: number
  activeWorkstationsCount: number
  totalWorkstationsCount: number
}

export interface ProducedHoursPayload {
  from: string
  to: string
  kpis: ProducedHoursKPIs
  workstations: WorkstationProducedCard[]
  ateliers: string[]
}

export interface EnrichedPosteTracking extends PosteTrackingDetail {
  designation: string
}

export interface WorkstationDetailResponse {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  from: string
  to: string
  kpis: {
    totalHours: number
    operationHours: number
    setupHours: number
    totalAllocatedHours: number
    deltaHours: number
    efficiency: number
    quantity: number
    rejectQuantity: number
    nbOfs: number
    nbTrackings: number
  }
  timeline: {
    date: string
    hours: number
    allocated: number
    qty: number
    morningHours: number
    afternoonHours: number
  }[]
  trackings: EnrichedPosteTracking[]
}

export const ALLOWED_ATELIERS = new Set(['S3P', 'S4P', 'S9P', 'CLP'])
export const PP_XXX_REGEX = /^PP_\d{3}$/

export class ProducedHoursLoader {
  private repo = new X3ProducedHoursRepository()

  /**
   * Charge le jeu de données complet des heures produites par poste pour la période [from, to].
   * Périmètre strict : ateliers S3P, S4P, S9P, CLP et postes PP_XXX.
   */
  async loadPayload(from: string, to: string): Promise<ProducedHoursPayload> {
    const [wstRefList, gammes, summaryRows, dailyPoints] = await Promise.all([
      staticSync.readWorkstations().catch(() => []),
      staticSync.readGammes().catch(() => []),
      this.repo.getSummary(from, to),
      this.repo.getDailyTimeline(from, to),
    ])

    // Dictionnaire des libellés de postes issus des gammes (ATEXTRA / WSTDESAXX en français)
    const wstLabels = new Map<string, string>()
    for (const g of gammes) {
      if (g.workstation && g.workstationLabel) {
        const k = g.workstation.trim().toUpperCase()
        if (!wstLabels.has(k)) {
          wstLabels.set(k, g.workstationLabel.trim())
        }
      }
    }

    // Postes de charge éligibles dans le référentiel statique
    const eligibleWstList = wstRefList.filter((w) => {
      const code = w.code?.trim().toUpperCase() || ''
      const stoloc = w.stockLocation?.trim().toUpperCase() || ''
      return PP_XXX_REGEX.test(code) && ALLOWED_ATELIERS.has(stoloc)
    })

    // Dictionnaire des postes de charge statiques
    const wstMap = new Map(wstRefList.map((w) => [w.code.trim().toUpperCase(), w]))

    // Grouper les points journaliers par poste
    const dailyByPoste = new Map<
      string,
      {
        date: string
        hours: number
        allocated: number
        qty: number
        morningHours?: number
        afternoonHours?: number
      }[]
    >()
    for (const dp of dailyPoints) {
      const pKey = dp.poste.trim().toUpperCase()
      if (!PP_XXX_REGEX.test(pKey)) continue
      if (!dailyByPoste.has(pKey)) {
        dailyByPoste.set(pKey, [])
      }
      dailyByPoste.get(pKey)!.push({
        date: dp.date,
        hours: dp.totalHours,
        allocated: dp.allocatedHours,
        qty: dp.quantity,
        morningHours: dp.morningHours,
        afternoonHours: dp.afternoonHours,
      })
    }

    // Filtrer les lignes réelles pour ne garder que PP_XXX et ateliers S3P, S4P, S9P, CLP
    const matchingSummaryRows = summaryRows.filter((row) => {
      const pKey = row.poste?.trim().toUpperCase() || ''
      if (!PP_XXX_REGEX.test(pKey)) return false
      const meta = wstMap.get(pKey)
      const stoloc = meta?.stockLocation?.trim().toUpperCase() || ''
      return ALLOWED_ATELIERS.has(stoloc)
    })

    const workstations: WorkstationProducedCard[] = matchingSummaryRows.map((row) => {
      const pKey = row.poste.trim().toUpperCase()
      const meta = wstMap.get(pKey)
      const atelier = meta?.stockLocation?.trim().toUpperCase() || 'AUTRE'

      const weeklyCap = meta?.dailyCapacity
        ? meta.dailyCapacity.reduce((acc, c) => acc + (c || 0), 0)
        : 0

      const totQty = row.quantity + row.rejectQuantity
      const rejRate = totQty > 0 ? Math.round((row.rejectQuantity / totQty) * 1000) / 10 : 0
      const label = wstLabels.get(pKey) || meta?.description || row.poste

      return {
        poste: row.poste,
        name: label,
        atelier,
        workCenter: meta?.workCenter || '',
        wstType: meta?.type ?? 1,
        operationHours: row.operationHours,
        setupHours: row.setupHours,
        totalHours: row.totalHours,
        allocatedOperationHours: row.allocatedOperationHours,
        allocatedSetupHours: row.allocatedSetupHours,
        totalAllocatedHours: row.totalAllocatedHours,
        deltaHours: row.deltaHours,
        efficiency: row.efficiency,
        quantity: row.quantity,
        rejectQuantity: row.rejectQuantity,
        rejectRate: rejRate,
        nbOfs: row.nbOfs,
        nbTrackings: row.nbTrackings,
        weeklyCapacity: Math.round(weeklyCap * 10) / 10,
        timeline: dailyByPoste.get(pKey) || [],
      }
    })

    // Trier les postes par total heures décroissant
    workstations.sort((a, b) => b.totalHours - a.totalHours)

    // Calcul des KPI globaux
    let totH = 0
    let totOpH = 0
    let totSetH = 0
    let totAlH = 0
    let totQty = 0
    let totRej = 0

    for (const w of workstations) {
      totH += w.totalHours
      totOpH += w.operationHours
      totSetH += w.setupHours
      totAlH += w.totalAllocatedHours
      totQty += w.quantity
      totRej += w.rejectQuantity
    }

    totH = Math.round(totH * 100) / 100
    totOpH = Math.round(totOpH * 100) / 100
    totSetH = Math.round(totSetH * 100) / 100
    totAlH = Math.round(totAlH * 100) / 100
    const globalDelta = Math.round((totH - totAlH) * 100) / 100
    const globalEff = totH > 0 ? Math.round((totAlH / totH) * 1000) / 10 : totAlH > 0 ? 100 : 100
    const allPieces = totQty + totRej
    const globalRejRate = allPieces > 0 ? Math.round((totRej / allPieces) * 1000) / 10 : 0

    const kpis: ProducedHoursKPIs = {
      totalHours: totH,
      totalOperationHours: totOpH,
      totalSetupHours: totSetH,
      totalAllocatedHours: totAlH,
      globalDeltaHours: globalDelta,
      globalEfficiency: globalEff,
      totalQuantity: totQty,
      totalRejects: totRej,
      rejectRate: globalRejRate,
      activeWorkstationsCount: workstations.length,
      totalWorkstationsCount: eligibleWstList.length,
    }

    return {
      from,
      to,
      kpis,
      workstations,
      ateliers: Array.from(ALLOWED_ATELIERS).sort(),
    }
  }

  /**
   * Charge le détail des pointages pour un poste spécifique (drill-down).
   */
  async loadWorkstationDetail(
    poste: string,
    from: string,
    to: string
  ): Promise<WorkstationDetailResponse> {
    const cleanPoste = poste.trim()

    const [wstRefList, gammes, rawTrackings, dailyPoints] = await Promise.all([
      staticSync.readWorkstations().catch(() => []),
      staticSync.readGammes().catch(() => []),
      this.repo.getPosteTrackings(cleanPoste, from, to),
      this.repo.getDailyTimeline(from, to, cleanPoste),
    ])

    const pKey = cleanPoste.toUpperCase()
    const labelFromGammes = gammes
      .find((g) => g.workstation?.trim().toUpperCase() === pKey && g.workstationLabel)
      ?.workstationLabel?.trim()
    const meta = wstRefList.find((w) => w.code.trim().toUpperCase() === pKey)
    const name = labelFromGammes || meta?.description || cleanPoste

    // Résolution des libellés articles en batch
    const itmRefs = [...new Set(rawTrackings.map((t) => t.article).filter(Boolean))]
    const articles = itmRefs.length
      ? await StaticArticle.query().whereIn('code', itmRefs).select('code', 'description')
      : []
    const desMap = new Map(articles.map((a) => [a.code.trim().toUpperCase(), a.description]))

    const trackings: EnrichedPosteTracking[] = rawTrackings.map((t) => ({
      ...t,
      designation: desMap.get(t.article.trim().toUpperCase()) || '',
    }))

    // Calcul des KPI du poste
    let totalH = 0
    let opH = 0
    let setH = 0
    let alH = 0
    let qty = 0
    let rej = 0
    const ofSet = new Set<string>()

    for (const t of rawTrackings) {
      totalH += t.totalHours
      opH += t.operationHours
      setH += t.setupHours
      alH += t.totalAllocatedHours
      qty += t.quantity
      rej += t.rejectQuantity
      if (t.ofNum) ofSet.add(t.ofNum)
    }

    totalH = Math.round(totalH * 100) / 100
    opH = Math.round(opH * 100) / 100
    setH = Math.round(setH * 100) / 100
    alH = Math.round(alH * 100) / 100
    const deltaH = Math.round((totalH - alH) * 100) / 100
    const eff = totalH > 0 ? Math.round((alH / totalH) * 1000) / 10 : alH > 0 ? 100 : 100

    const timeline = dailyPoints.map((dp) => ({
      date: dp.date,
      hours: dp.totalHours,
      allocated: dp.allocatedHours,
      qty: dp.quantity,
      morningHours: dp.morningHours,
      afternoonHours: dp.afternoonHours,
    }))

    return {
      poste: cleanPoste,
      name,
      atelier: meta?.stockLocation?.trim() || meta?.workCenter?.trim() || 'AUTRE',
      workCenter: meta?.workCenter || '',
      wstType: meta?.type ?? 1,
      from,
      to,
      kpis: {
        totalHours: totalH,
        operationHours: opH,
        setupHours: setH,
        totalAllocatedHours: alH,
        deltaHours: deltaH,
        efficiency: eff,
        quantity: qty,
        rejectQuantity: rej,
        nbOfs: ofSet.size,
        nbTrackings: rawTrackings.length,
      },
      timeline,
      trackings,
    }
  }
}

export const producedHoursLoader = new ProducedHoursLoader()
