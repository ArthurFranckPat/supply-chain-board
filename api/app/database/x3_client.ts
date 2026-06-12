/**
 * X3 Knex Client — custom dialect for Sage X3 via SOAP/SQL.
 *
 * Uses direct SOAP/curl calls to Syracuse CAdxWebServiceXmlCC.
 *
 * For testing, inject a mock via `connection: { x3Connection: mock }`.
 */

import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const _require = createRequire(import.meta.url)
const KnexClient = _require('knex/lib/client.js')

const SEP = '\x01\x02'

/** Split column list respecting parentheses depth AND string literals. */
function splitColumns(selectPart: string): string[] {
  const cols: string[] = []
  let depth = 0
  let inStr = false
  let current = ''
  for (let i = 0; i < selectPart.length; i++) {
    const ch = selectPart[i]
    if (!inStr && ch === "'") { inStr = true; current += ch }
    else if (inStr) {
      current += ch
      if (ch === "'" && selectPart[i + 1] === "'") { current += selectPart[++i] }
      else if (ch === "'") inStr = false
    } else if (ch === '(') { depth++; current += ch }
    else if (ch === ')') { depth--; current += ch }
    else if (ch === ',' && depth === 0) { cols.push(current.trim()); current = '' }
    else current += ch
  }
  if (current.trim()) cols.push(current.trim())
  return cols
}

/**
 * Transform multi-column SELECT into single-column concatenation for Syracuse.
 * SELECT col1, col2 FROM t → SELECT col1||CHR(1)||CHR(2)||col2 FROM t
 */
function syracuseSql(sql: string): string {
  const m = sql.match(/(\s*SELECT\s+)(.*?)(\s+FROM\s+.*)/is)
  if (!m) return sql
  const cols = splitColumns(m[2])
  if (cols.length <= 1) return sql
  const concat = cols.map(c => '(' + c.replace(/\s+AS\s+\w+\s*$/i, '').trim() + ')').join(` || CHR(1)||CHR(2) || `)
  return m[1] + concat + m[3]
}

export interface X3ClientConnection { x3conn: X3Queryable }

export interface X3QueryResult {
  success: boolean
  error?: string
  count: number
  data: Record<string, any>[]
}

export interface X3Queryable {
  query(sql: string, params?: any[] | Record<string, any> | null, options?: any): Promise<X3QueryResult>
}

/** Send SQL to Syracuse X3 via SOAP/curl. */
async function callSoap(sql: string, host: string, port: string, user: string, password: string, pool: string): Promise<X3QueryResult> {
  const syrSql = syracuseSql(sql)
  const inputJson = JSON.stringify({ GRP3: { W_SQL: syrSql } })
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wss="http://www.adonix.com/WSS" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header/>
  <soapenv:Body>
    <wss:run soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <callContext xsi:type="wss:CAdxCallContext">
        <codeLang xsi:type="xsd:string">FRA</codeLang>
        <poolAlias xsi:type="xsd:string">${pool}</poolAlias>
        <poolId xsi:type="xsd:string"></poolId>
        <requestConfig xsi:type="xsd:string">adxwss.optreturn=JSON&amp;adxwss.beautify=true</requestConfig>
      </callContext>
      <publicName xsi:type="xsd:string">YSQLTEST</publicName>
      <inputXml xsi:type="xsd:string"><![CDATA[${inputJson}]]></inputXml>
    </wss:run>
  </soapenv:Body>
</soapenv:Envelope>`

  const tmpDir = mkdtempSync(join(tmpdir(), 'x3_soap_'))
  const tmpFile = join(tmpDir, 'request.xml')
  const credFile = join(tmpDir, 'config.txt')
  writeFileSync(tmpFile, envelope, 'utf-8')
  writeFileSync(credFile, `user = "${user}:${password}"\n`, { encoding: 'utf-8', mode: 0o600 })
  const url = `http://${host}:${port}/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC`

  return new Promise((resolve) => {
    execFile('curl', [
      '-s', '--max-time', '30',
      '-H', 'Content-Type: text/xml; charset=utf-8',
      '-H', 'SOAPAction: ""',
      '-K', credFile,
      '-d', `@${tmpFile}`, url,
    ], { timeout: 35_000 }, (error, stdout) => {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}

      if (error) return resolve({ success: false, error: `curl: ${error.message}`, count: 0, data: [] })

      const status = parseInt(stdout.match(/<status[^>]*>(\d+)<\/status>/)![1], 10)
      const cdata = stdout.match(/<resultXml[^>]*><!\[CDATA\[(.*?)\]\]><\/resultXml>/s)
      if (!cdata) return resolve({ success: false, error: 'resultXml is nil', count: 0, data: [] })

      let json: Record<string, any>
      try { json = JSON.parse(cdata[1]
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
        .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'"))
      } catch (e: any) { return resolve({ success: false, error: `JSON: ${e.message}`, count: 0, data: [] }) }

      const errMsg: string = json.GRP4?.W_ERR ?? ''
      const raw = String(json.GRP1?.W_RES ?? '').split('\n').filter((l: string) => l.trim())
      const count = parseInt(json.GRP2?.W_COUNT ?? '0', 10) || raw.length

      // Parse W_RES lines: each is SEP-separated, we return them as-is
      // Column mapping happens in _query
      const data = raw.map((line: string) => ({ W_RES: line }))
      resolve({ success: status === 1 && !errMsg, error: errMsg || undefined, count, data })
    })
  })
}

export class X3Client extends KnexClient {
  declare config: any

  get dialect() { return 'x3' }
  get driverName() { return 'x3' }

  _driver() { return {} }

  queryCompiler(builder: any, formatter: any) {
    const OracleQ = _require('knex/lib/dialects/oracle/query/oracle-querycompiler.js')
    // Custom subclass to avoid subquery wrapping for simple LIMIT
    const X3Q = class extends OracleQ {
      _surroundQueryWithLimitAndOffset(query: string) {
        const hasLimit = this.single.limit || this.single.limit === 0 || this.single.limit === '0'
        const hasOffset = !!this.single.offset
        if (!hasLimit || hasOffset) return super._surroundQueryWithLimitAndOffset(query)
        const limitVal = +this.single.limit
        const rownumClause = 'ROWNUM <= ' + limitVal  // literal, not parameterized
        if (/\bWHERE\b/i.test(query)) {
          return query.replace(/\bWHERE\b/i, (m: string) => m + ' ' + rownumClause + ' AND ')
        }
        const fromMatch = query.match(/\bFROM\b/i)
        if (fromMatch) {
          const idx = (fromMatch.index ?? 0) + fromMatch[0].length
          const afterFrom = query.slice(idx).trim()
          const tableName = afterFrom.split(/\s/)[0]
          return query.slice(0, idx) + ' ' + tableName + ' WHERE ' + rownumClause + afterFrom.slice(tableName.length)
        }
        return 'select * from (' + query + ') where ' + rownumClause
      }
    }
    return new (X3Q as any)(this, builder, formatter)
  }

  columnCompiler() {
    const OracleCC = _require('knex/lib/dialects/oracle/schema/oracle-columncompiler.js')
    return new OracleCC(this, ...arguments)
  }

  wrapIdentifierImpl(value: string) {
    return value.toUpperCase() // Syracuse X3 needs uppercase, no quotes
  }

  async acquireRawConnection(): Promise<X3ClientConnection> {
    if (this.config.connection?.x3Connection) return { x3conn: this.config.connection.x3Connection }

    // Read X3 credentials from process.env (set by AdonisJS from .env)
    const host = process.env.X3_TEST_HOST ?? 'localhost'
    const port = process.env.X3_TEST_PORT ?? '8124'
    const user = process.env.X3_TEST_USERNAME ?? ''
    const password = process.env.X3_TEST_PASSWORD ?? ''
    const pool = process.env.X3_TEST_POOL ?? 'X3TEST'

    return {
      x3conn: {
        query: async (sql: string, bindings?: any[]) => {
          // Replace ? with inline values for Syracuse (no param support)
          let finalSql = sql
          if (bindings && bindings.length > 0) {
            let idx = 0
            finalSql = sql.replace(/\?/g, () => {
              const val = bindings![idx++]
              if (typeof val === 'number') return String(val)
              return "'" + String(val).replace(/'/g, "''") + "'"
            })
          }
          return callSoap(finalSql, host, port, user, password, pool)
        },
      },
    }
  }

  async destroyRawConnection(_connection: X3ClientConnection): Promise<void> {
    return Promise.resolve()
  }

  async _query(connection: X3ClientConnection, obj: any): Promise<any> {
    if (!obj.sql) throw new Error('The query is empty')
    const result = await connection.x3conn.query(obj.sql, obj.bindings ?? [])
    if (!result.success) throw new Error(`X3 query failed: ${result.error}`)

    // Parse SEP-separated W_RES into column-keyed records, or pass through
    // if data is already in column format (from mocks or formatted responses)
    if (result.data.length > 0 && 'W_RES' in result.data[0]) {
      const columns = this.extractColumns(obj.sql)
      obj.response = result.data.map((row: any) => {
        const parts = row.W_RES.split(SEP)
        const record: Record<string, string> = {}
        for (let i = 0; i < columns.length; i++) {
          record[columns[i]] = (i < parts.length ? parts[i] : '').trim()
        }
        return record
      })
    } else {
      // Already in column format (mock or formatted SOAP response)
      obj.response = result.data
    }
    return obj
  }

  /** Extract column aliases from compiled SQL for W_RES parsing. */
  private extractColumns(sql: string): string[] {
    const fromIdx = sql.search(/\s+FROM\s+/i)
    if (fromIdx === -1) return []
    const colsStr = sql.slice(0, fromIdx).replace(/^\s*SELECT\s+/i, '').trim()
    if (!colsStr || colsStr === '*') return []

    // Parse columns: split by top-level commas, strip aliases
    const cols: string[] = []
    let depth = 0
    let current = ''
    for (const ch of colsStr) {
      if (ch === '(') { depth++; current += ch }
      else if (ch === ')') { depth--; current += ch }
      else if (ch === ',' && depth === 0) { cols.push(current.trim()); current = '' }
      else current += ch
    }
    if (current.trim()) cols.push(current.trim())

    // Strip aliases (AS ...) and return bare column names
    return cols.map(c => c.replace(/\s+AS\s+\w+\s*$/i, '').trim())
  }

  processResponse(obj: any, _runner: any): any {
    const { response } = obj
    if (obj.output) return obj.output.call(_runner, response)
    switch (obj.method) {
      case 'select': return response
      case 'first': return response[0]
      case 'pluck': return response.map((r: Record<string, any>) => r[obj.pluck])
      default: return response
    }
  }
}
