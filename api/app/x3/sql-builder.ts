/** SQL building utilities — pure functions, no I/O.
 *
 * Ported from x3_sql.py: bind_params, build_concat_sql, escape_sql_for_syracuse.
 */

import { splitUnion, stripTrailingOrder, topToRownum } from "./sql-parser.js";

const SEP = "|#|";

/** Replace ? placeholders with inline values (Syracuse has no param support). */
export function bindParams(sql: string, params: any[] | Record<string, any> | null): string {
  if (!params || (Array.isArray(params) && params.length === 0)) return sql;

  if (Array.isArray(params)) {
    let result = sql;
    for (let i = 0; i < params.length; i++) {
      const val = params[i];
      const replacement = typeof val === "number" ? String(val) : `'${String(val).replace(/'/g, "''")}'`;
      result = result.replace("?", replacement);
    }
    return result;
  }

  let result = sql;
  for (const [key, val] of Object.entries(params)) {
    const replacement = typeof val === "number" ? String(val) : `'${String(val).replace(/'/g, "''")}'`;
    result = result.replace(`%${key}%`, replacement);
  }
  return result;
}

/** Transform SELECT with multiple cols into pipe-separated concat for Oracle. */
export function buildConcatSql(sql: string): string {
  const parts = splitUnion(sql);
  if (parts.length <= 1) return buildConcatSqlSingle(sql);
  return parts.map(buildConcatSqlSingle).join("\nUNION ALL\n");
}

function buildConcatSqlSingle(sql: string): string {
  sql = topToRownum(sql);
  const [noOrder, orderClause] = stripTrailingOrder(sql);

  const m = noOrder.match(/(\s*SELECT\s+)(.*?)(\s+FROM\s+.*)/is);
  if (!m) return sql;

  const cols = splitColumns(m[2]);
  if (cols.length <= 1) return sql;

  const stripped = cols.map((col) => col.replace(/\s+AS\s+\w+\s*$/i, "").trim());
  const concatExpr = stripped.map((c) => `(${c})`).join(` || '${SEP}' || `);
  return `${m[1]}${concatExpr}${m[3]}${orderClause}`;
}

function splitColumns(selectPart: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of selectPart) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      cols.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) cols.push(current.trim());
  return cols;
}

/** Replace single-quoted string literals with CHR(39) concatenation.
 *  Syracuse's JSON parser crashes on single quotes in W_SQL values. */
export function escapeSqlForSyracuse(sql: string): string {
  return sql.replace(/'([^']*)'/g, "CHR(39)||$1||CHR(39)");
}
