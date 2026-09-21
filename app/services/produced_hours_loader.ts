import staticSync from '#services/static_sync_service'
import StaticArticle from '#models/static_article'
import {
  X3ProducedHoursRepository,
  type PosteTrackingDetail,
} from '#repositories/produced_hours_repository'
import {
  X3OrderedQuantitiesRepository,
  type OrderDateMode,
} from '#repositories/ordered_quantities_repository'
import { buildPosteNatureByWorkstation } from '#app/domain/atelier'

export type { OrderDateMode }

export interface OrderedProductItem {
  code: string
  name: string
  category: string
  quantity: number
  nbOrders: number
  timeline: { date: string; qty: number }[]
}

export interface WorkstationOrderedCard {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  totalQuantity: number
  nbProducts: number
  nbOrders: number
  products: OrderedProductItem[]
  timeline: { date: string; qty: number }[]
}

export interface ProducedOrdersKPIs {
  totalQuantity: number
  totalProducts: number
  totalOrders: number
  activeWorkstationsCount: number
  totalWorkstationsCount: number
}

export interface ProducedOrdersPayload {
  from: string
  to: string
  dateMode: OrderDateMode
  kpis: ProducedOrdersKPIs
  workstations: WorkstationOrderedCard[]
  ateliers: string[]
}

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

  /**
   * Charge le jeu de données de la vision commandes (quantités commandées par produit fini et ligne de production).
   * Périmètre :
   * - Produits finis (`PF*`) commandés directement (Niveau 0).
   * - Descente au Niveau 1 de nomenclature : composants qui sont eux-mêmes des produits finis (`PF*`)
   *   fabriqués sur une ligne d'assemblage final (`assemblage_pf`, PP_XXX, ateliers S3P, S4P, S9P, CLP).
   * - Filtrage temporel sur date demandée ou date acceptée (conforme au KPI OTD).
   */
  async loadOrdersPayload(
    from: string,
    to: string,
    dateMode: OrderDateMode = 'demandee'
  ): Promise<ProducedOrdersPayload> {
    const ordersRepo = new X3OrderedQuantitiesRepository()
    const [wstRefList, gammes, staticArticles, rawOrders, nomenclatures] = await Promise.all([
      staticSync.readWorkstations().catch(() => []),
      staticSync.readGammes().catch(() => []),
      staticSync.readArticles().catch(() => []),
      ordersRepo.getOrderedQuantities(from, to, dateMode),
      staticSync.readNomenclatures().catch(() => []),
    ])

    // Dictionnaire des catégories, désignations et types d'approvisionnement des articles
    const catMap = new Map<string, string>()
    const descMap = new Map<string, string>()
    const supplyTypeMap = new Map<string, string>()
    for (const a of staticArticles) {
      const code = a.code.trim().toUpperCase()
      catMap.set(code, (a.category ?? '').trim().toUpperCase())
      descMap.set(code, (a.description ?? '').trim())
      supplyTypeMap.set(code, (a.supplyType ?? '').trim().toUpperCase())
    }

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

    // Classification de la nature des postes (assemblage_pf vs assemble_sous_ensemble vs autre)
    const natureMap = buildPosteNatureByWorkstation(gammes, catMap)

    // Dictionnaire des postes statiques
    const wstMap = new Map(wstRefList.map((w) => [w.code.trim().toUpperCase(), w]))

    // Association de chaque article à sa ligne de production (1ère opération de gamme)
    const ligneByArticle = new Map<string, string>()
    for (const g of gammes) {
      const art = g.article.trim().toUpperCase()
      if (!ligneByArticle.has(art)) {
        ligneByArticle.set(art, g.workstation.trim().toUpperCase())
      }
    }

    // Indexation des nomenclatures (Niveau 1 direct) par article parent
    const bomByParent = new Map<
      string,
      Array<{
        componentArticle: string
        componentDescription: string
        linkQuantity: number
        componentType: string
      }>
    >()
    for (const row of nomenclatures) {
      const parent = row.parentArticle.trim().toUpperCase()
      const comp = row.componentArticle.trim().toUpperCase()
      if (!bomByParent.has(parent)) {
        bomByParent.set(parent, [])
      }
      bomByParent.get(parent)!.push({
        componentArticle: comp,
        componentDescription: row.componentDescription,
        linkQuantity: row.linkQuantity,
        componentType: row.componentType,
      })
    }

    // Postes d'assemblage final éligibles dans le référentiel statique
    const eligibleFinalAssemblyWst = wstRefList.filter((w) => {
      const code = w.code?.trim().toUpperCase() || ''
      const stoloc = w.stockLocation?.trim().toUpperCase() || ''
      const nature = natureMap.get(code)
      return PP_XXX_REGEX.test(code) && ALLOWED_ATELIERS.has(stoloc) && nature === 'assemblage_pf'
    })

    // Regroupement des lignes de commandes par article et par poste
    // Structure: poste -> article -> { qty, nbOrders, timeline: Map<date, qty> }
    const ordersByWstAndArticle = new Map<
      string,
      Map<string, { qty: number; nbOrders: number; timeline: Map<string, number> }>
    >()

    for (const row of rawOrders) {
      const artCode = row.article.trim().toUpperCase()
      const cat = catMap.get(artCode) || ''
      // L'article commandé doit être un produit fini (PF)
      if (!cat.startsWith('PF')) continue

      const parentWstCode = ligneByArticle.get(artCode)

      // 1) Niveau 0 : Imputation directe du produit fini commandé sur son poste d'assemblage
      if (parentWstCode) {
        const nature = natureMap.get(parentWstCode)
        const meta = wstMap.get(parentWstCode)
        const stoloc = meta?.stockLocation?.trim().toUpperCase() || ''

        if (
          nature === 'assemblage_pf' &&
          PP_XXX_REGEX.test(parentWstCode) &&
          ALLOWED_ATELIERS.has(stoloc)
        ) {
          if (!ordersByWstAndArticle.has(parentWstCode)) {
            ordersByWstAndArticle.set(parentWstCode, new Map())
          }
          const artMap = ordersByWstAndArticle.get(parentWstCode)!
          if (!artMap.has(artCode)) {
            artMap.set(artCode, { qty: 0, nbOrders: 0, timeline: new Map() })
          }
          const item = artMap.get(artCode)!
          item.qty += row.quantity
          item.nbOrders += row.nbOrders
          item.timeline.set(row.date, (item.timeline.get(row.date) || 0) + row.quantity)
        }
      }

      // 2) Niveau 1 : Descente aux composants qui sont eux-mêmes des produits finis fabriqués
      const components = bomByParent.get(artCode)
      if (components && components.length > 0) {
        for (const comp of components) {
          const compCode = comp.componentArticle
          const compCat = catMap.get(compCode) || ''
          // Le composant doit être un produit fini (PF*)
          if (!compCat.startsWith('PF')) continue

          // Doit être fabriqué (FABRIQUE ou FABRICATION)
          const isFab =
            comp.componentType === 'FABRIQUE' || supplyTypeMap.get(compCode) === 'FABRICATION'
          if (!isFab) continue

          const compWst = ligneByArticle.get(compCode)
          if (!compWst) continue

          // Éviter le double comptage si le composant est assemblé sur le même poste que le parent
          if (compWst === parentWstCode) continue

          // Doit être un poste d'assemblage final éligible (assemblage_pf, PP_XXX, ateliers autorisés)
          const compNature = natureMap.get(compWst)
          if (compNature !== 'assemblage_pf') continue
          if (!PP_XXX_REGEX.test(compWst)) continue
          const compMeta = wstMap.get(compWst)
          const compStoloc = compMeta?.stockLocation?.trim().toUpperCase() || ''
          if (!ALLOWED_ATELIERS.has(compStoloc)) continue

          const derivedQty = row.quantity * comp.linkQuantity
          if (derivedQty <= 0) continue

          if (!ordersByWstAndArticle.has(compWst)) {
            ordersByWstAndArticle.set(compWst, new Map())
          }
          const compArtMap = ordersByWstAndArticle.get(compWst)!
          if (!compArtMap.has(compCode)) {
            compArtMap.set(compCode, { qty: 0, nbOrders: 0, timeline: new Map() })
          }
          const compItem = compArtMap.get(compCode)!
          compItem.qty += derivedQty
          compItem.nbOrders += row.nbOrders
          compItem.timeline.set(row.date, (compItem.timeline.get(row.date) || 0) + derivedQty)
        }
      }
    }

    // Construction des cartes postes
    const workstations: WorkstationOrderedCard[] = []
    let totalAllQty = 0
    let totalAllOrders = 0
    const allProductsSet = new Set<string>()

    for (const [wstCode, artMap] of ordersByWstAndArticle) {
      const meta = wstMap.get(wstCode)
      const atelier = meta?.stockLocation?.trim().toUpperCase() || 'AUTRE'
      const label = wstLabels.get(wstCode) || meta?.description || wstCode

      const products: OrderedProductItem[] = []
      let wstTotQty = 0
      let wstTotOrders = 0
      const wstDailyMap = new Map<string, number>()

      for (const [artCode, data] of artMap) {
        wstTotQty += data.qty
        wstTotOrders += data.nbOrders
        allProductsSet.add(artCode)

        for (const [d, q] of data.timeline) {
          wstDailyMap.set(d, (wstDailyMap.get(d) || 0) + q)
        }

        const productTimeline = Array.from(data.timeline.entries())
          .map(([date, qty]) => ({ date, qty: Math.round(qty * 100) / 100 }))
          .sort((a, b) => a.date.localeCompare(b.date))

        products.push({
          code: artCode,
          name: descMap.get(artCode) || artCode,
          category: catMap.get(artCode) || 'PF',
          quantity: Math.round(data.qty * 100) / 100,
          nbOrders: data.nbOrders,
          timeline: productTimeline,
        })
      }

      // Trier les produits par quantité décroissante
      products.sort((a, b) => b.quantity - a.quantity)

      const wstTimeline = Array.from(wstDailyMap.entries())
        .map(([date, qty]) => ({ date, qty: Math.round(qty * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date))

      totalAllQty += wstTotQty
      totalAllOrders += wstTotOrders

      workstations.push({
        poste: wstCode,
        name: label,
        atelier,
        workCenter: meta?.workCenter || '',
        wstType: meta?.type ?? 1,
        totalQuantity: Math.round(wstTotQty * 100) / 100,
        nbProducts: products.length,
        nbOrders: wstTotOrders,
        products,
        timeline: wstTimeline,
      })
    }

    // Trier les postes par quantité totale commandée décroissante
    workstations.sort((a, b) => b.totalQuantity - a.totalQuantity)

    const kpis: ProducedOrdersKPIs = {
      totalQuantity: Math.round(totalAllQty * 100) / 100,
      totalProducts: allProductsSet.size,
      totalOrders: totalAllOrders,
      activeWorkstationsCount: workstations.length,
      totalWorkstationsCount: eligibleFinalAssemblyWst.length,
    }

    return {
      from,
      to,
      dateMode,
      kpis,
      workstations,
      ateliers: Array.from(ALLOWED_ATELIERS).sort(),
    }
  }

  /**
   * Charge le détail des commandes associées à un poste d'assemblage final (drill-down sheet).
   * Intègre les commandes directes (Niveau 0) et les besoins dérivés des kits parents (Niveau 1 de nomenclature).
   */
  async loadWorkstationOrdersDetail(
    poste: string,
    from: string,
    to: string,
    dateMode: OrderDateMode = 'demandee'
  ): Promise<OrderWorkstationDetailResponse> {
    const cleanPoste = poste.trim().toUpperCase()
    const ordersRepo = new X3OrderedQuantitiesRepository()

    const [wstRefList, gammes, staticArticles, nomenclatures] = await Promise.all([
      staticSync.readWorkstations().catch(() => []),
      staticSync.readGammes().catch(() => []),
      staticSync.readArticles().catch(() => []),
      staticSync.readNomenclatures().catch(() => []),
    ])

    const meta = wstRefList.find((w) => w.code.trim().toUpperCase() === cleanPoste)
    const atelier = meta?.stockLocation?.trim() || meta?.workCenter?.trim() || 'AUTRE'

    // Dictionnaire articles
    const descMap = new Map<string, string>()
    const catMap = new Map<string, string>()
    const supplyTypeMap = new Map<string, string>()
    for (const a of staticArticles) {
      const code = a.code.trim().toUpperCase()
      descMap.set(code, (a.description ?? '').trim())
      catMap.set(code, (a.category ?? '').trim().toUpperCase())
      supplyTypeMap.set(code, (a.supplyType ?? '').trim().toUpperCase())
    }

    // Nom du poste
    let name = meta?.description?.trim() || cleanPoste
    for (const g of gammes) {
      if (g.workstation?.trim().toUpperCase() === cleanPoste && g.workstationLabel?.trim()) {
        name = g.workstationLabel.trim()
        break
      }
    }

    // Association de chaque article à sa ligne de production (1ère opération)
    const ligneByArticle = new Map<string, string>()
    for (const g of gammes) {
      const art = g.article.trim().toUpperCase()
      if (!ligneByArticle.has(art)) {
        ligneByArticle.set(art, g.workstation.trim().toUpperCase())
      }
    }

    // 1) Articles PF assemblés directement sur ce poste (Niveau 0)
    const directArticlesSet = new Set<string>()
    for (const [art, wst] of ligneByArticle) {
      if (wst === cleanPoste) {
        const cat = catMap.get(art) || ''
        if (cat.startsWith('PF')) {
          directArticlesSet.add(art)
        }
      }
    }

    // 2) Articles parents (Kits / PF) consommant un article direct de ce poste au Niveau 1
    // Structure: parentArticle -> Array<{ compArticle: string, linkQuantity: number, compDescription: string }>
    const componentsByParentForPoste = new Map<
      string,
      Array<{ compArticle: string; linkQuantity: number; compDescription: string }>
    >()

    for (const row of nomenclatures) {
      const parent = row.parentArticle.trim().toUpperCase()
      const comp = row.componentArticle.trim().toUpperCase()

      // Le composant doit être un article assemblé sur CE poste
      if (!directArticlesSet.has(comp)) continue

      // Le parent doit être un produit fini (PF*)
      const parentCat = catMap.get(parent) || ''
      if (!parentCat.startsWith('PF')) continue

      // Le composant doit être fabriqué
      const isFab = row.componentType === 'FABRIQUE' || supplyTypeMap.get(comp) === 'FABRICATION'
      if (!isFab) continue

      // Éviter le double comptage si le parent est assemblé sur le même poste
      const parentWst = ligneByArticle.get(parent)
      if (parentWst === cleanPoste) continue

      if (!componentsByParentForPoste.has(parent)) {
        componentsByParentForPoste.set(parent, [])
      }
      componentsByParentForPoste.get(parent)!.push({
        compArticle: comp,
        linkQuantity: row.linkQuantity,
        compDescription: row.componentDescription,
      })
    }

    // Liste complète des articles à requêter (articles directs + parents dont on dérive le besoin)
    const allArticlesToQuery = Array.from(
      new Set([...directArticlesSet, ...componentsByParentForPoste.keys()])
    )

    // Récupérer le détail brut des commandes X3
    const rawLines = await ordersRepo.getWorkstationOrdersDetail(
      allArticlesToQuery,
      from,
      to,
      dateMode
    )

    // Calculer les lignes enrichies
    const lines: OrderDetailLine[] = []
    const dailyMap = new Map<string, { qty: number; orderNums: Set<string> }>()
    const productMap = new Map<string, { qty: number; orderNums: Set<string> }>()
    const allOrderNums = new Set<string>()
    let totalQty = 0

    for (const r of rawLines) {
      // Calcul écart OTD
      let deltaDays = 0
      if (r.dateDemandee && r.dateAcceptee) {
        const tDem = new Date(r.dateDemandee).getTime()
        const tAcc = new Date(r.dateAcceptee).getTime()
        if (!Number.isNaN(tDem) && !Number.isNaN(tAcc)) {
          deltaDays = Math.round((tAcc - tDem) / 86_400_000)
        }
      }

      const dateKey = (dateMode === 'demandee' ? r.dateDemandee : r.dateAcceptee) || r.dateDemandee

      // Cas A : Ligne directe pour un article assemblé sur ce poste
      if (directArticlesSet.has(r.article)) {
        totalQty += r.quantity
        if (r.orderNum) allOrderNums.add(r.orderNum)

        if (dateKey) {
          if (!dailyMap.has(dateKey)) {
            dailyMap.set(dateKey, { qty: 0, orderNums: new Set() })
          }
          const dEntry = dailyMap.get(dateKey)!
          dEntry.qty += r.quantity
          if (r.orderNum) dEntry.orderNums.add(r.orderNum)
        }

        if (!productMap.has(r.article)) {
          productMap.set(r.article, { qty: 0, orderNums: new Set() })
        }
        const pEntry = productMap.get(r.article)!
        pEntry.qty += r.quantity
        if (r.orderNum) pEntry.orderNums.add(r.orderNum)

        lines.push({
          orderNum: r.orderNum,
          orderLine: r.orderLine,
          orderSeq: r.orderSeq,
          clientCode: r.clientCode,
          clientName: r.clientName,
          article: r.article,
          designation: descMap.get(r.article) || r.article,
          quantity: r.quantity,
          dateDemandee: r.dateDemandee,
          dateAcceptee: r.dateAcceptee,
          deltaDays,
          isDerived: false,
        })
      }

      // Cas B : Commande d'un article parent (kit) dont le besoin dérive sur ce poste
      const parentComps = componentsByParentForPoste.get(r.article)
      if (parentComps && parentComps.length > 0) {
        for (const comp of parentComps) {
          const derivedQty = Math.round(r.quantity * comp.linkQuantity * 100) / 100
          if (derivedQty <= 0) continue

          totalQty += derivedQty
          if (r.orderNum) allOrderNums.add(r.orderNum)

          if (dateKey) {
            if (!dailyMap.has(dateKey)) {
              dailyMap.set(dateKey, { qty: 0, orderNums: new Set() })
            }
            const dEntry = dailyMap.get(dateKey)!
            dEntry.qty += derivedQty
            if (r.orderNum) dEntry.orderNums.add(r.orderNum)
          }

          if (!productMap.has(comp.compArticle)) {
            productMap.set(comp.compArticle, { qty: 0, orderNums: new Set() })
          }
          const pEntry = productMap.get(comp.compArticle)!
          pEntry.qty += derivedQty
          if (r.orderNum) pEntry.orderNums.add(r.orderNum)

          lines.push({
            orderNum: r.orderNum,
            orderLine: r.orderLine,
            orderSeq: r.orderSeq,
            clientCode: r.clientCode,
            clientName: r.clientName,
            article: comp.compArticle,
            designation: descMap.get(comp.compArticle) || comp.compDescription || comp.compArticle,
            quantity: derivedQty,
            dateDemandee: r.dateDemandee,
            dateAcceptee: r.dateAcceptee,
            deltaDays,
            isDerived: true,
            parentArticle: r.article,
            parentDesignation: descMap.get(r.article) || r.article,
          })
        }
      }
    }

    totalQty = Math.round(totalQty * 100) / 100

    // Synthèse produits
    const products: OrderWorkstationProductSummary[] = []
    for (const [code, pData] of productMap) {
      const q = Math.round(pData.qty * 100) / 100
      const sharePct = totalQty > 0 ? Math.round((q / totalQty) * 1000) / 10 : 0
      products.push({
        code,
        name: descMap.get(code) || code,
        quantity: q,
        nbOrders: pData.orderNums.size,
        sharePct,
      })
    }
    products.sort((a, b) => b.quantity - a.quantity)

    // Timeline triée
    const timeline = Array.from(dailyMap.entries())
      .map(([date, dData]) => ({
        date,
        qty: Math.round(dData.qty * 100) / 100,
        nbOrders: dData.orderNums.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const topProduct = products[0] || null

    return {
      poste: cleanPoste,
      name,
      atelier,
      workCenter: meta?.workCenter || '',
      wstType: meta?.type ?? 1,
      from,
      to,
      dateMode,
      kpis: {
        totalQuantity: totalQty,
        nbProducts: products.length,
        nbOrders: allOrderNums.size,
        topProduct: topProduct
          ? {
              code: topProduct.code,
              name: topProduct.name,
              quantity: topProduct.quantity,
              sharePct: topProduct.sharePct,
            }
          : null,
      },
      timeline,
      products,
      lines,
    }
  }
}

export interface OrderDetailLine {
  orderNum: string
  orderLine: number
  orderSeq: number
  clientCode: string
  clientName: string
  article: string
  designation: string
  quantity: number
  dateDemandee: string
  dateAcceptee: string
  deltaDays: number
  parentArticle?: string
  parentDesignation?: string
  isDerived?: boolean
}

export interface OrderWorkstationProductSummary {
  code: string
  name: string
  quantity: number
  nbOrders: number
  sharePct: number
}

export interface OrderWorkstationDetailResponse {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  from: string
  to: string
  dateMode: OrderDateMode
  kpis: {
    totalQuantity: number
    nbProducts: number
    nbOrders: number
    topProduct: {
      code: string
      name: string
      quantity: number
      sharePct: number
    } | null
  }
  timeline: {
    date: string
    qty: number
    nbOrders: number
  }[]
  products: OrderWorkstationProductSummary[]
  lines: OrderDetailLine[]
}

export const producedHoursLoader = new ProducedHoursLoader()
