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
