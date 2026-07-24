import type { Flow } from '#app/domain/models/flow'
import type { ReceptionInput } from '#app/domain/receptions'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import PurchaseOrderLine from '#models/x3/porderq'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Borne date pour la requête planning réceptions : on filtre sur la date retenue
 * (ZDATCOF si renseignée, sinon EXTRCPDAT) — COALESCE côté Oracle évite de rater les
 * lignes dont seule la date prévue est renseignée. Accepte `YYYY-MM-DD`.
 */
function dateRangeClause(from?: string, to?: string): string {
  const clauses: string[] = []
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    clauses.push(
      `((PORDERQ.ZDATCOF_0 IS NOT NULL AND PORDERQ.ZDATCOF_0 >= TO_DATE('${from}', 'YYYY-MM-DD')) OR (PORDERQ.ZDATCOF_0 IS NULL AND PORDERQ.EXTRCPDAT_0 >= TO_DATE('${from}', 'YYYY-MM-DD')))`
    )
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    clauses.push(
      `((PORDERQ.ZDATCOF_0 IS NOT NULL AND PORDERQ.ZDATCOF_0 <= TO_DATE('${to}', 'YYYY-MM-DD')) OR (PORDERQ.ZDATCOF_0 IS NULL AND PORDERQ.EXTRCPDAT_0 <= TO_DATE('${to}', 'YYYY-MM-DD')))`
    )
  }
  return clauses.length ? clauses.join(' AND ') : ''
}

/**
 * Fenêtre arrière (jours) pour les réceptions en retard de livraison. Une PO dont la date
 * d'arrivée prévue est dans le passé mais non reçue (retard fournisseur) reste une couverture
 * potentielle — on l'inclut jusqu'à N jours en arrière pour capter ces retards. Au-delà, une
 * PO toujours ouverte est considérée comme un reliquat fantôme (visserie, etc.) à ignorer.
 */
export const RECEPTION_LOOKBACK_DAYS = Number(process.env.RECEPTION_LOOKBACK_DAYS) || 90

/**
 * Plancher anti « reliquat fantôme » (issue #43, point 1) : une réception OVERDUE (attendue
 * dans le passé, non reçue) ne compte dans la couverture d'une rupture que si sa qté ≥ ce
 * plancher — les reliquats morts (visserie, petites pièces) ne couvrent plus faussement un
 * petit manque. Les réceptions futures comptent toujours. 0 = désactivé (comportement legacy).
 */
export const RECEPTION_OVERDUE_MIN_QTY = Number(process.env.RECEPTION_OVERDUE_MIN_QTY) || 0

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
        'ITMMASTER.ITMDES1_0'
      )
      .innerJoin('PORDER', 'PORDER.POHNUM_0', 'PORDERQ.POHNUM_0')
      .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'PORDERQ.ITMREF_0')
      .innerJoin('BPSUPPLIER', 'BPSUPPLIER.BPSNUM_0', 'PORDERQ.BPSNUM_0')
      .where('PORDER.CLEFLG_0', '1')
      .where('PORDERQ.LINCLEFLG_0', '1')
      .where('ITMMASTER.ITMSTA_0', '1')
      .whereRaw('PORDERQ.QTYSTU_0 > PORDERQ.RCPQTYSTU_0')

    if (opts?.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
      q.whereRaw(`PORDERQ.EXTRCPDAT_0 <= TO_DATE('${opts.to}', 'YYYY-MM-DD')`)
    }

    const rows = await q

    return rows.map((row) => {
      const qteCommandee = Number.parseFloat(row.quantiteUs ?? '0') || 0
      const qteRecue = Number.parseFloat(row.quantiteReceptionneeUs ?? '0') || 0
      return {
        article: row.article?.trim() ?? '',
        quantity: qteCommandee - qteRecue,
        direction: 'supply' as const,
        date: parseX3Date(row.$extras.EXTRCPDAT_RAW),
        origin: {
          type: 'reception' as const,
          id: row.noCommande?.trim() ?? '',
          supplier:
            (row.$extras.BPSNAM_0 as string | null)?.trim() ?? row.fournisseur?.trim() ?? '',
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

  /**
   * Planning des réceptions attendues (vue « Réceptions ») : une ligne par ligne de
   * commande non soldée, enrichie des coeffs de conditionnement (PCUSTUCOE_0/1) pour le
   * calcul du nombre de palettes côté domaine (cf. app/domain/receptions.ts).
   *
   * Mêmes filtres que getReceptionFlows (CLEFLG=1, ITMSTA=1, reste à recevoir > 0), plus
   * une borne optionnelle sur la date retenue (ZDATCOF si renseignée, sinon EXTRCPDAT).
   * Les lignes hors plage ne sont pas renvoyées (contrairement à getReceptionFlows qui
   * ne borne pas, car appelé par la couverture ruptures avec un lookback spécifique).
   */
  async getReceptionPlanning(opts?: { from?: string; to?: string }): Promise<ReceptionInput[]> {
    const q = PurchaseOrderLine.query()
      .select(
        'PORDERQ.POHNUM_0',
        'PORDERQ.ITMREF_0',
        'PORDERQ.BPSNUM_0',
        'PORDERQ.QTYSTU_0',
        'PORDERQ.RCPQTYSTU_0',
        'PORDERQ.EXTRCPDAT_0 AS EXTRCPDAT_RAW',
        'PORDERQ.ZDATCOF_0 AS ZDATCOF_RAW',
        'BPSUPPLIER.BPSNAM_0',
        'ITMMASTER.ITMDES1_0',
        'ITMMASTER.PCUSTUCOE_0 AS PCU_STU_COE',
        // PCUSTUCOE_1 = US par palette (chaque PCUSTUCOE_n ramène son conditionnement
        // à l'unité de stock ; ils ne se composent pas). Alias historique conservé.
        'ITMMASTER.PCUSTUCOE_1 AS UC_PAR_PAL'
      )
      .innerJoin('PORDER', 'PORDER.POHNUM_0', 'PORDERQ.POHNUM_0')
      .innerJoin('ITMMASTER', 'ITMMASTER.ITMREF_0', 'PORDERQ.ITMREF_0')
      .innerJoin('BPSUPPLIER', 'BPSUPPLIER.BPSNUM_0', 'PORDERQ.BPSNUM_0')
      .where('PORDER.CLEFLG_0', '1')
      .where('PORDERQ.LINCLEFLG_0', '1')
      .where('ITMMASTER.ITMSTA_0', '1')
      .whereRaw('PORDERQ.QTYSTU_0 > PORDERQ.RCPQTYSTU_0')
      // Onglet Réceptions : ne garder que les commandes fournisseurs "CG" (préfixe métier).
      .whereRaw("PORDERQ.POHNUM_0 LIKE 'CG%'")
      // Exclure les catégories d'article commençant par X, Y ou Z.
      .whereRaw(
        "ITMMASTER.TCLCOD_0 NOT LIKE 'X%' AND ITMMASTER.TCLCOD_0 NOT LIKE 'Y%' AND ITMMASTER.TCLCOD_0 NOT LIKE 'Z%'"
      )

    const rangeClause = dateRangeClause(opts?.from, opts?.to)
    if (rangeClause) q.whereRaw(rangeClause)

    const rows = await q

    return rows.map((row) => {
      const qteCommandee = Number.parseFloat(row.quantiteUs ?? '0') || 0
      const qteRecue = Number.parseFloat(row.quantiteReceptionneeUs ?? '0') || 0
      const toNum = (v: unknown): number | null => {
        const n = Number.parseFloat(String(v ?? ''))
        return Number.isFinite(n) ? n : null
      }
      return {
        noCommande: row.noCommande?.trim() ?? '',
        article: row.article?.trim() ?? '',
        designation: (row.$extras.ITMDES1_0 as string | null)?.trim() ?? null,
        fournisseur: row.fournisseur?.trim() ?? '',
        fournisseurNom:
          (row.$extras.BPSNAM_0 as string | null)?.trim() ?? row.fournisseur?.trim() ?? '',
        qteUs: qteCommandee - qteRecue,
        datePrevue: parseX3Date(row.$extras.EXTRCPDAT_RAW),
        dateConfirmee: parseX3Date(row.$extras.ZDATCOF_RAW),
        pcuStuCoe: toNum(row.$extras.PCU_STU_COE),
        ucParPal: toNum(row.$extras.UC_PAR_PAL),
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
export function groupReceptionsByArticle(
  flows: Flow[],
  from?: Date
): Map<string, ReceptionRecord[]> {
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

export async function loadReceptionsByArticle(
  from?: Date
): Promise<Map<string, ReceptionRecord[]>> {
  const flows = await new X3ReceptionRepository().getReceptionFlows()
  return groupReceptionsByArticle(flows, from)
}
