import type { GammeOperation } from '#app/domain/models/gamme'
import { X3Database } from '#app/x3/client/x3_database'

// CTE+ROW_NUMBER() rejects on X3 SOAP — correlated MIN subquery instead
const SQL_FIRST_OP = `
SELECT
  ITM.ITMREF_0 AS ARTICLE,
  SUBSTR(RO.WST_0, 1, 6) AS POSTE_CHARGE,
  X_WST.TEXTE_0 AS LIBELLE_POSTE,
  RO.CAD_0 AS CADENCE
FROM ITMMASTER ITM
INNER JOIN ROUOPE RO
  ON RO.ITMREF_0 = ITM.ITMREF_0
INNER JOIN ROUTING R
  ON R.ITMREF_0 = RO.ITMREF_0
  AND R.ROUALT_0 = RO.ROUALT_0
LEFT JOIN ATEXTRA X_WST
  ON X_WST.CODFIC_0 = 'WORKSTATIO'
  AND X_WST.ZONE_0 = 'WSTDESAXX'
  AND X_WST.LANGUE_0 = 'FRA'
  AND X_WST.IDENT1_0 = RO.WST_0
WHERE ITM.ITMSTA_0 = 1
  AND ITM.MFGFLG_0 = 2
  AND R.ROUALT_0 = 1
  AND R.USESTA_0 = 2
  AND RO.OPENUM_0 = (
    SELECT MIN(RO2.OPENUM_0)
    FROM ROUOPE RO2
    WHERE RO2.ITMREF_0 = RO.ITMREF_0
      AND RO2.ROUALT_0 = 1
  )
`

/** Toutes les opérations de gamme alt 1 — une ligne par poste de charge. */
const SQL_CHARGE_OPS = `
SELECT
  ITM.ITMREF_0 AS ARTICLE,
  SUBSTR(RO.WST_0, 1, 6) AS POSTE_CHARGE,
  X_WST.TEXTE_0 AS LIBELLE_POSTE,
  RO.CAD_0 AS CADENCE
FROM ITMMASTER ITM
INNER JOIN ROUOPE RO
  ON RO.ITMREF_0 = ITM.ITMREF_0
INNER JOIN ROUTING R
  ON R.ITMREF_0 = RO.ITMREF_0
  AND R.ROUALT_0 = RO.ROUALT_0
LEFT JOIN ATEXTRA X_WST
  ON X_WST.CODFIC_0 = 'WORKSTATIO'
  AND X_WST.ZONE_0 = 'WSTDESAXX'
  AND X_WST.LANGUE_0 = 'FRA'
  AND X_WST.IDENT1_0 = RO.WST_0
WHERE ITM.ITMSTA_0 = 1
  AND ITM.MFGFLG_0 = 2
  AND R.ROUALT_0 = 1
  AND R.USESTA_0 = 2
ORDER BY ITM.ITMREF_0, RO.OPENUM_0
`

type RawRow = Record<string, string | null>

function mapRows(rows: RawRow[]): GammeOperation[] {
  return rows.map((row) => ({
    article: row.ARTICLE?.trim() ?? '',
    workstation: row.POSTE_CHARGE?.trim() ?? '',
    workstationLabel: row.LIBELLE_POSTE?.trim() ?? '',
    rate: Number.parseFloat(row.CADENCE ?? '0') || 0,
  }))
}

export class X3GammeRepository {
  /** Première opération par article (rétro-compat tests / usages legacy). */
  async getFirstOperations(): Promise<GammeOperation[]> {
    const db = new X3Database()
    try {
      return mapRows(await db.raw(SQL_FIRST_OP))
    } finally {
      await db.destroy()
    }
  }

  /** Toutes les opérations de charge par article (issue #96). */
  async getChargeOperations(): Promise<GammeOperation[]> {
    const db = new X3Database()
    try {
      return mapRows(await db.raw(SQL_CHARGE_OPS))
    } finally {
      await db.destroy()
    }
  }
}
