import type { Emplacement } from '#app/domain/suivi'
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
  const n = parseInt((v ?? '').trim(), 10)
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
        })
        map.set(key, arr)
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
          .select('ITMREF_0', 'LOC_0', 'PALNUM_0', 'QTYSTUACT_0', 'STOCOU_0', 'STA_0', 'QLYCTLDEM_0')
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
        })
        map.set(art, arr)
      }
    }
    return map
  }
}
