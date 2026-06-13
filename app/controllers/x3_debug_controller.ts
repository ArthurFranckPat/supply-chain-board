import type { HttpContext } from '@adonisjs/core/http'
import { BaseModel } from '@adonisjs/lucid/orm'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import ItemMaster from '#models/x3/itmmaster'
import Bom from '#models/x3/bom'
import BomDetail from '#models/x3/bomd'
import MfgHead from '#models/x3/mfghead'
import MfgItem from '#models/x3/mfgitm'
import MfgMat from '#models/x3/mfgmat'
import MfgOpe from '#models/x3/mfgope'
import SalesOrder from '#models/x3/sorder'
import SalesOrderLine from '#models/x3/sorderq'
import PurchaseOrder from '#models/x3/porder'
import PurchaseOrderLine from '#models/x3/porderq'
import Stock from '#models/x3/stock'
import StockAlloc from '#models/x3/stoall'
import ItemMovement from '#models/x3/itmmvt'
import StockJournal from '#models/x3/stojou'
import RoutingOp from '#models/x3/rouope'
import WorkStation from '#models/x3/workstatio'
import ItemFacility from '#models/x3/itmfacilit'
import Orders from '#models/x3/orders'

const MODEL_COLS: Record<string, string[]> = {
  ITMMASTER:  ['ITMREF_0', 'ITMDES1_0', 'ITMDES2_0', 'TCLCOD_0', 'ITMSTA_0', 'STU_0', 'PCU_0', 'PUU_0', 'MFGFLG_0', 'PURFLG_0', 'SALFLG_0', 'PLANNER_0', 'CREDAT_0', 'UPDDAT_0'],
  BOM:        ['ITMREF_0', 'BOMALT_0', 'QTYCOD_0', 'CREDAT_0', 'UPDDAT_0'],
  BOMD:       ['ITMREF_0', 'BOMALT_0', 'BOMSEQ_0', 'CPNITMREF_0', 'LIKQTY_0', 'LIKQTYCOD_0', 'BOMSTRDAT_0', 'BOMENDDAT_0', 'CPNOPE_0'],
  MFGHEAD:    ['MFGNUM_0', 'MFGSTA_0', 'EXTQTY_0', 'AVAMFGQTY_0', 'CPLQTY_0', 'EARSTRDAT_0', 'ENDDAT_0', 'CREDAT_0', 'UPDDAT_0'],
  MFGITM:     ['MFGNUM_0', 'ITMREF_0', 'EXTQTY_0', 'RMNEXTQTY_0', 'UOMEXTQTY_0', 'BOMALT_0', 'CREDAT_0'],
  MFGMAT:     ['MFGNUM_0', 'ITMREF_0', 'LIKQTY_0', 'LIKQTYCOD_0', 'ALLQTY_0', 'ALLSTA_0', 'CREDAT_0'],
  MFGOPE:     ['MFGNUM_0', 'ALTOPECOD_0', 'SCOITMREF_0', 'CREDAT_0'],
  SORDER:     ['SOHNUM_0', 'SOHTYP_0', 'BPCORD_0', 'BPCNAM_0', 'ORDDAT_0', 'SOHNUMEND_0', 'CREDAT_0', 'UPDDAT_0'],
  SORDERQ:    ['SOHNUM_0', 'SOPLIN_0', 'ITMREF_0', 'QTYSTU_0', 'DLVQTYSTU_0', 'INVQTYSTU_0', 'ALLQTYSTU_0', 'ORDDAT_0', 'CREDAT_0'],
  PORDER:     ['POHNUM_0', 'POHTYP_0', 'BPSNUM_0', 'ORDDAT_0', 'CREDAT_0', 'UPDDAT_0'],
  PORDERQ:    ['POHNUM_0', 'POPLIN_0', 'ITMREF_0', 'QTYSTU_0', 'RCPQTYSTU_0', 'INVQTYSTU_0', 'ORDDAT_0', 'CREDAT_0'],
  STOCK:      ['ITMREF_0', 'STOFCY_0', 'LOC_0', 'LOCCAT_0', 'LOCTYP_0', 'QTYSTU_0', 'QTYSTUACT_0', 'CREDAT_0'],
  STOALL:     ['ITMREF_0', 'VCRNUM_0', 'LOC_0', 'QTYSTU_0', 'QTYSTUACT_0', 'ALLDAT_0'],
  ITMMVT:     ['ITMREF_0', 'VCRNUM_0', 'CFGVCRNUM_0'],
  STOJOU:     ['ITMREF_0', 'VCRNUM_0', 'LOC_0', 'QTYSTU_0', 'VCRNUMORI_0', 'VCRNUMREG_0'],
  ROUOPE:     ['ITMREF_0', 'ALTOPECOD_0', 'SCOITMREF_0'],
  WORKSTATIO: ['WSTDES_0', 'WCRFCY_0'],
  ITMFACILIT: ['ITMREF_0', 'STOFCY_0', 'REOFCY_0'],
  ORDERS:     ['VCRNUM_0', 'ITMREF_0', 'EXTQTY_0', 'RMNEXTQTY_0', 'BOMALT_0', 'BOMALTTYP_0', 'VCRNUMORI_0'],
}

const MODELS: [string, typeof BaseModel][] = [
  ['ITMMASTER (Articles)', ItemMaster],
  ['BOM (Nomenclatures entêtes)', Bom],
  ['BOMD (Nomenclatures lignes)', BomDetail],
  ['MFGHEAD (OF entêtes)', MfgHead],
  ['MFGITM (OF articles)', MfgItem],
  ['MFGMAT (OF matières)', MfgMat],
  ['MFGOPE (OF opérations)', MfgOpe],
  ['SORDER (Commandes vente)', SalesOrder],
  ['SORDERQ (Lignes commandes vente)', SalesOrderLine],
  ['PORDER (Commandes achat)', PurchaseOrder],
  ['PORDERQ (Lignes commandes achat)', PurchaseOrderLine],
  ['STOCK (Stocks)', Stock],
  ['STOALL (Allocations stock)', StockAlloc],
  ['ITMMVT (Mouvements)', ItemMovement],
  ['STOJOU (Journal stock)', StockJournal],
  ['ROUOPE (Gammes opérations)', RoutingOp],
  ['WORKSTATIO (Postes de charge)', WorkStation],
  ['ITMFACILIT (Articles par site)', ItemFacility],
  ['ORDERS (Flux supply)', Orders],
]

async function loadSection(db: X3Database, title: string, Model: typeof BaseModel) {
  const key = Model.table
  const cols = MODEL_COLS[key] ?? []
  try {
    const sql = `SELECT ${cols.join(', ')} FROM ${key} WHERE ROWNUM <= 5`
    const raw: Record<string, string | null>[] = await db.raw(sql)
    const rows = raw.map((r) => {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(r)) {
        if (v && k.endsWith('DAT_0')) {
          const d = parseX3Date(v)
          out[k] = d ? d.toLocaleDateString('fr-FR') : v
        } else {
          out[k] = v ?? ''
        }
      }
      return out
    })
    const colNames = rows.length > 0 ? Object.keys(rows[0]) : cols
    return { key, title, rows, cols: colNames, error: null }
  } catch (e: any) {
    return { key, title, rows: [], cols: [], error: e.message }
  }
}

export default class X3DebugController {
  async index({ view, request }: HttpContext) {
    const allModels = MODELS.map(([t, M]) => ({ key: M.table, title: t }))
    const modelFilter = request.input('model') as string | undefined

    if (!modelFilter) {
      return view.render('x3_debug', { allModels })
    }

    const target = MODELS.find(([, M]) => M.table === modelFilter)
    if (!target) {
      return view.render('x3_debug', { allModels })
    }

    const db = new X3Database()
    try {
      const section = await loadSection(db, target[0], target[1])
      return view.render('x3_debug_section', { section })
    } finally {
      await db.destroy()
    }
  }
}
