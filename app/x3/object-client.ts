/** Client SOAP pour les OPÉRATIONS OBJET X3 (write-back — issue #29).
 *
 * Contrairement à `soap-client.ts` (opérateur `run` sur le subprogram `ZSOAPSQL`,
 * lecture SQL uniquement), ce module appelle les opérations CRUD objet du stub
 * `CAdxWebServiceXmlCC` : `read` / `save` / `modify` / `delete` / `getDescription`.
 *
 * Réutilise le même endpoint, le même pool et les mêmes credentials que la lecture
 * (chokepoint `getX3EnvConfig`, issue #13). Ici le `publicName` est le nom de
 * l'objet publié (ex. `BPC`), PAS le subprogram `ZSOAPSQL` de la config.
 *
 * Réf. : KB Sage 80551 (save/create), RKL « 5 days » Day 3 (read/modify), doc
 * officielle SOAP v12 (administration-reference_soap-generic).
 *
 * Sécurité : ces opérations écrivent via la COUCHE OBJET X3 — les validations,
 * transactions (Trbegin/Commit/Rollback) et triggers 4GL s'appliquent. Aucun SQL
 * brut, aucune protection court-circuitée (contrairement à un write SQL direct).
 */

import { execFile } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

import type { X3SoapConfig } from './soap-client.js'

export type ObjectOperation = 'read' | 'save' | 'modify' | 'delete' | 'getDescription' | 'queryList'

export interface ObjectKeyValue {
  key: string
  value: string
}

export interface ObjectMessage {
  /** Convention Syracuse : 1 = erreur, 2 = warning, 3 = info. */
  type: number
  text: string
}

export interface ObjectResult {
  ok: boolean
  status: number | null
  /** XML objet renvoyé par X3 (résultat de read/save/modify). Brut. */
  resultXml: string
  messages: ObjectMessage[]
  /** Erreur transport (curl/timeout) ou message synthétique d'échec. */
  error: string
  /** Réponse SOAP brute (debug). */
  raw: string
}

const ENDPOINT = (config: X3SoapConfig) =>
  `http://${config.host}:${config.port}/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC`

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Normalise un `objectXml` avant envoi en `save`/`modify`.
 *
 * Piège X3 : un `read` renvoie l'objet sous une racine `<RESULT>` (avec un prologue
 * `<?xml?>`), mais `save`/`modify` attendent une racine `<PARAM>`. La structure
 * interne (`<GRP>`/`<FLD>`/`<LIN>`/`<TAB>`) est identique en lecture et écriture :
 * seul le wrapper change. On retire le prologue et on renomme la racine pour
 * pouvoir réutiliser tel quel le XML d'un read comme payload d'écriture.
 */
function normalizeObjectXml(xml: string): string {
  let s = xml.trim()
  s = s.replace(/^<\?xml[^>]*\?>\s*/i, '')
  s = s.replace(/^<RESULT(\s|>)/i, '<PARAM$1').replace(/<\/RESULT>\s*$/i, '</PARAM>')
  return s
}

/** Sérialise les clés d'objet au tableau SOAP `ArrayOfCAdxParamKeyValue`. */
function buildObjectKeysXml(keys: ObjectKeyValue[]): string {
  const items = keys
    .map(
      (k) => `        <item xsi:type="wss:CAdxParamKeyValue">
          <key xsi:type="xsd:string">${escapeXml(k.key)}</key>
          <value xsi:type="xsd:string">${escapeXml(k.value)}</value>
        </item>`
    )
    .join('\n')
  return `      <objectKeys xsi:type="wss:ArrayOfCAdxParamKeyValue" soapenc:arrayType="wss:CAdxParamKeyValue[${keys.length}]">
${items}
      </objectKeys>`
}

function buildEnvelope(
  operation: ObjectOperation,
  config: X3SoapConfig,
  publicName: string,
  keys: ObjectKeyValue[],
  objectXml: string
): string {
  const needKeys = operation === 'read' || operation === 'delete' || operation === 'modify'
  const needXml = operation === 'save' || operation === 'modify'

  const parts: string[] = []
  parts.push(`      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">FRA</codeLang>
        <poolAlias xsi:type="xsd:string">${config.pool}</poolAlias>
        <poolId xsi:type="xsd:string"></poolId>
        <requestConfig xsi:type="xsd:string">adxwss.optreturn=XML&amp;adxwss.beautify=true</requestConfig>
      </callContext>`)
  parts.push(`      <publicName xsi:type="xsd:string">${escapeXml(publicName)}</publicName>`)
  if (needKeys) parts.push(buildObjectKeysXml(keys))
  if (needXml) {
    parts.push(`      <objectXml xsi:type="xsd:string"><![CDATA[${objectXml}]]></objectXml>`)
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:wss="http://www.adonix.com/WSS" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:${operation} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
${parts.join('\n')}
    </wss:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`
}

/** Extrait les messages Syracuse d'une réponse SOAP.
 *
 * Format RPC/encoded : le tableau <messages> ne contient que des références
 * <messages href="#id0"/>, le vrai texte vit dans un <multiRef id="id0"> en fin
 * de body (cas Syracuse). Le texte est dans <message> (parfois <v> selon version).
 */
function extractMessages(raw: string): ObjectMessage[] {
  const out: ObjectMessage[] = []

  // 1. Cartographie des blocs multiRef : id → { type, text }
  const multiRefRe = /<multiRef\b[^>]*\bid="(id\d+)"[^>]*>([\s\S]*?)<\/multiRef>/g
  const refs = new Map<string, ObjectMessage>()
  let mm: RegExpExecArray | null
  while ((mm = multiRefRe.exec(raw)) !== null) {
    const inner = mm[2]
    const tm = inner.match(/<(?:[\w]+:)?type[^>]*>\s*(\d+)\s*<\/(?:[\w]+:)?type>/)
    const vm = inner.match(
      /<(?:[\w]+:)?(?:message|v)\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?(?:message|v)>/
    )
    refs.set(mm[1], {
      type: tm ? Number.parseInt(tm[1], 10) : 3,
      text: vm ? decodeEntities(vm[1].trim()) : '',
    })
  }

  // 2a. Références href du tableau <messages> → résolution multiRef
  const hrefRe = /<messages\b[^>]*\bhref="#(id\d+)"/g
  let hm: RegExpExecArray | null
  while ((hm = hrefRe.exec(raw)) !== null) {
    const ref = refs.get(hm[1])
    if (ref) out.push(ref)
  }

  // 2b. Fallback : paires type/message brutes (structure sans multiRef)
  if (out.length === 0) {
    const pairRe =
      /<(?:[\w]+:)?type[^>]*>\s*(\d+)\s*<\/(?:[\w]+:)?type>[\s\S]*?<(?:[\w]+:)?(?:message|v)\b[^>]*>([\s\S]*?)<\/(?:[\w]+:)?(?:message|v)>/g
    let pm: RegExpExecArray | null
    while ((pm = pairRe.exec(raw)) !== null) {
      out.push({ type: Number.parseInt(pm[1], 10), text: decodeEntities(pm[2].trim()) })
    }
  }

  return out
}

/** Analyse une réponse SOAP d'opération objet. Pure, sans I/O. */
export function parseObjectResponse(raw: string): ObjectResult {
  const result: ObjectResult = {
    ok: false,
    status: null,
    resultXml: '',
    messages: [],
    error: '',
    raw,
  }

  // Fault SOAP (erreur transport/serveur).
  const faultMatch = raw.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
  if (faultMatch) {
    result.error = decodeEntities(faultMatch[1].trim())
    return result
  }

  const statusMatch = raw.match(/<status[^>]*>\s*(\d+)\s*<\/status>/)
  if (statusMatch) result.status = Number.parseInt(statusMatch[1], 10)
  result.ok = result.status === 1

  // resultXml : XML objet. CDATA d'abord, sinon contenu échappé.
  const cdataMatch = raw.match(/<resultXml[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/resultXml>/)
  if (cdataMatch) {
    result.resultXml = cdataMatch[1].trim()
  } else {
    const plainMatch = raw.match(/<resultXml[^>]*>([\s\S]*?)<\/resultXml>/)
    if (plainMatch && plainMatch[1].trim()) {
      result.resultXml = decodeEntities(plainMatch[1]).trim()
    }
  }

  // Messages Syracuse (RPC/encoded : résolution multiRef des href). type 1=erreur,
  // 2=warning, 3=info — mais les messages système (ex. « Service web inexistant »)
  // arrivent en type 3 : on se fie au `status` global pour le verdict ok/échec.
  result.messages = extractMessages(raw)

  if (!result.ok && !result.error && result.messages.length === 0) {
    result.error = "X3 a refusé l'opération (statut non-succès) sans message explicite."
  }

  return result
}

function buildQueryListEnvelope(
  config: X3SoapConfig,
  publicName: string,
  queryXml: string,
  listSize: number
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:wss="http://www.adonix.com/WSS" xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:queryList soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">FRA</codeLang>
        <poolAlias xsi:type="xsd:string">${config.pool}</poolAlias>
        <poolId xsi:type="xsd:string"></poolId>
        <requestConfig xsi:type="xsd:string">adxwss.optreturn=XML&amp;adxwss.beautify=true</requestConfig>
      </callContext>
      <publicName xsi:type="xsd:string">${escapeXml(publicName)}</publicName>
      <listSize xsi:type="xsd:int">${listSize}</listSize>
      <queryXml xsi:type="xsd:string"><![CDATA[${queryXml}]]></queryXml>
    </wss:queryList>
  </soapenv:Body>
</soapenv:Envelope>`
}

export async function callQueryList(
  publicName: string,
  config: X3SoapConfig,
  queryXml: string = '<PARAM/>',
  listSize: number = 50
): Promise<ObjectResult> {
  const envelope = buildQueryListEnvelope(config, publicName, queryXml, listSize)

  const tmpFile = join(tmpdir(), `x3_ql_${process.pid}_${randomBytes(4).toString('hex')}.xml`)
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
          resultXml: '',
          messages: [],
          error: `curl: ${stderr?.trim() || error.message}`,
          raw: stdout || '',
        })
        return
      }
      resolve(parseObjectResponse(stdout))
    })
  })
}

/** Envoie une opération objet à Syracuse via curl (même mécanisme que la lecture). */
export async function callObjectOperation(
  operation: ObjectOperation,
  publicName: string,
  config: X3SoapConfig,
  keys: ObjectKeyValue[] = [],
  objectXml: string = ''
): Promise<ObjectResult> {
  const envelope = buildEnvelope(operation, config, publicName, keys, normalizeObjectXml(objectXml))

  const tmpFile = join(tmpdir(), `x3_obj_${process.pid}_${randomBytes(4).toString('hex')}.xml`)
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
          resultXml: '',
          messages: [],
          error: `curl: ${stderr?.trim() || error.message}`,
          raw: stdout || '',
        })
        return
      }

      resolve(parseObjectResponse(stdout))
    })
  })
}
