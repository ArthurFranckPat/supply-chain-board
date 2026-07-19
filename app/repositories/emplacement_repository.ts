import type { DateTime } from 'luxon'
import type { Emplacement } from '#app/domain/suivi'
import type { ErpAllocation } from '#app/domain/allocation'
import StockAlloc from '#models/x3/stoall'
import Stock from '#models/x3/stock'

/**
 * Emplacements de stock par ligne de commande — détection « zone d'expédition ».
 *
 * Deux sources, deux cas métier :
 *
 *  - **STOALL** (allocations de stock) : l'article est réservé pour la commande.
 *    VCRNUM/VCRLIN font le lien commande↔stock. LOC peut être vide (allocation
 *    sans bin attitré). On conserve toutes les lignes (pas de filtre LOC).
 *
 *  - **STOCK** (stock physique) : l'article est présent mais NON encore alloué.
 *    Cas MTO / commande normale manuelle : l'allocation reste à faire (c'est tout l'intérêt
 *    du statut ALLOCATION_A_FAIRE). `LOC_0` = bin où l'article est, `PALNUM_0` = palette.
 *
 * On privilégie STOALL (allocation = ligne « réservée ») ; à défaut STOCK.
 *
 * Accès via les modèles Lucid (connection 'x3') — pas de raw SQL (le endpoint SOAP X3
 * `run SQL` hangue sur STOCK/STOALL, tandis que le driver Lucid — comme pour ITMMVT —
 * fonctionne).
 */

const intOrNull = (v: string | null | undefined): number | null => {
  const n = Number.parseInt((v ?? '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

export class X3EmplacementRepository {
  /**
   * Allocations détaillées par (numCommande#ligne) → emplacements. Source STOALL.
   * Clé de map = `${VCRNUM}#${VCRLIN}`.
   */
  async getDetailedByOrderLine(numCommandes: string[]): Promise<Map<string, Emplacement[]>> {
    const map = new Map<string, Emplacement[]>()
    const uniq = [...new Set(numCommandes.filter(Boolean))]
    if (uniq.length === 0) return map
    for (let i = 0; i < uniq.length; i += 1000) {
      const part = uniq.slice(i, i + 1000)
      let rows: StockAlloc[] = []
      try {
        rows = await StockAlloc.query()
          .select('VCRNUM_0', 'VCRLIN_0', 'LOC_0', 'QTYSTU_0', 'STOCOU_0')
          .whereIn('VCRNUM_0', part)
          .where('QTYSTU_0', '>', 0)
      } catch {
        // X3 KO → dégrade en map vide (la détection zone est non-bloquante).
      }
      // STOALL ne porte pas la date d'entrée en stock — on la récupère sur STOCK
      // via le chrono commun STOCOU_0 (même ligne physique).
      const stoCous = [...new Set(rows.map((r) => r.chronoStock).filter((v): v is string => Boolean(v)))]
      const entreeParStoCou = new Map<string, DateTime | null>()
      if (stoCous.length > 0) {
        try {
          const stockRows = await Stock.query()
            .select('STOCOU_0', 'LASRCPDAT_0')
            .whereIn('STOCOU_0', stoCous)
          for (const s of stockRows) {
            if (s.chronoStock) entreeParStoCou.set(s.chronoStock, s.dateDerniereEntree)
          }
        } catch {
          // date d'entrée non-bloquante — dégrade en absence de date.
        }
      }
      for (const r of rows) {
        const loc = r.emplacementRupture?.trim() ?? ''
        const key = `${r.noPieceNoRecNoLivOuNoOf?.trim() ?? ''}#${String(r.noLignePiece ?? '').trim()}`
        const arr = map.get(key) ?? []
        // LOC peut être vide (allocation sans bin attitré) — c'est une allocation
        // valide. On utilise "Alloc." comme libellé par défaut.
        arr.push({
          nom: loc,
          qtePalette: intOrNull(r.quantiteUs),
          source: 'STOALL',
          stoCou: String(r.chronoStock ?? '') || null,
          dateMiseEnStock: (r.chronoStock ? entreeParStoCou.get(r.chronoStock) : null)?.toJSDate() ?? null,
        })
        map.set(key, arr)
      }
    }
    return map
  }

  /**
   * Allocations ERP par OF (composants réservés). Source STOALL, VCRNUM = numéro d'OF.
   * Qté = QTYSTUACT_0 : les allocations GLOBALES (ALLTYP=1, cas OF) portent leur quantité
   * là et laissent QTYSTU_0 à 0 — vérifié en prod (11016785 : QTYSTU=0, QTYSTUACT=175).
   * Pour les allocations détaillées, QTYSTUACT reflète aussi la part encore active.
   */
  async getOfAllocations(numOfs: string[]): Promise<Map<string, ErpAllocation[]>> {
    const map = new Map<string, ErpAllocation[]>()
    const uniq = [...new Set(numOfs.filter(Boolean))]
    if (uniq.length === 0) return map
    for (let i = 0; i < uniq.length; i += 1000) {
      const part = uniq.slice(i, i + 1000)
      let rows: StockAlloc[] = []
      try {
        rows = await StockAlloc.query()
          .select('VCRNUM_0', 'ITMREF_0', 'QTYSTUACT_0')
          .whereIn('VCRNUM_0', part)
          .where('QTYSTUACT_0', '>', 0)
      } catch {
        // X3 KO → dégrade en map vide (crédit d'allocation absent, check plus sévère).
      }
      for (const r of rows) {
        const numOf = r.noPieceNoRecNoLivOuNoOf?.trim() ?? ''
        const article = r.article?.trim() ?? ''
        const qte = Number.parseFloat(r.quantiteActiveUs ?? '0') || 0
        if (!numOf || !article || qte <= 0) continue
        const arr = map.get(numOf) ?? []
        arr.push({ article, qteAllouee: qte })
        map.set(numOf, arr)
      }
    }
    return map
  }

  /**
   * Emplacements physiques par article (pré-allocation, cas MTO/normal). Source STOCK.
   * Clé de map = `ITMREF`.
   */
  async getStockLocations(articles: string[]): Promise<Map<string, Emplacement[]>> {
    const map = new Map<string, Emplacement[]>()
    const uniq = [...new Set(articles.filter(Boolean))]
    if (uniq.length === 0) return map
    for (let i = 0; i < uniq.length; i += 1000) {
      const part = uniq.slice(i, i + 1000)
      let rows: Stock[] = []
      try {
        rows = await Stock.query()
          .select(
            'ITMREF_0',
            'LOC_0',
            'PALNUM_0',
            'QTYSTUACT_0',
            'STOCOU_0',
            'STA_0',
            'QLYCTLDEM_0',
            'LASRCPDAT_0'
          )
          .whereIn('ITMREF_0', part)
          .whereNotNull('LOC_0')
          .where('QTYSTUACT_0', '>', 0)
      } catch {
        // X3 KO → map vide.
      }
      for (const r of rows) {
        const art = r.article?.trim() ?? ''
        const loc = r.emplacement?.trim() ?? ''
        if (!art || !loc) continue
        const arr = map.get(art) ?? []
        arr.push({
          nom: loc,
          qtePalette: intOrNull(r.quantiteActiveUs),
          hum: r.identifiant1?.trim() || null,
          source: 'STOCK',
          stoCou: String(r.chronoStock ?? '') || null,
          isQc: (r.statut?.trim() ?? '') === 'Q' || Boolean(r.demandeAnalyseQualite?.trim()),
          dateMiseEnStock: r.dateDerniereEntree?.toJSDate() ?? null,
        })
        map.set(art, arr)
      }
    }
    return map
  }
}
