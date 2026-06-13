/** SOAP response parsing utilities — pure functions, no I/O.
 *
 * Ported from x3_sql.py: parse_response, format_results.
 */

export interface SoapResponse {
  status: number | null;
  data: string[];
  count: number;
  error: string;
}

const SEP = "|#|";

/** Parse SOAP XML response from Syracuse. */
export function parseResponse(raw: string, grpRes: string, grpCount: string): SoapResponse {
  const resp: SoapResponse = { status: null, data: [], count: 0, error: "" };

  const statusMatch = raw.match(/<status[^>]*>(\d+)<\/status>/);
  if (statusMatch) resp.status = parseInt(statusMatch[1], 10);

  const cdataMatch = raw.match(/<resultXml[^>]*><!\[CDATA\[(.*?)\]\]><\/resultXml>/s);
  if (!cdataMatch) {
    if (/<resultXml[^/]*?\/>/.test(raw)) {
      resp.error = "resultXml is nil";
    }
    return resp;
  }

  let resultData = cdataMatch[1]
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&");

  let resultJson: Record<string, unknown>;
  try {
    resultJson = JSON.parse(resultData);
  } catch (e: any) {
    resp.error = `JSON parse error: ${(e as Error).message}`;
    return resp;
  }

  if (grpCount in resultJson) {
    const grpData = resultJson[grpCount] as Record<string, unknown>;
    const countVal = grpData?.W_COUNT ?? 0;
    resp.count = countVal ? parseInt(String(countVal), 10) : 0;
  }

  if ("GRP4" in resultJson && typeof resultJson.GRP4 === "object" && resultJson.GRP4 !== null) {
    resp.error = String((resultJson.GRP4 as Record<string, unknown>).W_ERR ?? "");
  }

  if (grpRes in resultJson) {
    const grpData = resultJson[grpRes];
    if (typeof grpData === "object" && grpData !== null && "W_RES" in (grpData as object)) {
      const wResRaw = String((grpData as Record<string, unknown>).W_RES ?? "");
      if (wResRaw) {
        resp.data = wResRaw.split("\n").filter((line: string) => line);
      }
    } else if (Array.isArray(grpData)) {
      resp.data = grpData.map((row: unknown) => String((row as Record<string, unknown>).W_RES ?? ""));
    }
  }

  return resp;
}

/** Convert pipe-separated W_RES strings into structured records. */
export function formatResults(resp: SoapResponse, columns: string[]): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const multiCol = columns.length > 1;

  for (const rawVal of resp.data) {
    if (multiCol) {
      const parts = rawVal.split(SEP);
      const record: Record<string, string> = {};
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = i < parts.length ? parts[i].trim() : "";
      }
      records.push(record);
    } else {
      records.push({ [columns[0]]: rawVal });
    }
  }

  return records;
}
