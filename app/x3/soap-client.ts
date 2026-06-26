/** SOAP client for Syracuse X3 web services.
 *
 * Uses curl subprocess (like the Python version) for full compatibility with Syracuse.
 */

import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import type { SoapResponse } from "./types.js";
import { buildConcatSql } from "./sql-builder.js";
import { parseResponse } from "./response-parser.js";

export interface X3SoapConfig {
  host: string;
  port: string;
  user: string | undefined;
  password: string | undefined;
  pool: string;
  ws: string;
  grpSql: string;
  grpRes: string;
  grpCount: string;
}

/** Send a single SOAP request to Syracuse via curl. */
export async function sendSoap(sql: string, config: X3SoapConfig): Promise<SoapResponse> {
  const concatSql = buildConcatSql(sql);
  const inputJson = JSON.stringify({
    [config.grpSql]: { W_SQL: concatSql },
  });

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
</soapenv:Envelope>`;

  const tmpFile = join(tmpdir(), `x3_soap_${process.pid}_${randomBytes(4).toString('hex')}.xml`);
  writeFileSync(tmpFile, envelope, "utf-8");

  const args = [
    "-sS", "--max-time", "120",
    "-H", "Content-Type: text/xml; charset=utf-8",
    "-H", 'SOAPAction: ""',
    "-u", `${config.user}:${config.password}`,
    "-d", `@${tmpFile}`,
    `http://${config.host}:${config.port}/soap-generic/syracuse/collaboration/syracuse/CAdxWebServiceXmlCC`,
  ];

  const startedAt = Date.now();

  return new Promise((resolve) => {
    execFile("curl", args, { timeout: 125_000 }, (error, stdout, stderr) => {
      try { unlinkSync(tmpFile) } catch {}

      if (error) {
        const detail = stderr?.trim() || error.message
        resolve({ status: null, data: [], count: 0, error: `curl: ${detail}` });
        return;
      }

      const result = parseResponse(stdout, config.grpRes, config.grpCount);
      // Diagnostic par appel (issue #39, WI-1) : transport mesuré côté app vs breakdown
      // serveur (technicalInfos). `transport - srv` ≈ réseau + spawn curl ; `load` élevé
      // = cold init du pool ; `wait` = contention ; `exec` = SQL réel.
      if (process.env.PERF_TRACE === "1") {
        const transportMs = Date.now() - startedAt;
        const t = result.tech;
        const breakdown = t
          ? `srv=${t.total ?? "?"} load=${t.loadWebs ?? "?"} wait=${t.poolWait ?? "?"} distrib=${t.poolDistrib ?? "?"} exec=${t.poolExec ?? "?"} entry=${t.poolEntryIdx ?? "?"}`
          : "no-tech";
        // eslint-disable-next-line no-console
        console.log(`[x3.soap] transport=${transportMs}ms ${breakdown} rows=${result.data.length}`);
      }
      resolve(result);
    });
  });
}

/** Call SOAP with retry on nil resultXml. */
export async function callSoap(sql: string, config: X3SoapConfig, maxRetries: number = 2): Promise<SoapResponse> {
  let lastResp: SoapResponse | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await sendSoap(sql, config);
    lastResp = resp;

    if (resp.data.length > 0 || resp.error !== "resultXml is nil") {
      return resp;
    }
  }

  return lastResp!;
}
