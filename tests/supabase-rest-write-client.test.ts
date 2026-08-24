import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseRestWriteClient } from "../src/lib/family/supabase-rest-write-client";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("REST write client sends server auth and parses affected update count", async () => {
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(null, {
      status: 204,
      headers: { "content-range": "0-0/1" },
    });
  };

  const client = new SupabaseRestWriteClient("https://primary-test.supabase.co/", "service-role-test-key");
  const result = await client.update("transactions", { transaction_id: "tx-1", status: "ACTIVE" }, { description: "Updated" });

  assert.equal(result.error, null);
  assert.equal(result.affectedRows, 1);
  assert.equal(request?.url, "https://primary-test.supabase.co/rest/v1/transactions?transaction_id=eq.tx-1&status=eq.ACTIVE");
  assert.equal(request?.headers.get("apikey"), "service-role-test-key");
  assert.equal(request?.headers.get("authorization"), "Bearer service-role-test-key");
  assert.deepEqual(await request?.json(), { description: "Updated" });
});

test("REST write client maps failed write to a redacted error", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "sensitive database detail" }), { status: 409 });

  const client = new SupabaseRestWriteClient("https://primary-test.supabase.co", "service-role-test-key");
  const result = await client.insert("families", { family_id: "family-1" });

  assert.equal(result.error?.message, "Supabase write request failed.");
});

test("REST write client invokes atomic RPC and returns boolean payload", async () => {
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = new SupabaseRestWriteClient("https://primary-test.supabase.co", "service-role-test-key");
  const result = await client.rpc<boolean>("claim_telegram_update", { p_update_id: 1 });

  assert.equal(result.error, null);
  assert.equal(result.data, true);
  assert.equal(request?.url, "https://primary-test.supabase.co/rest/v1/rpc/claim_telegram_update");
  assert.equal(request?.method, "POST");
});
