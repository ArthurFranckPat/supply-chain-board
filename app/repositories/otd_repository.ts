import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

export type OtdMode = 'demandee' | 'acceptee'

const DATE_FIELD: Record<OtdMode, string> = {
  demandee: 'X4HSHIDAT_0',
  acceptee: 'SHIDAT_0',
}

const buildSql = (fromStr: string, toStr: string, mode: OtdMode) => {
  const f = DATE_FIELD[mode]
  return `
SELECT
  Q.SOHNUM_0,
  H.BPCNAM_0,
  Q.ITMREF_0,
  ROO.WST_0       AS POSTE_DE_CHARGE,
  Q.${f}          AS DATE_EXP,
  SUM(Q.QTY_0)    AS QTE_COMMANDEE,
  SUM(Q.DLVQTY_0) AS QTE_TOTAL_LIVREE,
  CASE WHEN SUM(Q.DLVQTY_0) >= SUM(Q.QTY_0) THEN 'OUI' ELSE 'NON' END AS EST_COMPLET,
  CASE
    WHEN (MAX(DEL.MAX_SHIDAT) <= (Q.${f} +
      CASE
        WHEN TO_CHAR(Q.${f}, 'D') = '5' THEN 3
        WHEN TO_CHAR(Q.${f}, 'D') = '6' THEN 2
        ELSE 1
      END
    ) AND MAX(DEL.MAX_SHIDAT) > TO_DATE('16000101','YYYYMMDD')) THEN 'OUI'
    ELSE 'NON'
  END AS EST_PONCTUEL,
  CASE
    WHEN (SUM(Q.DLVQTY_0) >= SUM(Q.QTY_0) AND MAX(DEL.MAX_SHIDAT) <= (Q.${f} +
      CASE
        WHEN TO_CHAR(Q.${f}, 'D') = '5' THEN 3
        WHEN TO_CHAR(Q.${f}, 'D') = '6' THEN 2
        ELSE 1
      END
    ) AND MAX(DEL.MAX_SHIDAT) > TO_DATE('16000101','YYYYMMDD')) THEN 'OUI'
    ELSE 'NON'
  END AS EST_OTIF
FROM SORDERQ Q
INNER JOIN SORDER H ON H.SOHNUM_0 = Q.SOHNUM_0
INNER JOIN ITMMASTER I ON I.ITMREF_0 = Q.ITMREF_0
LEFT JOIN (
  SELECT L.SOHNUM_0, L.SOPLIN_0, L.SOQSEQ_0, MAX(D.SHIDAT_0) AS MAX_SHIDAT
  FROM SDELIVERYD L
  JOIN SDELIVERY D ON D.SDHNUM_0 = L.SDHNUM_0
  GROUP BY L.SOHNUM_0, L.SOPLIN_0, L.SOQSEQ_0
) DEL ON DEL.SOHNUM_0 = Q.SOHNUM_0 AND DEL.SOPLIN_0 = Q.SOPLIN_0 AND DEL.SOQSEQ_0 = Q.SOQSEQ_0
LEFT JOIN ROUOPE ROO
  ON ROO.FCY_0 = H.STOFCY_0
  AND ROO.ITMREF_0 = I.ITMREF_0
  AND ROO.ROUALT_0 = 1
  AND ROO.OPENUM_0 = (
    SELECT MIN(ROO1.OPENUM_0) FROM ROUOPE ROO1
    WHERE ROO1.FCY_0 = H.STOFCY_0 AND ROO1.ITMREF_0 = I.ITMREF_0 AND ROO1.ROUALT_0 = 1
  )
WHERE I.ITMSTA_0 = 1
AND Q.${f} BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY Q.SOHNUM_0, H.BPCNAM_0, Q.ITMREF_0, ROO.WST_0, Q.X4HDEMDLVD_0, Q.${f}
ORDER BY Q.${f} DESC
`
}

type RawRow = Record<string, string | null>

export interface OtdLigneDtl {
  numCommande: string
  client: string
  article: string
  posteDeCharge: string | null
  dateExpHisto: string
  qteCmde: number
  qteLivree: number
  estComplet: boolean
  estPonctuel: boolean
}

export interface OtdKpi {
  label: string
  mode: OtdMode
  nbTotal: number
  nbOtif: number
  tauxOtif: number
  lignesNon: OtdLigneDtl[]
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toInt(v: string | null): number {
  return Number.parseInt(v ?? '0', 10) || 0
}

/** Normalise comme le front (fold) : sans accents ni casse, pour un filtre client cohérent. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function fmtDate(raw: string | null): string {
  const d = parseX3Date(raw)
  if (!d) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastWorkdayBefore(date: Date): Date {
  let d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1))
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1))
  }
  return d
}

/** Périodes OTD à calculer pour le jour de référence (UTC). */
export function resolveOtdPeriods(ref: Date): Array<{ from: Date; to: Date; label: string }> {
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()
  const dom = ref.getUTCDate()
  const dow = ref.getUTCDay()

  const isFirstWorkdayOfMonth = (() => {
    if (dow === 0 || dow === 6) return false
    for (let d = 1; d < dom; d++) {
      const wd = new Date(Date.UTC(y, m, d)).getUTCDay()
      if (wd !== 0 && wd !== 6) return false
    }
    return true
  })()

  if (isFirstWorkdayOfMonth) {
    const lastWorkday = lastWorkdayBefore(ref)
    const firstOfLastMonth = new Date(Date.UTC(y, m - 1, 1))
    const lastOfLastMonth = new Date(Date.UTC(y, m, 0))
    return [
      { from: lastWorkday, to: lastWorkday, label: 'J-1' },
      { from: firstOfLastMonth, to: lastOfLastMonth, label: 'M-1' },
    ]
  }

  if (dow === 1) {
    const friday = new Date(Date.UTC(y, m, dom - 3))
    const lastWeekMon = new Date(Date.UTC(y, m, dom - 7))
    const lastWeekSun = new Date(Date.UTC(y, m, dom - 1))
    return [
      { from: friday, to: friday, label: 'J-1' },
      { from: lastWeekMon, to: lastWeekSun, label: 'S-1' },
    ]
  }

  const yesterday = new Date(Date.UTC(y, m, dom - 1))
  return [{ from: yesterday, to: yesterday, label: 'J-1' }]
}

export class OtdRepository {
  async getOtd(
    from: Date,
    to: Date,
    label: string,
    mode: OtdMode,
    client?: string
  ): Promise<OtdKpi> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(to), mode))
    } finally {
      await db.destroy()
    }

    // Filtre client optionnel : on restreint les lignes AVANT le calcul du KPI
    // (taux, nbOtif, nbTotal) pour que le chiffre OTD reflète le client filtré.
    const needle = client ? fold(client.trim()) : ''
    const scoped = needle
      ? rows.filter((r) => fold(String(r.BPCNAM_0 ?? '')).includes(needle))
      : rows

    let nbOtif = 0
    const lignesNon: OtdLigneDtl[] = []

    for (const row of scoped) {
      if (row.EST_OTIF === 'OUI') {
        nbOtif++
      } else {
        lignesNon.push({
          numCommande: row.SOHNUM_0?.trim() ?? '',
          client: row.BPCNAM_0?.trim() ?? '',
          article: row.ITMREF_0?.trim() ?? '',
          posteDeCharge: row.POSTE_DE_CHARGE?.trim() || null,
          dateExpHisto: fmtDate(row.DATE_EXP),
          qteCmde: toInt(row.QTE_COMMANDEE),
          qteLivree: toInt(row.QTE_TOTAL_LIVREE),
          estComplet: row.EST_COMPLET === 'OUI',
          estPonctuel: row.EST_PONCTUEL === 'OUI',
        })
      }
    }

    const nbTotal = scoped.length
    const tauxOtif = nbTotal > 0 ? Math.round((nbOtif / nbTotal) * 1000) / 10 : 0

    return { label, mode, nbTotal, nbOtif, tauxOtif, lignesNon }
  }
}
