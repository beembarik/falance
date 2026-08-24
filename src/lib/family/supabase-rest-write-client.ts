import type { SupabaseRpcClient } from "./supabase-atomic-operations";
import type { SupabaseWriteClient } from "./supabase-family-repository";
import type { SupabaseReadQuery } from "./supabase-read-repository";
import { SupabaseRestReadClient } from "./supabase-rest-read-client";

export class SupabaseRestWriteClient implements SupabaseWriteClient, SupabaseRpcClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly readClient: SupabaseRestReadClient;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.readClient = new SupabaseRestReadClient(this.baseUrl, this.apiKey);
  }

  from(table: string): SupabaseReadQuery {
    return this.readClient.from(table);
  }

  async insert(table: string, row: Record<string, unknown>): Promise<{ error: { message?: string } | null }> {
    const result = await this.request(table, "POST", row, { Prefer: "return=minimal" });
    return { error: result.ok ? null : safeError() };
  }

  async upsert(table: string, row: Record<string, unknown>, conflictColumns: readonly string[]): Promise<{ error: { message?: string } | null }> {
    const query = new URLSearchParams({ on_conflict: conflictColumns.join(",") });
    const result = await this.request(`${table}?${query}`, "POST", row, { Prefer: "resolution=merge-duplicates,return=minimal" });
    return { error: result.ok ? null : safeError() };
  }

  async update(table: string, match: Record<string, string | number>, values: Record<string, unknown>): Promise<{ affectedRows: number; error: { message?: string } | null }> {
    const query = new URLSearchParams();
    for (const [column, value] of Object.entries(match)) query.set(column, `eq.${String(value)}`);
    const result = await this.request(`${table}?${query}`, "PATCH", values, { Prefer: "return=representation,count=exact" });
    if (!result.ok) return { affectedRows: 0, error: safeError() };
    return { affectedRows: parseCount(result.headers.get("content-range")), error: null };
  }

  async rpc<T = unknown>(functionName: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message?: string } | null }> {
    const result = await this.request(`rpc/${functionName}`, "POST", args, { Prefer: "return=representation" });
    if (!result.ok) return { data: null, error: safeError() };
    try {
      return { data: await result.response.json() as T, error: null };
    } catch {
      return { data: null, error: safeError() };
    }
  }

  private async request(path: string, method: "POST" | "PATCH", body: Record<string, unknown>, extraHeaders: Record<string, string>): Promise<{ ok: boolean; headers: Headers; response: Response }> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: this.apiKey,
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) await response.body?.cancel();
      return { ok: response.ok, headers: response.headers, response };
    } catch {
      return { ok: false, headers: new Headers(), response: new Response(null, { status: 599 }) };
    }
  }
}

function parseCount(contentRange: string | null): number {
  const total = contentRange?.split("/").at(-1);
  const count = total ? Number(total) : NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeError(): { message: string } {
  return { message: "Supabase write request failed." };
}
