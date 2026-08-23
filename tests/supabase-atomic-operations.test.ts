import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseAtomicOperations, type SupabaseRpcClient } from "../src/lib/family/supabase-atomic-operations";

class FakeRpcClient implements SupabaseRpcClient {
  calls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
  private readonly response: { data: unknown; error: { message?: string } | null };
  constructor(response: { data: unknown; error: { message?: string } | null }) { this.response = response; }
  async rpc<T = unknown>(functionName: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message?: string } | null }> {
    this.calls.push({ functionName, args });
    return this.response as { data: T | null; error: { message?: string } | null };
  }
}

test("routes validated Telegram claim to the atomic RPC", async () => {
  const client = new FakeRpcClient({ data: true, error: null });
  const operations = new SupabaseAtomicOperations(client);

  assert.equal(await operations.claimTelegramUpdate(123, "2026-08-23T00:00:00.000Z", 300_000), true);
  assert.deepEqual(client.calls, [{
    functionName: "claim_telegram_update",
    args: { p_update_id: 123, p_claimed_at: "2026-08-23T00:00:00.000Z", p_lease_ms: 300_000 },
  }]);
});

test("fails closed before making an RPC call for invalid identity and timing inputs", async () => {
  const client = new FakeRpcClient({ data: true, error: null });
  const operations = new SupabaseAtomicOperations(client);

  assert.equal(await operations.claimDraftApproval("", "user", "family", "txn", "invalid", 60_000), false);
  assert.equal(await operations.claimTelegramUpdate(-1, "2026-08-23T00:00:00.000Z", 60_000), false);
  assert.equal(await operations.claimAiUsage("family:user", "family", "user", "2026-08-23T00:00:00.000Z", 1, 1, 0, 1, true), false);
  assert.equal(client.calls.length, 0);
});

test("keeps RPC errors privacy-safe", async () => {
  const client = new FakeRpcClient({ data: null, error: { message: "secret row value and credential" } });
  const operations = new SupabaseAtomicOperations(client);

  await assert.rejects(
    operations.consumeInvitation("FAL-123456", "telegram-user", "2026-08-23T00:00:00.000Z"),
    (error: unknown) => error instanceof Error && error.message === "Supabase atomic operation failed.",
  );
});

test("routes AI usage with an explicit text/vision discriminator", async () => {
  const client = new FakeRpcClient({ data: false, error: null });
  const operations = new SupabaseAtomicOperations(client);

  assert.equal(await operations.claimAiUsage("family:user", "family", "user", "2026-08-23T00:00:00.000Z", 5_000, 3_600_000, 30, 60_000, false), false);
  assert.equal(client.calls[0]?.functionName, "claim_ai_usage");
  assert.equal(client.calls[0]?.args.p_is_text, false);
});
