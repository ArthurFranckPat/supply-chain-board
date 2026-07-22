/** Client SOAP pour l'opérateur `run` d'un SOUS-PROGRAMME publié (GESAWE, type GOSUB).
 *
 * Distinct de :
 *  - `object-client.ts` → opérations CRUD OBJET (`save`/`modify`/`delete`…) du stub
 *    `CAdxWebServiceXmlCC`, ciblant un objet publié (ex. `BPC`, `MFG`, `CBD`).
 *  - `soap-client.ts` → `run` sur `ZSOAPSQL` (lecture SQL, payload JSON câblé).
 *
 * Ici : `run` générique sur n'importe quel sous-programme publié, payload `inputXml`
 * en mode XML (`<PARAM><FLD NAME="…">…</FLD>…</PARAM>`), sortie lue dans les `<FLD>`
 * du `resultXml`. Utilisé par l'affermissement FIRMSUGG (issue #31) qui enveloppe la
 * fonction standard FUNMAUTR (lancement automatique).
 *
 * Réutilise endpoint/pool/credentials de la lecture (chokepoint `getX3EnvConfig`, #13).
 */

import { execFile } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

import type { X3SoapConfig } from './soap-client.js'
import { parseObjectResponse, type ObjectMessage } from './object-client.js'

export interface RunResult {
  ok: boolean
  status: number | null
  /** Paramètres de sortie du sous-programme : NAME → valeur (depuis les <FLD>). */
  fields: Record<string, string>
  messages: ObjectMessage[]
  error: string
  raw: string
  /** Entrée de pool adonix ayant servi l'appel (`technicalInfos.poolEntryIdx`). */
  poolEntryIdx: string | null
  /** Trace X3 (`<traceRequest>`), non vide seulement si `trace: true`. */
  trace: string
}

export interface RunOptions {
  /**
   * Active la trace X3 (`adxwss.trace.on`). La réponse porte alors le wrapper
   * appelé, les arguments transmis et le `Result(n)` du sous-programme —
   * seule source d'information quand l'appel échoue sans message SOAP.
   */
  trace?: boolean
}

const ENDPOINT = (config: X3SoapConfig) =>
  `http://${config.host}:${config.port}/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC`

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Extrait les paramètres de sortie `<FLD NAME="X">val</FLD>` du resultXml. */
function parseFields(resultXml: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<FLD\b[^>]*\bNAME="([^"]+)"[^>]*>([\s\S]*?)<\/FLD>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(resultXml)) !== null) {
    out[m[1]] = decodeEntities(m[2].trim())
  }
  return out
}

function buildEnvelope(
  config: X3SoapConfig,
  publicName: string,
  inputXml: string,
  options: RunOptions = {}
): string {
  const requestConfig = options.trace
    ? 'adxwss.optreturn=XML&amp;adxwss.beautify=true&amp;adxwss.trace.on=on&amp;adxwss.trace.size=32768'
    : 'adxwss.optreturn=XML&amp;adxwss.beautify=true'
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wss="http://www.adonix.com/WSS" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:run soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">FRA</codeLang>
        <poolAlias xsi:type="xsd:string">${config.pool}</poolAlias>
        <poolId xsi:type="xsd:string"></poolId>
        <requestConfig xsi:type="xsd:string">${requestConfig}</requestConfig>
      </callContext>
      <publicName xsi:type="xsd:string">${publicName}</publicName>
      <inputXml xsi:type="xsd:string"><![CDATA[${inputXml}]]></inputXml>
    </wss:run>
  </soapenv:Body>
</soapenv:Envelope>`
}

/** Appelle un sous-programme publié via l'opérateur `run` (même curl que la lecture). */
export async function callRunSubprog(
  publicName: string,
  config: X3SoapConfig,
  inputXml: string,
  options: RunOptions = {}
): Promise<RunResult> {
  const envelope = buildEnvelope(config, publicName, inputXml, options)

  const tmpFile = join(tmpdir(), `x3_run_${process.pid}_${randomBytes(4).toString('hex')}.xml`)
  writeFileSync(tmpFile, envelope, 'utf-8')

  const args = [
    '-s',
    '--max-time',
    '120',
    '-H',
    'Content-Type: text/xml; charset=utf-8',
    '-H',
    'SOAPAction: ""',
    '-u',
    `${config.user}:${config.password}`,
    '-d',
    `@${tmpFile}`,
    ENDPOINT(config),
  ]

  return new Promise((resolve) => {
    execFile('curl', args, { timeout: 125_000 }, (error, stdout, stderr) => {
      try {
        unlinkSync(tmpFile)
      } catch {}

      if (error) {
        resolve({
          ok: false,
          status: null,
          fields: {},
          messages: [],
          error: `curl: ${stderr?.trim() || error.message}`,
          raw: stdout || '',
          poolEntryIdx: null,
          trace: '',
        })
        return
      }

      const parsed = parseObjectResponse(stdout)
      resolve({
        ok: parsed.ok,
        status: parsed.status,
        fields: parseFields(parsed.resultXml),
        messages: parsed.messages,
        error: parsed.error,
        raw: parsed.raw,
        poolEntryIdx: stdout.match(/<poolEntryIdx[^>]*>([^<]*)<\/poolEntryIdx>/)?.[1] ?? null,
        trace: decodeEntities(
          stdout.match(/<traceRequest[^>]*>([\s\S]*?)<\/traceRequest>/)?.[1] ?? ''
        ),
      })
    })
  })
}
