import db from '@adonisjs/lucid/services/db'
import StaticArticle from '#models/static_article'
import StaticGamme from '#models/static_gamme'
import StaticNomenclature from '#models/static_nomenclature'
import StaticWorkstation from '#models/static_workstation'
import { X3GammeRepository } from '#repositories/gamme_repository'
import { X3WorkstationRepository } from '#repositories/workstation_repository'
import { X3Database } from '#app/x3/client/x3_database'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { Article } from '#app/domain/models/article'
import type { Workstation } from '#app/domain/models/workstation'

// Page size for SOAP keyset pagination (large datasets)
const PAGE_SIZE_ARTICLES = 300
const PAGE_SIZE_BOM = 200

type RawRow = Record<string, string | number | null>

export interface SyncResult {
  articles: number
  gammes: number
  nomenclatures: number
  workstations: number
  durationMs: number
  errors: string[]
}

export class StaticSyncService {
  async syncAll(): Promise<SyncResult> {
    const start = Date.now()
    const errors: string[] = []
    let articles = 0
    let gammes = 0
    let nomenclatures = 0
    let workstations = 0

    const [artResult, gammeResult, nomResult, wstResult] = await Promise.allSettled([
      this.syncArticles(),
      this.syncGammes(),
      this.syncNomenclatures(),
      this.syncWorkstations(),
    ])

    if (artResult.status === 'fulfilled') articles = artResult.value
    else errors.push('articles: ' + (artResult.reason as Error).message)

    if (gammeResult.status === 'fulfilled') gammes = gammeResult.value
    else errors.push('gammes: ' + (gammeResult.reason as Error).message)

    if (nomResult.status === 'fulfilled') nomenclatures = nomResult.value
    else errors.push('nomenclatures: ' + (nomResult.reason as Error).message)

    if (wstResult.status === 'fulfilled') workstations = wstResult.value
    else errors.push('workstations: ' + (wstResult.reason as Error).message)

    return { articles, gammes, nomenclatures, workstations, durationMs: Date.now() - start, errors }
  }

  private async syncWorkstations(): Promise<number> {
    const entries: Workstation[] = await new X3WorkstationRepository().getAll()
    const now = Date.now()
    const data = entries
      .map((w) => ({
        code: w.code,
        description: w.description,
        wsttyp: w.type,
        wstnbr: w.parallelUnits,
        eff: w.efficiency,
        use_pct: w.utilization,
        shr: w.scrap,
        twd: w.scheduleCode,
        daycap_0: w.dailyCapacity[0] ?? 0,
        daycap_1: w.dailyCapacity[1] ?? 0,
        daycap_2: w.dailyCapacity[2] ?? 0,
        daycap_3: w.dailyCapacity[3] ?? 0,
        daycap_4: w.dailyCapacity[4] ?? 0,
        daycap_5: w.dailyCapacity[5] ?? 0,
        daycap_6: w.dailyCapacity[6] ?? 0,
        stoloc: w.stockLocation,
        wcr: w.workCenter,
        wcrfcy: w.facility,
        synced_at: now,
      }))
      .filter((r) => r.code)

    await db.from('static_workstations').delete()
    for (let i = 0; i < data.length; i += 500) {
      await db.table('static_workstations').insert(data.slice(i, i + 500))
    }
    return data.length
  }

  private async syncArticles(): Promise<number> {
    const x3 = new X3Database()
    const all: RawRow[] = []
    let lastCode = ''

    try {
      while (true) {
        const keysetClause = lastCode ? `AND ITMREF_0 > '${lastCode.replace(/'/g, "''")}'` : ''
        const pageQuery = `
SELECT ITMREF_0, ITMDES1_0, TCLCOD_0, MFGFLG_0, YFAMSTAT7_0, TSICOD_4
FROM (
  SELECT ITMREF_0, ITMDES1_0, TCLCOD_0, MFGFLG_0, YFAMSTAT7_0, TSICOD_4
  FROM ITMMASTER
  WHERE ITMSTA_0 = 1 ${keysetClause}
  ORDER BY ITMREF_0
) WHERE ROWNUM <= ${PAGE_SIZE_ARTICLES}`

        const result = await x3.raw(pageQuery)
        const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])
        if (!rows.length) break
        all.push(...rows)
        lastCode = String(rows[rows.length - 1].ITMREF_0 ?? '').trim()
        if (rows.length < PAGE_SIZE_ARTICLES) break
      }
    } finally {
      await x3.destroy()
    }

    const now = Date.now()
    const data = all
      .map((r) => ({
        code: String(r.ITMREF_0 ?? '').trim(),
        description: String(r.ITMDES1_0 ?? '').trim(),
        category: String(r.TCLCOD_0 ?? '').trim(),
        // MFGFLG_0: 2=Fabrication propre, 1=Achat, 3=Sous-traitance
        supply_type: String(r.MFGFLG_0 ?? '1') === '2' ? 'FABRICATION' : 'ACHAT',
        famille: String(r.YFAMSTAT7_0 ?? '').trim(),
        typologie: String(r.TSICOD_4 ?? '').trim(),
        synced_at: now,
      }))
      .filter((r) => r.code)

    await db.from('static_articles').delete()
    for (let i = 0; i < data.length; i += 500) {
      await db.table('static_articles').insert(data.slice(i, i + 500))
    }
    return data.length
  }

  private async syncGammes(): Promise<number> {
    const entries: GammeOperation[] = await new X3GammeRepository().getFirstOperations()
    const now = Date.now()
    const data = entries
      .map((g) => ({
        article: g.article,
        workstation: g.workstation ?? '',
        workstation_label: g.workstationLabel ?? '',
        rate: g.rate ?? 0,
        synced_at: now,
      }))
      .filter((r) => r.article && r.workstation)

    await db.from('static_gammes').delete()
    for (let i = 0; i < data.length; i += 500) {
      await db.table('static_gammes').insert(data.slice(i, i + 500))
    }
    return data.length
  }

  private async syncNomenclatures(): Promise<number> {
    const x3 = new X3Database()
    const allBom: RawRow[] = []
    let fabricated = new Set<string>()

    try {
      // 1. Fabricated articles (BOM parents) — small result, no pagination needed
      const fabResult = await x3.raw(
        `SELECT ITMREF_0 FROM BOM WHERE BOMALT_0 = 1 AND ROWNUM <= 5000`
      )
      const fabRows: RawRow[] = Array.isArray(fabResult)
        ? fabResult
        : ((fabResult as any)?.rows ?? [])
      fabricated = new Set(fabRows.map((r) => String(r.ITMREF_0 ?? '').trim()))

      // 2. BOM lines — composite keyset (ART_PARENT, NIVEAU) to avoid splitting a parent's lines
      let lastParent = ''
      let lastSeq = -1
      while (true) {
        const keysetClause = lastParent
          ? `AND (B.ITMREF_0 > '${lastParent.replace(/'/g, "''")}' OR (B.ITMREF_0 = '${lastParent.replace(/'/g, "''")}' AND D.BOMSEQ_0 > ${lastSeq}))`
          : ''
        const pageQuery = `
SELECT ART_PARENT, DES_PARENT, NIVEAU, ART_COMPOSANT, DES_COMPOSANT, QTE_LIEN, LIKQTYCOD
FROM (
  SELECT
    B.ITMREF_0    AS ART_PARENT,
    IP.ITMDES1_0  AS DES_PARENT,
    D.BOMSEQ_0    AS NIVEAU,
    D.CPNITMREF_0 AS ART_COMPOSANT,
    IC.ITMDES1_0  AS DES_COMPOSANT,
    D.LIKQTY_0    AS QTE_LIEN,
    D.LIKQTYCOD_0 AS LIKQTYCOD
  FROM BOM B
  INNER JOIN ITMMASTER IP ON IP.ITMREF_0 = B.ITMREF_0 AND IP.ITMSTA_0 = 1
  INNER JOIN BOMD D
    ON D.ITMREF_0 = B.ITMREF_0
    AND D.BOMALT_0 = B.BOMALT_0
    AND D.BOMSTRDAT_0 <= SYSDATE
    AND (D.BOMENDDAT_0 = TO_DATE('1599-12-31', 'YYYY-MM-DD') OR D.BOMENDDAT_0 >= SYSDATE)
  INNER JOIN ITMMASTER IC ON IC.ITMREF_0 = D.CPNITMREF_0 AND IC.ITMSTA_0 = 1
  WHERE B.BOMALT_0 = 1
    AND SUBSTR(IP.TCLCOD_0, 1, 1) <> 'Z'
    ${keysetClause}
  ORDER BY B.ITMREF_0, D.BOMSEQ_0
) WHERE ROWNUM <= ${PAGE_SIZE_BOM}`

        const result = await x3.raw(pageQuery)
        const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])
        if (!rows.length) break
        allBom.push(...rows)
        const lastRow = rows[rows.length - 1]
        lastParent = String(lastRow.ART_PARENT ?? '').trim()
        lastSeq = Number.parseInt(String(lastRow.NIVEAU ?? '-1')) || -1
        if (rows.length < PAGE_SIZE_BOM) break
      }
    } finally {
      await x3.destroy()
    }

    const now = Date.now()
    const data = allBom
      .map((r) => {
        const componentArticle = String(r.ART_COMPOSANT ?? '').trim()
        const likqtycod = String(r.LIKQTYCOD ?? '').trim()
        return {
          parent_article: String(r.ART_PARENT ?? '').trim(),
          parent_description: String(r.DES_PARENT ?? '').trim(),
          level: Number.parseInt(String(r.NIVEAU ?? '0')) || 0,
          component_article: componentArticle,
          component_description: String(r.DES_COMPOSANT ?? '').trim(),
          link_quantity: Number.parseFloat(String(r.QTE_LIEN ?? '0')) || 0,
          component_type: fabricated.has(componentArticle) ? 'FABRIQUE' : 'ACHETE',
          consumption_nature: likqtycod === '2' ? 'FORFAIT' : 'PROPORTIONNEL',
          synced_at: now,
        }
      })
      .filter((r) => r.parent_article && r.component_article)

    await db.from('static_nomenclatures').delete()
    for (let i = 0; i < data.length; i += 500) {
      await db.table('static_nomenclatures').insert(data.slice(i, i + 500))
    }
    return data.length
  }

  /** Lecture locale gammes (SQLite) */
  async readGammes(): Promise<GammeOperation[]> {
    const rows = await StaticGamme.all()
    return rows.map((r) => ({
      article: r.article,
      workstation: r.workstation,
      workstationLabel: r.workstationLabel,
      rate: r.rate,
    }))
  }

  /**
   * Articles (PF) dont la nomenclature contient ≥1 BOUCHE (TSICOD_4='BDH60').
   * Sert au marquage `consommeBouche` des cartes OF PP_830 (issue #28/#42).
   * Rework 2026-06-28 : l'ancien critère `component LIKE 'BDH%'` était FAUX (rate les
   * bouches non-préfixées DP2397-2400 + mélange la famille BDH qui inclut cartons et
   * sous-ensembles). La source de vérité = la typologie du composant.
   */
  async readBdhParents(): Promise<Set<string>> {
    const rows = await db
      .from('static_nomenclatures as n')
      .join('static_articles as c', 'c.code', 'n.component_article')
      .distinct('n.parent_article as parent_article')
      .where('c.typologie', 'BDH60')
    return new Set(rows.map((r: { parent_article: string }) => r.parent_article))
  }

  /** Bouches = articles TSICOD_4='BDH60' (produits sur PP_153/PP_128). */
  async readBoucheSet(): Promise<Set<string>> {
    const rows = await db.from('static_articles').select('code').where('typologie', 'BDH60')
    return new Set(rows.map((r: { code: string }) => r.code))
  }

  /** Modules hygro = articles TSICOD_4='BDH10' (MH…, produits sur PP_146). */
  async readModulesHygroSet(): Promise<Set<string>> {
    const rows = await db.from('static_articles').select('code').where('typologie', 'BDH10')
    return new Set(rows.map((r: { code: string }) => r.code))
  }

  /**
   * Bouches « avec module hygro » (le vrai goulot) = bouches BDH60 dont la nomenclature
   * contient ≥1 module BDH10. Dépendent de PP_146 (ligne contrainte). Issue #42.
   */
  async readBouchesHygroSet(): Promise<Set<string>> {
    const rows = await db
      .from('static_nomenclatures as n')
      .join('static_articles as c', 'c.code', 'n.component_article')
      .join('static_articles as p', 'p.code', 'n.parent_article')
      .distinct('n.parent_article as parent_article')
      .where('c.typologie', 'BDH10')
      .where('p.typologie', 'BDH60')
    return new Set(rows.map((r: { parent_article: string }) => r.parent_article))
  }

  /** Lecture locale nomenclatures (SQLite) */
  async readNomenclatures(): Promise<NomenclatureEntry[]> {
    const rows = await StaticNomenclature.all()
    return rows.map((r) => ({
      parentArticle: r.parentArticle,
      parentDescription: r.parentDescription,
      level: r.level,
      componentArticle: r.componentArticle,
      componentDescription: r.componentDescription,
      linkQuantity: r.linkQuantity,
      componentType: r.componentType as 'ACHETE' | 'FABRIQUE',
      consumptionNature: r.consumptionNature as 'PROPORTIONNEL' | 'FORFAIT',
    }))
  }

  /** Lecture locale articles (SQLite) */
  async readArticles(): Promise<Article[]> {
    const rows = await StaticArticle.all()
    return rows.map((r) => ({
      code: r.code,
      description: r.description,
      category: r.category,
      supplyType: r.supplyType as 'ACHAT' | 'FABRICATION',
      famille: r.famille ?? '',
      typologie: r.typologie ?? '',
      reorderDelay: 0,
      productFamily: null,
      pmp: null,
      economicLot: null,
      unitStock: null,
      unitPurchase: null,
      purchaseToStockRatio: 1,
      packagings: [],
    }))
  }

  /** Lecture locale postes de charge (SQLite) */
  async readWorkstations(): Promise<Workstation[]> {
    const rows = await StaticWorkstation.all()
    return rows.map((r) => ({
      code: r.code,
      description: r.description,
      type: r.wsttyp,
      parallelUnits: r.wstnbr,
      efficiency: r.eff,
      utilization: r.usePct,
      scrap: r.shr,
      scheduleCode: r.twd,
      dailyCapacity: [r.daycap0, r.daycap1, r.daycap2, r.daycap3, r.daycap4, r.daycap5, r.daycap6],
      stockLocation: r.stoloc,
      workCenter: r.wcr,
      facility: r.wcrfcy,
    }))
  }

  async counts(): Promise<{
    articles: number
    gammes: number
    nomenclatures: number
    workstations: number
    lastSync: number | null
  }> {
    const [a, g, n, w] = await Promise.all([
      db.from('static_articles').count('* as total').first(),
      db.from('static_gammes').count('* as total').first(),
      db.from('static_nomenclatures').count('* as total').first(),
      db.from('static_workstations').count('* as total').first(),
    ])
    const lastSync = await db.from('static_nomenclatures').max('synced_at as ts').first()
    return {
      articles: Number((a as any)?.total ?? 0),
      gammes: Number((g as any)?.total ?? 0),
      nomenclatures: Number((n as any)?.total ?? 0),
      workstations: Number((w as any)?.total ?? 0),
      lastSync: (lastSync as any)?.ts ? Number((lastSync as any).ts) : null,
    }
  }
}

export default new StaticSyncService()
