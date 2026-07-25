/** SOAP response parsing utilities — pure functions, no I/O.
 *
 * Ported from x3_sql.py: parse_response, format_results.
 */

export interface SoapResponse {
  status: number | null
  data: string[]
  count: number
  error: string
  /** Diagnostic X3 par appel (issue #39, WI-1) — présent si l'enveloppe le renvoie. */
  tech?: TechnicalInfos
}

/**
 * Décomposition de latence renvoyée par X3 dans `<technicalInfos>` (CAdxTechnicalInfos).
 * Durées en millisecondes côté serveur X3. Attribue le temps d'un appel SOAP à sa vraie
 * cause (issue #39) :
 *  - loadWebs   : init/chargement du client web service → cold start du pool.
 *  - poolWait   : attente d'un client libre → contention.
 *  - poolDistrib: sélection du client par le distributeur.
 *  - poolExec   : exécution réelle (le SQL).
 *  - total      : total serveur (hors réseau/transport, mesuré côté app).
 * `poolEntryIdx` = index du client qui a servi → réutilisable en `poolId` (WI-3).
 */
export interface TechnicalInfos {
  poolEntryIdx: number | null
  loadWebs: number | null
  poolWait: number | null
  poolDistrib: number | null
  poolExec: number | null
  poolRequest: number | null
  total: number | null
}

/** Extrait un entier d'un champ `<name ...>123</name>` du XML brut (null si absent). */
function intField(raw: string, name: string): number | null {
  const m = raw.match(new RegExp(`<${name}[^>]*>(-?\\d+)</${name}>`))
  return m ? Number.parseInt(m[1], 10) : null
}

/** Parse le bloc `<technicalInfos>` du SOAP brut. Undefined si absent. */
export function parseTechnicalInfos(raw: string): TechnicalInfos | undefined {
  if (!/<technicalInfos/.test(raw)) return undefined
  return {
    poolEntryIdx: intField(raw, 'poolEntryIdx'),
    loadWebs: intField(raw, 'loadWebsDuration'),
    poolWait: intField(raw, 'poolWaitDuration'),
    poolDistrib: intField(raw, 'poolDistribDuration'),
    poolExec: intField(raw, 'poolExecDuration'),
    poolRequest: intField(raw, 'poolRequestDuration'),
    total: intField(raw, 'totalDuration'),
  }
}

const SEP = '|#|'

/** Parse SOAP XML response from Syracuse. */
export function parseResponse(raw: string, grpRes: string, grpCount: string): SoapResponse {
  const resp: SoapResponse = { status: null, data: [], count: 0, error: '' }

  // Diagnostic par appel (issue #39, WI-1) — attaché quel que soit le chemin de retour,
  // y compris resultXml nil (cas où le cold init du client est le plus visible).
  resp.tech = parseTechnicalInfos(raw)

  const statusMatch = raw.match(/<status[^>]*>(\d+)<\/status>/)
  if (statusMatch) resp.status = Number.parseInt(statusMatch[1], 10)

  const cdataMatch = raw.match(/<resultXml[^>]*><!\[CDATA\[(.*?)\]\]><\/resultXml>/s)
  if (!cdataMatch) {
    if (/<resultXml[^/]*?\/>/.test(raw)) {
      resp.error = 'resultXml is nil'
    }
    return resp
  }

  let resultData = cdataMatch[1].replace(/</g, '<').replace(/>/g, '>').replace(/&/g, '&')

  let resultJson: Record<string, unknown>
  try {
    resultJson = JSON.parse(resultData)
  } catch (e: any) {
    resp.error = `JSON parse error: ${(e as Error).message}`
    return resp
  }

  if (grpCount in resultJson) {
    const grpData = resultJson[grpCount] as Record<string, unknown>
    const countVal = grpData?.W_COUNT ?? 0
    resp.count = countVal ? Number.parseInt(String(countVal), 10) : 0
  }

  if ('GRP4' in resultJson && typeof resultJson.GRP4 === 'object' && resultJson.GRP4 !== null) {
    resp.error = String((resultJson.GRP4 as Record<string, unknown>).W_ERR ?? '')
  }

  if (grpRes in resultJson) {
    const grpData = resultJson[grpRes]
    if (typeof grpData === 'object' && grpData !== null && 'W_RES' in (grpData as object)) {
      const wResRaw = String((grpData as Record<string, unknown>).W_RES ?? '')
      if (wResRaw) {
        resp.data = wResRaw.split('\n').filter((line: string) => line)
      }
    } else if (Array.isArray(grpData)) {
      resp.data = grpData.map((row: unknown) =>
        String((row as Record<string, unknown>).W_RES ?? '')
      )
    }
  }

  return resp
}

/** Convert pipe-separated W_RES strings into structured records. */
export function formatResults(resp: SoapResponse, columns: string[]): Record<string, string>[] {
  const records: Record<string, string>[] = []
  const multiCol = columns.length > 1

  for (const rawVal of resp.data) {
    if (multiCol) {
      const parts = rawVal.split(SEP)
      const record: Record<string, string> = {}
      for (const [i, column] of columns.entries()) {
        record[column] = i < parts.length ? parts[i].trim() : ''
      }
      records.push(record)
    } else {
      records.push({ [columns[0]]: rawVal })
    }
  }

  return records
}
