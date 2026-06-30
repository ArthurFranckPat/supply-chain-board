import type { Flow } from '#app/domain/models/flow'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import PurchaseOrderLine from '#models/x3/porderq'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Fenêtre arrière (jours) pour les réceptions en retard de livraison. Une PO dont la date
 * d'arrivée prévue est dans le passé mais non reçue (retard fournisseur) reste une couverture
 * potentielle — on l'inclut jusqu'à N jours en arrière pour capter ces retards. Au-delà, une
 * PO toujours ouverte est considérée comme un reliquat fantôme (visserie, etc.) à ignorer.
 */
export const RECEPTION_LOOKBACK_DAYS = Number(process.env.RECEPTION_LOOKBACK_DAYS) || 90

export class X3ReceptionRepository {
  /** Réceptions attendues ; si `to` fourni, bornées à `EXTRCPDAT_0 <= to`. */
  async getReceptionFlows(opts?: { to?: string }): Promise<Flow[]> {
    const q = PurchaseOrderLine.query()
      .select(
        'PORDERQ.POHNUM_0',
        'PORDERQ.ITMREF_0',
        'PORDERQ.BPSNUM_0',
        'PORDERQ.QTYSTU_0',
        'PORDERQ.RCPQTYSTU_0',
        'PORDERQ.EXTRCPDAT_0 AS EXTRCPDAT_RAW',
        'PORDERQ.ORDDAT_0 AS ORDDAT_RAW',
        'BPSUPPLIER.BPSNAM_0',
        'ITMMASTER.ITMDES1_0',
      )
      .innerJoin('PORDER', 'PORDER.POHNUM_0', 'PORDERQ.POHNUM_0')
      .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'PORDERQ.ITMREF_0')
      .innerJoin('BPSUPPLIER', 'BPSUPPLIER.BPSNUM_0', 'PORDERQ.BPSNUM_0')
      .where('PORDER.CLEFLG_0', '1')
      .where('ITMMASTER.ITMSTA_0', '1')
      .whereRaw('PORDERQ.QTYSTU_0 > PORDERQ.RCPQTYSTU_0')

    if (opts?.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
      q.whereRaw(`PORDERQ.EXTRCPDAT_0 <= TO_DATE('${opts.to}', 'YYYY-MM-DD')`)
    }

    const rows = await q

    return rows.map(row => {
      const qteCommandee = parseFloat(row.quantiteUs ?? '0') || 0
      const qteRecue = parseFloat(row.quantiteReceptionneeUs ?? '0') || 0
      return {
        article: row.article?.trim() ?? '',
        quantity: qteCommandee - qteRecue,
        direction: 'supply' as const,
        date: parseX3Date(row.$extras.EXTRCPDAT_RAW),
        origin: {
          type: 'reception' as const,
          id: row.noCommande?.trim() ?? '',
          supplier: (row.$extras.BPSNAM_0 as string | null)?.trim() ?? row.fournisseur?.trim() ?? '',
          designation: (row.$extras.ITMDES1_0 as string | null) ?? null,
          categorie: null,
          dateCommande: parseX3Date(row.$extras.ORDDAT_RAW),
          qteCommandee,
          // PORDERQ filtré sur PORDER.CLEFLG=1 → POs confirmées → toujours fermes.
          firm: true,
        },
      }
    })
  }
}

/**
 * Pivote des Flow réceptions déjà fetchés → Map article → ReceptionRecord[].
 *
 * Factorise le motif fetch + filtre + pivot entre la table Ruptures, le suivi réactif
 * (causes de retard) et la vue proactive (goulots). `from` borne le lookback des retards
 * de livraison : on garde les réceptions attendues dans le passé (PO en retard, non reçue)
 * jusqu'à N jours (cf. RECEPTION_LOOKBACK_DAYS). Les PO déjà reçues sont exclues en amont
 * par la requête (WIPTYP=2 WIPSTA IN (1,2), RMNEXTQTY_0 > 0) — le filtre date ne sert PAS
 * à les écarter.
 */
export function groupReceptionsByArticle(flows: Flow[], from?: Date): Map<string, ReceptionRecord[]> {
  const byArticle = new Map<string, ReceptionRecord[]>()
  for (const f of flows) {
    if (f.origin.type !== 'reception') continue
    if (f.date === null) continue
    if (from && f.date < from) continue
    const origin = f.origin as { id?: string; supplier?: string }
    const arr = byArticle.get(f.article) ?? []
    arr.push({
      id: origin.id ?? '',
      article: f.article,
      supplier: origin.supplier ?? '',
      quantity: f.quantity,
      date: f.date,
    })
    byArticle.set(f.article, arr)
  }
  return byArticle
}

export async function loadReceptionsByArticle(from?: Date): Promise<Map<string, ReceptionRecord[]>> {
  const flows = await new X3ReceptionRepository().getReceptionFlows()
  return groupReceptionsByArticle(flows, from)
}
