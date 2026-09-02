/** SOAP client for Syracuse X3 web services.
 *
 * Uses curl subprocess (like the Python version) for full compatibility with Syracuse.
 */

import { execFile } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

import type { SoapResponse } from './types.js'
import { buildConcatSql } from './sql_builder.js'
import { parseResponse } from './response_parser.js'
import { withX3Slot, x3ConcurrencyStats, X3QueueSaturatedError } from './x3_concurrency.js'

export interface X3SoapConfig {
  host: string
  port: string
  user: string | undefined
  password: string | undefined
  pool: string
  ws: string
  grpSql: string
  grpRes: string
  grpCount: string
}

/**
 * Envoie une requête SOAP à Syracuse, en tenant un slot de concurrence (#183).
 *
 * `spawnSoap` fait le travail ; ce wrapper ne fait que le placer derrière la
 * borne globale de `x3_concurrency`. C'est le seul étranglement de toutes les
 * lectures SQL X3 — `X3Connection.query` est l'unique appelant de `callSoap`, et
 * tout repository y aboutit, qu'il vienne du pool Lucid ou d'une `X3Database`
 * isolée. Voir l'en-tête de `x3_concurrency.ts` pour le pourquoi.
 *
 * Le slot est pris AVANT la construction de l'enveloppe et l'écriture du fichier
 * temporaire, pour qu'un abandon de file ne laisse rien derrière lui.
 *
 * Contrat inchangé : cette fonction ne jette pas. Une file saturée devient une
 * `SoapResponse` en échec, comme une erreur curl.
 */
export async function sendSoap(sql: string, config: X3SoapConfig): Promise<SoapResponse> {
  try {
    return await withX3Slot(() => spawnSoap(sql, config))
  } catch (e) {
    if (e instanceof X3QueueSaturatedError) {
      return { status: null, data: [], count: 0, error: e.message }
    }
    throw e
  }
}

/** Corps réel de l'appel : enveloppe, fichier temporaire, curl, parsing. */
async function spawnSoap(sql: string, config: X3SoapConfig): Promise<SoapResponse> {
  const concatSql = buildConcatSql(sql)
  const inputJson = JSON.stringify({
    [config.grpSql]: { W_SQL: concatSql },
  })

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wss="http://www.adonix.com/WSS" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:run soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">FRA</codeLang>
        <poolAlias xsi:type="xsd:string">${config.pool}</poolAlias>
        <poolId xsi:type="xsd:string"></poolId>
        <requestConfig xsi:type="xsd:string">adxwss.optreturn=JSON&adxwss.beautify=true</requestConfig>
      </callContext>
      <publicName xsi:type="xsd:string">${config.ws}</publicName>
      <inputXml xsi:type="xsd:string"><![CDATA[${inputJson}]]></inputXml>
    </wss:run>
  </soapenv:Body>
</soapenv:Envelope>`

  const tmpFile = join(tmpdir(), `x3_soap_${process.pid}_${randomBytes(4).toString('hex')}.xml`)
  writeFileSync(tmpFile, envelope, 'utf-8')

  const args = [
    '-sS',
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
    `http://${config.host}:${config.port}/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC`,
  ]

  const startedAt = Date.now()
  // Capturé À L'ENTRÉE du slot : après coup, la file s'est vidée et le chiffre
  // ne dirait plus rien de la contention qu'a subie CET appel.
  const concurrency = x3ConcurrencyStats()

  return new Promise((resolve) => {
    execFile('curl', args, { timeout: 125_000 }, (error, stdout, stderr) => {
      try {
        unlinkSync(tmpFile)
      } catch {}

      if (error) {
        const detail = stderr?.trim() || error.message
        resolve({ status: null, data: [], count: 0, error: `curl: ${detail}` })
        return
      }

      const result = parseResponse(stdout, config.grpRes, config.grpCount)
      // Diagnostic par appel (issue #39, WI-1) : transport mesuré côté app vs breakdown
      // serveur (technicalInfos). `transport - srv` ≈ réseau + spawn curl ; `load` élevé
      // = cold init du pool ; `wait` = contention ; `exec` = SQL réel.
      if (process.env.PERF_TRACE === '1') {
        const transportMs = Date.now() - startedAt
        const t = result.tech
        const breakdown = t
          ? `srv=${t.total ?? '?'} load=${t.loadWebs ?? '?'} wait=${t.poolWait ?? '?'} distrib=${t.poolDistrib ?? '?'} exec=${t.poolExec ?? '?'} entry=${t.poolEntryIdx ?? '?'}`
          : 'no-tech'

        console.log(
          `[x3.soap] transport=${transportMs}ms ${breakdown} rows=${result.data.length} ` +
            `slots=${concurrency.inFlight}/${concurrency.max} queued=${concurrency.queued}`
        )
      }
      resolve(result)
    })
  })
}

/** Call SOAP with retry on nil resultXml. */
export async function callSoap(
  sql: string,
  config: X3SoapConfig,
  maxRetries: number = 2
): Promise<SoapResponse> {
  let lastResp: SoapResponse | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await sendSoap(sql, config)
    lastResp = resp

    if (resp.data.length > 0 || resp.error !== 'resultXml is nil') {
      return resp
    }
  }

  return lastResp!
}
