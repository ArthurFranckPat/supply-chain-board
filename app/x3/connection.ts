/** X3 Connection pool with retry and timeout.
 *
 * Ported from x3_sql.py (query function) and db.py (X3Connection).
 */

import type { X3QueryResult } from "./types.js";
import { bindParams } from "./sql-builder.js";
import { extractColumns } from "./sql-parser.js";
import { callSoap, type X3SoapConfig } from "./soap-client.js";
import { formatResults } from "./response-parser.js";

const TRANSIENT_ERRORS = ["curl", "timeout", "connection", "refused", "econnrefused", "resultxml is nil"];

export interface QueryOptions {
  retries?: number;
  timeout?: number;
}

export class X3Connection {
  constructor(private config: X3SoapConfig) {}

  async query(
    sql: string,
    params?: any[] | Record<string, any> | null,
    options: QueryOptions = {},
  ): Promise<X3QueryResult> {
    if (!this.config.user || !this.config.password) {
      return {
        success: false,
        error: `X3 credentials not configured. Set X3_TEST_USERNAME and X3_TEST_PASSWORD.`,
        count: 0,
        data: [],
      };
    }

    const boundSql = bindParams(sql, params ?? null);
    const columns = extractColumns(boundSql);

    if (columns.length === 0) {
      return {
        success: false,
        error: "Could not extract columns from SQL",
        sql: boundSql,
        count: 0,
        data: [],
      };
    }

    const retries = options.retries ?? 1;
    let lastError = "";

    for (let attempt = 0; attempt <= retries; attempt++) {
      const resp = await callSoap(boundSql, this.config, 0);

      if (resp.status === 1 && resp.error !== "resultXml is nil") {
        const records = formatResults(resp, columns);
        return {
          success: true,
          count: resp.count || records.length,
          columns,
          data: records,
        };
      }

      lastError = resp.error;
      const isTransient = TRANSIENT_ERRORS.some((kw) => lastError.toLowerCase().includes(kw));

      if (!isTransient || attempt >= retries) {
        return {
          success: false,
          error: lastError,
          status: resp.status,
          sql: boundSql,
          count: 0,
          data: [],
        };
      }

      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }

    return {
      success: false,
      error: `Failed after ${retries + 1} attempt(s): ${lastError}`,
      count: 0,
      data: [],
    };
  }

  async healthCheck(): Promise<{ reachable: boolean; env: string; detail: string; error: string }> {
    if (!this.config.user || !this.config.password) {
      return { reachable: false, env: this.config.ws, detail: "", error: "No credentials" };
    }

    try {
      const result = await this.query("SELECT TO_CHAR(1) AS CNT FROM DUAL");
      return {
        reachable: result.success,
        env: this.config.ws,
        detail: result.success ? "" : result.error ?? "",
        error: result.error ?? "",
      };
    } catch (e) {
      return { reachable: false, env: this.config.ws, detail: "", error: (e as Error).message };
    }
  }
}
