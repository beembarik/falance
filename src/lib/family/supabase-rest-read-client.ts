import type { SupabaseReadClient, SupabaseReadQuery } from "./supabase-read-repository";

export class SupabaseRestReadClient implements SupabaseReadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  from(table: string): SupabaseReadQuery {
    return new SupabaseRestReadQuery(this.baseUrl, this.apiKey, table);
  }
}

class SupabaseRestReadQuery implements SupabaseReadQuery {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly table: string;
  private readonly filters: string[] = [];
  private selected = "*";
  private ordering: string | null = null;
  private rowLimit: number | null = null;

  constructor(baseUrl: string, apiKey: string, table: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
  }

  select(columns: string): SupabaseReadQuery { this.selected = columns; return this; }
  eq(column: string, value: string | number): SupabaseReadQuery { this.filters.push(`${column}=eq.${encodeURIComponent(String(value))}`); return this; }
  in(column: string, values: readonly string[]): SupabaseReadQuery { this.filters.push(`${column}=in.(${values.map((value) => encodeURIComponent(value)).join(",")})`); return this; }
  order(column: string, options?: { ascending?: boolean }): SupabaseReadQuery { this.ordering = `${column}.${options?.ascending === false ? "desc" : "asc"}`; return this; }
  limit(count: number): SupabaseReadQuery { this.rowLimit = count; return this; }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
    const result = await this.execute();
    if (result.error || result.data.length > 1) return { data: null, error: result.error ?? { message: "Unexpected multiple rows." } };
    return { data: result.data[0] ?? null, error: null };
  }

  async returns(): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }> {
    const result = await this.execute();
    return { data: result.error ? null : result.data, error: result.error };
  }

  private async execute(): Promise<{ data: Record<string, unknown>[]; error: { message?: string } | null }> {
    const query = new URLSearchParams({ select: this.selected });
    if (this.filters.length > 0) query.set("and", `(${this.filters.join(",")})`);
    if (this.ordering) query.set("order", this.ordering);
    if (this.rowLimit !== null) query.set("limit", String(this.rowLimit));

    try {
      const response = await fetch(`${this.baseUrl}/rest/v1/${encodeURIComponent(this.table)}?${query}`, {
        headers: { apikey: this.apiKey, Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { data: [], error: { message: "Supabase read request failed." } };
      }
      const body: unknown = await response.json();
      if (!Array.isArray(body) || body.some((row) => row === null || typeof row !== "object" || Array.isArray(row))) {
        return { data: [], error: { message: "Supabase read response was invalid." } };
      }
      return { data: body as Record<string, unknown>[], error: null };
    } catch {
      return { data: [], error: { message: "Supabase read request failed." } };
    }
  }
}
