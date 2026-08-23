import type { SupabaseReadClient } from "./supabase-read-repository";
import { SupabaseReadRepository } from "./supabase-read-repository";
import { SupabaseAtomicOperations, type SupabaseRpcClient } from "./supabase-atomic-operations";

export type SupabaseServerClient = SupabaseReadClient & SupabaseRpcClient;

/**
 * Incremental Supabase repository seam.
 * Reads are inherited from SupabaseReadRepository; only race-sensitive claims
 * are routed to PostgreSQL atomic functions in this slice. Ordinary writes
 * remain fail-closed until their service authorization and parity tests land.
 */
export class SupabaseAtomicRepository extends SupabaseReadRepository {
  private readonly atomic: SupabaseAtomicOperations;

  constructor(client: SupabaseServerClient) {
    super(client);
    this.atomic = new SupabaseAtomicOperations(client);
  }

  claimTelegramUpdate(updateId: number, claimedAt: string, leaseMs = 300_000): Promise<boolean> {
    return this.atomic.claimTelegramUpdate(updateId, claimedAt, leaseMs);
  }

  claimDraftApproval(
    draftId: string,
    telegramUserId: string,
    familyId: string,
    transactionId: string,
    claimedAt: string,
    leaseMs: number,
  ): Promise<boolean> {
    return this.atomic.claimDraftApproval(draftId, telegramUserId, familyId, transactionId, claimedAt, leaseMs);
  }

  claimReceiptVision(
    familyId: string,
    telegramUserId: string,
    claimedAt: string,
    cooldownMs: number,
    windowMs: number,
    maxRequests: number,
    leaseMs: number,
  ): Promise<boolean> {
    return this.atomic.claimAiUsage(`${familyId}:${telegramUserId}`, familyId, telegramUserId, claimedAt, cooldownMs, windowMs, maxRequests, leaseMs, false);
  }

  claimTextUsage(
    familyId: string,
    telegramUserId: string,
    claimedAt: string,
    cooldownMs: number,
    windowMs: number,
    maxRequests: number,
    leaseMs: number,
  ): Promise<boolean> {
    return this.atomic.claimAiUsage(`${familyId}:${telegramUserId}`, familyId, telegramUserId, claimedAt, cooldownMs, windowMs, maxRequests, leaseMs, true);
  }
}
