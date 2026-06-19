import type { Flow } from '#app/domain/models/flow'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import PurchaseOrderLine from '#models/x3/porderq'
import { parseX3Date } from '#app/x3/utils/parse_date'

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
        },
      }
    })
  }
}

/**
 * Charge les réceptions d'achat attendues, regroupées par article composant.
 *
 * Factorise le motif fetch + filtre + pivot dupliqué entre la table Ruptures
 * (scheduler), le suivi réactif (causes de retard) et la vue proactive (goulots).
 * `from` exclut les réceptions déjà arrivées (consommées dans le stock, elles
 * fausseraient la couverture) ; sans borne haute (une réception au-delà de la
 * fenêtre reste utile pour détecter un retard d'arrivée).
 */
export async function loadReceptionsByArticle(from?: Date): Promise<Map<string, ReceptionRecord[]>> {
  const flows = await new X3ReceptionRepository().getReceptionFlows()
  const byArticle = new Map<string, ReceptionRecord[]>()
  for (const f of flows) {
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
