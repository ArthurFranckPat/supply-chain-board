import type { DateTime } from 'luxon'
import type { Emplacement, EntreeCq } from '#app/domain/suivi'
import type { ErpAllocation } from '#app/domain/allocation'
import StockAlloc from '#models/x3/stoall'
import Stock from '#models/x3/stock'
import StockJournal from '#models/x3/stojou'

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

// X3 renvoie parfois une date sentinelle non parsable (ex: LASRCPDAT_0 vide) →
// Luxon produit un DateTime invalide sans lever ; toJSDate() donne alors un Invalid Date
// qui fait planter .toISOString() plus loin (contrôleur suivi). On filtre ici.
const toValidJsDate = (dt: DateTime | null | undefined): Date | null =>
  dt?.isValid ? dt.toJSDate() : null

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
      const stoCous = [
        ...new Set(rows.map((r) => r.chronoStock).filter((v): v is string => Boolean(v))),
      ]
      const entreeParStoCou = new Map<string, DateTime | null>()
      const humParStoCou = new Map<string, string>()
      if (stoCous.length > 0) {
        try {
          const stockRows = await Stock.query()
            .select('STOCOU_0', 'LASRCPDAT_0', 'PALNUM_0')
            .whereIn('STOCOU_0', stoCous)
          for (const s of stockRows) {
            if (!s.chronoStock) continue
            entreeParStoCou.set(s.chronoStock, s.dateDerniereEntree)
            const hum = s.identifiant1?.trim()
            if (hum) humParStoCou.set(s.chronoStock, hum)
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
          hum: r.chronoStock ? (humParStoCou.get(r.chronoStock) ?? null) : null,
          source: 'STOALL',
          stoCou: String(r.chronoStock ?? '') || null,
          dateMiseEnStock: toValidJsDate(r.chronoStock ? entreeParStoCou.get(r.chronoStock) : null),
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
   * Stock sous contrôle qualité des articles donnés, avec la pièce d'entrée d'origine —
   * pour dater l'attente au contrôle réception (détail /suivi proactif).
   *
   * Même critère Q que `getStockLocations` (STA=Q ou demande CQ ouverte). Origine :
   * STOJOU TRSTYP 3 (réception achat) / 5 (production) portant la même demande CQ,
   * mouvement positif. Non-bloquante : STOJOU KO → lignes sans origine.
   */
  async getEntreesCq(articles: string[]): Promise<EntreeCq[]> {
    const uniq = [...new Set(articles.filter(Boolean))]
    if (uniq.length === 0) return []
    const rows = await Stock.query()
      .select('ITMREF_0', 'LOC_0', 'PALNUM_0', 'QTYSTUACT_0', 'STA_0', 'QLYCTLDEM_0', 'LASRCPDAT_0')
      .whereIn('ITMREF_0', uniq)
      .whereNotNull('LOC_0')
      .where('QTYSTUACT_0', '>', 0)
    const lignes = rows.filter(
      (r) => (r.statut?.trim() ?? '') === 'Q' || Boolean(r.demandeAnalyseQualite?.trim())
    )

    const demandes = [
      ...new Set(lignes.map((r) => r.demandeAnalyseQualite?.trim()).filter(Boolean)),
    ] as string[]
    const origineParDemande = new Map<string, NonNullable<EntreeCq['origine']>>()
    if (demandes.length > 0) {
      try {
        const mvts = await StockJournal.query()
          .select('QLYCTLDEM_0', 'TRSTYP_0', 'VCRNUM_0', 'BPRNUM_0')
          .whereIn('ITMREF_0', uniq)
          .whereIn('QLYCTLDEM_0', demandes)
          .whereIn('TRSTYP_0', [3, 5])
          .where('QTYSTU_0', '>', 0)
        for (const m of mvts) {
          const dem = m.demandeAnalyseQualite?.trim()
          const piece = m.noPieceNoRecNoLivOuNoOf?.trim()
          if (!dem || !piece || origineParDemande.has(dem)) continue
          const reception = String(m.typeTransaction ?? '').trim() === '3'
          origineParDemande.set(dem, {
            type: reception ? 'reception' : 'production',
            piece,
            tiers: reception ? m.numeroTiers?.trim() || null : null,
          })
        }
      } catch {
        // origine non-bloquante — la date d'entrée suffit à challenger le CQ.
      }
    }

    const entrees: EntreeCq[] = lignes.map((r) => {
      const dem = r.demandeAnalyseQualite?.trim() || null
      return {
        article: r.article?.trim() ?? '',
        emplacement: r.emplacement?.trim() ?? '',
        hum: r.identifiant1?.trim() || null,
        qte: Number.parseFloat(r.quantiteActiveUs ?? '0') || 0,
        dateEntree: toValidJsDate(r.dateDerniereEntree),
        demandeCq: dem,
        origine: dem ? (origineParDemande.get(dem) ?? null) : null,
      }
    })

    // Sans demande CQ sur la ligne de stock (entrée diverse posée à la main en Q, ex.
    // 11028700 : MIS26APR00211 sur CLC, 12 u bloquées depuis 5 mois ; ou ligne issue d'un
    // transfert qui a perdu la demande), on retrouve le mouvement d'entrée par article +
    // statut Q + date d'entrée.
    const orphelines = entrees.filter((e) => !e.origine && e.dateEntree)
    if (orphelines.length > 0) {
      const minIso = orphelines.map((e) => e.dateEntree!.toISOString().slice(0, 10)).sort()[0]!
      try {
        const mvts = await StockJournal.query()
          .select('ITMREF_0', 'LOC_0', 'IPTDAT_0', 'TRSTYP_0', 'VCRNUM_0', 'BPRNUM_0', 'CREUSR_0')
          .whereIn('ITMREF_0', [...new Set(orphelines.map((e) => e.article))])
          .where('STA_0', 'Q')
          .where('QTYSTU_0', '>', 0)
          .whereIn('TRSTYP_0', [1, 3, 5])
          // minIso vient d'une Date : littéral sûr, pas d'entrée utilisateur.
          .whereRaw(`IPTDAT_0 >= TO_DATE('${minIso}', 'YYYY-MM-DD')`)
        for (const e of orphelines) {
          const jour = e.dateEntree!.toISOString().slice(0, 10)
          // Même emplacement d'abord ; sinon même jour ailleurs — la ligne a pu être
          // transférée depuis (K5325 : reçu en REC le 18/11, rangé en S4P ensuite).
          const duJour = mvts.filter(
            (x) => x.article?.trim() === e.article && x.dateImputation?.toISODate() === jour
          )
          const m = duJour.find((x) => x.emplacement?.trim() === e.emplacement) ?? duJour[0]
          const piece = m?.noPieceNoRecNoLivOuNoOf?.trim()
          if (!m || !piece) continue
          const trs = String(m.typeTransaction ?? '').trim()
          e.origine =
            trs === '3'
              ? { type: 'reception', piece, tiers: m.numeroTiers?.trim() || null }
              : trs === '5'
                ? { type: 'production', piece, tiers: null }
                : {
                    type: 'entree_diverse',
                    piece,
                    tiers: null,
                    operateur: m.operateurCreation?.trim() || null,
                  }
        }
      } catch {
        // origine non-bloquante.
      }
    }
    return entrees
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
          dateMiseEnStock: toValidJsDate(r.dateDerniereEntree),
        })
        map.set(art, arr)
      }
    }
    return map
  }
}
