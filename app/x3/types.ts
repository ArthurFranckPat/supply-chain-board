/** Shared types for X3 SOAP/SQL. */

export interface X3QueryResult {
  success: boolean;
  count: number;
  columns?: string[];
  data: Record<string, string>[];
  error?: string;
  status?: number | null;
  sql?: string;
}

export interface SoapResponse {
  status: number | null;
  data: string[];
  count: number;
  error: string;
}

export interface X3Queryable {
  query(sql: string, params?: any[] | Record<string, any> | null, options?: any): Promise<X3QueryResult>
}
