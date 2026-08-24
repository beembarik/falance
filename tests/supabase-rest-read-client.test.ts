import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseRestReadClient } from "../src/lib/family/supabase-rest-read-client";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("builds valid PostgREST filters for equality and membership queries", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return Response.json([]);
  };

  const query = new SupabaseRestReadClient("https://example.supabase.co", "test-key").from("members");
  await query.select("*").eq("telegram_user_id", "user-123").eq("status", "ACTIVE").returns();

  assert.equal(requests[0], "https://example.supabase.co/rest/v1/members?select=*&and=%28telegram_user_id.eq.user-123%2Cstatus.eq.ACTIVE%29");

  requests.length = 0;
  await new SupabaseRestReadClient("https://example.supabase.co", "test-key").from("drafts").select("*").in("status", ["PENDING", "EDITING"]).returns();
  assert.equal(requests[0], "https://example.supabase.co/rest/v1/drafts?select=*&and=%28status.in.%28PENDING%2CEDITING%29%29");
});

test("classifies HTTP errors without reading or returning response bodies", async () => {
  globalThis.fetch = async () => new Response("sensitive provider body", { status: 401 });

  const result = await new SupabaseRestReadClient("https://example.supabase.co", "test-key").from("members").select("*").returns();

  assert.deepEqual(result, { data: null, error: { message: "Supabase read request failed.", code: "http_401" } });
});
