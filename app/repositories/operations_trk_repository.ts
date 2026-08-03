import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Pointages de suivi de fabrication — MFGOPETRK (#119, lot 1).
 *
 * Source du passé constaté du cockpit poste. Relevé en PROD le 03/08/2026 :
 * ~90 000 lignes sur 12 mois glissants (3 500 à 12 800 par mois) — le volume
 * est négligeable pour la réplique, c'est le découpage SOAP qui impose le
 * chunking, pas la taille.
 *
 * Chunké par bloc de `CHUNK_DAYS` jours sur `IPTDAT_0` (date d'imputation),
 * même motif que `StockFluxRepository` : le pull complet dépasse le seuil de
 * lignes du web service SOAP Syracuse (`resultXml` nil). Une semaine pleine
 * (~5-6k lignes mesurées OK sur STOJOU, seuil d'échec ~20k+) laisse une marge
 * réelle sous un pic de rattrapage de pointages.
 *
 * ## Colonnes
 *
 * Tout ce que l'issue #119 liste est ingéré, y compris ce qui n'est PAS exposé
 * en v1 (rebut, panne, arrêt, équipe, matricule) : les rebrancher plus tard ne
 * coûtera qu'une migration de lecteur, pas une ré-ingestion.
 *
 * L'article PRODUIT vient de MFGITM (LEFT JOIN), pas de `MFGOPETRK.ITMREF_0`
 * que le dictionnaire documente « Gamme ». Le champ gamme reste ingéré pour
 * pouvoir comparer un jour, jamais lu en attendant.
 *
 * ## Site
 *
 * `AE1` en dur, comme `StockFluxRepository` : l'app est mono-site, le cockpit
 * aussi.
 */

const SITE = 'AE1'

const CHUNK_DAYS = 7

type RawRow = Record<string, string | null>

export interface OperationsTrkRow {
  numOf: string
  openum: number
  /** Date d'imputation (IPTDAT_0), en ISO YYYY-MM-DD. */
  iptdatIso: string
  /** Poste réalisé (CPLWST_0) — égalité stricte au filtre, jamais sommé. */
  cplwst: string
  /** Quantité réalisée (CPLQTY_0) — 0 sur les pointages de pur réglage. */
  cplqty: number
  /** Rebut (REJCPLQTY_0) — ingéré, non exposé en v1. */
  rejcplqty: number
  /** Temps opératoire pointé (CPLOPETIM_0), heures. */
  opetim: number
  /** Temps de réglage pointé (CPLSETTIM_0), heures. */
  settim: number
  /** MFGOPETRK.ITMREF_0, documenté « Gamme » — ingéré, jamais lu en v1. */
  itmref: string
  /** Article produit (MFGITM.ITMREF_0) — null si l'OF n'a pas de détail. */
  itmrefOf: string | null
  /** Matricule (EMPNUM_0) — donnée nominative, ingérée, non exposée en v1. */
  empnum: string | null
  /** Panne (X4PANFLG_0) — jamais alimenté en PROD, ingéré, non exposé. */
  x4panflg: number | null
  /** Arrêt de production (X4ARRETPROD_0) — jamais alimenté, ingéré, non exposé. */
  x4arretprod: number | null
  /** Équipe (XEQUIPE_0) — `8` sur tout l'échantillon relevé, champ mort probable. */
  xequipe: string | null
}

/** Bornes locales → YYYYMMDD. Jamais `toISOString()` : en Europe/Paris, minuit
 *  local = 22:00 UTC la veille, et la fenêtre d'ingestion perdait le jour courant
 *  (revue #119). */
function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/** ISO UTC depuis une date parsée en zone UTC (`parseX3Date`). Sentinelle X3
 *  « 31-DEC-99 » et dates illisibles → null (cf. of_a_solder_loader). */
function isoUtcDay(d: Date | null): string | null {
  if (!d) return null
  if (d.getUTCFullYear() < 2000) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function num(raw: string | null): number {
  if (raw === null) return 0
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

/** Borne haute EXCLUSIVE (`<`), comme le reste du codage X3 sur ce repo. */
const buildPointagesSql = (fromStr: string, toExclusiveStr: string) => `
SELECT
  T.MFGNUM_0        AS NUMOF,
  T.OPENUM_0        AS OPENUM,
  TRUNC(T.IPTDAT_0) AS IPTDAT,
  T.CPLWST_0        AS CPLWST,
  T.CPLQTY_0        AS CPLQTY,
  T.REJCPLQTY_0     AS REJCPLQTY,
  T.CPLOPETIM_0     AS OPETIM,
  T.CPLSETTIM_0     AS SETTIM,
  T.ITMREF_0        AS ITMREF,
  I.ITMREF_0        AS ITMREF_OF,
  T.EMPNUM_0        AS EMPNUM,
  T.X4PANFLG_0      AS X4PANFLG,
  T.X4ARRETPROD_0   AS X4ARRETPROD,
  T.XEQUIPE_0       AS XEQUIPE
FROM MFGOPETRK T
LEFT JOIN MFGITM I ON I.MFGNUM_0 = T.MFGNUM_0
WHERE T.MFGFCY_0 = '${SITE}'
  AND T.IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD')
  AND T.IPTDAT_0 < TO_DATE('${toExclusiveStr}','YYYYMMDD')
`

export class X3OperationsTrkRepository {
  /**
   * Pointages du site sur `[from, to]` inclusif des deux côtés — `to` est un
   * jour, pas un instant. Les lignes sans date d'imputation lisible sont
   * écartées : sans date, aucune maille ne peut les porter.
   */
  async getPointages(from: Date, to: Date): Promise<OperationsTrkRow[]> {
    const toExclusive = addDays(to, 1)
    const out: OperationsTrkRow[] = []

    const db = new X3Database()
    try {
      let chunkStart = from
      while (chunkStart < toExclusive) {
        const chunkEnd = new Date(
          Math.min(addDays(chunkStart, CHUNK_DAYS).getTime(), toExclusive.getTime())
        )
        const rows: RawRow[] = await db.raw(
          buildPointagesSql(toYYYYMMDD(chunkStart), toYYYYMMDD(chunkEnd))
        )
        for (const r of rows) {
          const numOf = (r.NUMOF ?? '').trim()
          const cplwst = (r.CPLWST ?? '').trim()
          const iptdatIso = isoUtcDay(parseX3Date(r.IPTDAT))
          // Un pointage sans OF, sans poste ou sans date n'a aucun usage possible
          // au cockpit : écarté à l'extraction plutôt qu'ingéré pour rien.
          if (!numOf || !cplwst || !iptdatIso) continue
          out.push({
            numOf,
            openum: Math.round(num(r.OPENUM)),
            iptdatIso,
            cplwst,
            cplqty: num(r.CPLQTY),
            rejcplqty: num(r.REJCPLQTY),
            opetim: num(r.OPETIM),
            settim: num(r.SETTIM),
            itmref: (r.ITMREF ?? '').trim(),
            itmrefOf: (r.ITMREF_OF ?? '').trim() || null,
            empnum: (r.EMPNUM ?? '').trim() || null,
            x4panflg: numOrNull(r.X4PANFLG),
            x4arretprod: numOrNull(r.X4ARRETPROD),
            xequipe: (r.XEQUIPE ?? '').trim() || null,
          })
        }
        chunkStart = chunkEnd
      }
    } finally {
      await db.destroy()
    }
    return out
  }
}
