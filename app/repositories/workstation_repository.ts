import type { Workstation } from '#app/domain/models/workstation'
import { X3Database } from '#app/x3/client/x3_database'

/**
 * Postes de charge X3 (WORKSTATIO) + schéma horaire (TABWEEDIA) aplati.
 *
 * Un poste → un schéma (`WORKSTATIO.TWD_0 = TABWEEDIA.TWD_0`) ; un schéma sert
 * plusieurs postes. LEFT JOIN : un poste sans schéma sort avec capacités nulles.
 * Tous types (`WSTTYP_0` 1/2/3) — pas de filtre, l'overlay se restreint côté charge.
 *
 * MCD : WORKSTATIO + TABWEEDIA (DAYCAP_0..6 = Lun→Dim).
 */
const SQL = `
SELECT
  W.WST_0     AS CODE,
  W.WSTDES_0  AS DESCR,
  W.WSTTYP_0  AS WSTTYP,
  W.WSTNBR_0  AS WSTNBR,
  W.EFF_0     AS EFF,
  W.USE_0     AS USEPCT,
  W.SHR_0     AS SHR,
  W.TWD_0     AS TWD,
  W.STOLOC_0  AS STOLOC,
  W.WCR_0     AS WCR,
  W.WCRFCY_0  AS WCRFCY,
  T.DAYCAP_0  AS D0,
  T.DAYCAP_1  AS D1,
  T.DAYCAP_2  AS D2,
  T.DAYCAP_3  AS D3,
  T.DAYCAP_4  AS D4,
  T.DAYCAP_5  AS D5,
  T.DAYCAP_6  AS D6
FROM WORKSTATIO W
LEFT JOIN TABWEEDIA T ON T.TWD_0 = W.TWD_0
`

type RawRow = Record<string, string | number | null>

const num = (v: string | number | null, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}
const str = (v: string | number | null): string => String(v ?? '').trim()

export class X3WorkstationRepository {
  async getAll(): Promise<Workstation[]> {
    const db = new X3Database()
    try {
      const result = await db.raw(SQL)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])
      return rows
        .map((r) => ({
          code: str(r.CODE),
          description: str(r.DESCR),
          type: num(r.WSTTYP, 1),
          parallelUnits: num(r.WSTNBR, 1),
          efficiency: num(r.EFF, 100),
          utilization: num(r.USEPCT, 100),
          scrap: num(r.SHR, 0),
          scheduleCode: str(r.TWD),
          dailyCapacity: [
            num(r.D0),
            num(r.D1),
            num(r.D2),
            num(r.D3),
            num(r.D4),
            num(r.D5),
            num(r.D6),
          ],
          stockLocation: str(r.STOLOC),
          workCenter: str(r.WCR),
          facility: str(r.WCRFCY),
        }))
        .filter((w) => w.code)
    } finally {
      await db.destroy()
    }
  }
}
