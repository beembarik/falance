export interface SupabaseRpcClient {
  rpc<T = unknown>(functionName: string, args: Record<string, unknown>): Promise<{
    data: T | null;
    error: { message?: string } | null;
  }>;
}

/**
 * Server-side persistence boundary for race-sensitive operations.
 * The supplied client must be configured with the Supabase service role.
 * No Telegram or browser authorization is performed here; FamilyService
 * remains responsible for resolving and validating the family boundary.
 */
export class SupabaseAtomicOperations {
  private readonly client: SupabaseRpcClient;
  constructor(client: SupabaseRpcClient) { this.client = client; }

  async claimTelegramUpdate(updateId: number, claimedAt: string, leaseMs: number): Promise<boolean> {
    if (!Number.isSafeInteger(updateId) || updateId < 0 || !validTimestamp(claimedAt) || !validMs(leaseMs)) return false;
    return this.booleanRpc("claim_telegram_update", { p_update_id: updateId, p_claimed_at: claimedAt, p_lease_ms: leaseMs });
  }

  async claimDraftApproval(
    draftId: string,
    telegramUserId: string,
    familyId: string,
    transactionId: string,
    claimedAt: string,
    leaseMs: number,
  ): Promise<boolean> {
    if (![draftId, telegramUserId, familyId, transactionId].every(nonEmpty) || !validTimestamp(claimedAt) || !validMs(leaseMs)) return false;
    return this.booleanRpc("claim_draft_approval", {
      p_draft_id: draftId,
      p_telegram_user_id: telegramUserId,
      p_family_id: familyId,
      p_transaction_id: transactionId,
      p_claimed_at: claimedAt,
      p_lease_ms: leaseMs,
    });
  }

  async consumeInvitation(code: string, usedBy: string, usedAt: string): Promise<boolean> {
    if (![code, usedBy].every(nonEmpty) || !validTimestamp(usedAt)) return false;
    return this.booleanRpc("consume_invitation", { p_code: code, p_used_by: usedBy, p_used_at: usedAt });
  }

  async claimAiUsage(
    usageKey: string,
    familyId: string,
    telegramUserId: string,
    claimedAt: string,
    cooldownMs: number,
    windowMs: number,
    maxRequests: number,
    leaseMs: number,
    isText: boolean,
  ): Promise<boolean> {
    if (![usageKey, familyId, telegramUserId].every(nonEmpty) || !validTimestamp(claimedAt)
      || !validMs(cooldownMs) || !validMs(windowMs) || !validMs(leaseMs)
      || !Number.isSafeInteger(maxRequests) || maxRequests < 1) return false;
    return this.booleanRpc("claim_ai_usage", {
      p_usage_key: usageKey,
      p_family_id: familyId,
      p_telegram_user_id: telegramUserId,
      p_claimed_at: claimedAt,
      p_cooldown_ms: cooldownMs,
      p_window_ms: windowMs,
      p_max_requests: maxRequests,
      p_lease_ms: leaseMs,
      p_is_text: isText,
    });
  }

  private async booleanRpc(functionName: string, args: Record<string, unknown>): Promise<boolean> {
    const result = await this.client.rpc<boolean>(functionName, args);
    if (result.error || typeof result.data !== "boolean") throw new Error("Supabase atomic operation failed.");
    return result.data;
  }
}

function nonEmpty(value: string): boolean { return typeof value === "string" && value.length > 0; }
function validTimestamp(value: string): boolean { return nonEmpty(value) && !Number.isNaN(Date.parse(value)); }
function validMs(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
