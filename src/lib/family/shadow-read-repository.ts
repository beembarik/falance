import { createHash } from "node:crypto";
import type { FamilyRepository } from "./repository";
import type { AuditLogEntry, DraftApprovalClaim, Family, FamilyMember, Invitation, MemberRole, MemberStatus, PendingConfirmation, PendingFamilyCreation, PendingTransactionDraft, Transaction } from "./types";

/**
 * Keeps the primary repository authoritative while asynchronously comparing read
 * results with a secondary repository. Secondary failures never affect users.
 */
export class ShadowReadRepository implements FamilyRepository {
  private readonly primary: FamilyRepository;
  private readonly secondary: FamilyRepository;
  private readonly sampleRate: number;
  private readonly maxConcurrent: number;
  private inFlight = 0;

  constructor(primary: FamilyRepository, secondary: FamilyRepository, options: ShadowReadOptions = {}) {
    this.primary = primary;
    this.secondary = secondary;
    this.sampleRate = options.sampleRate ?? parseShadowSampleRate(process.env.FALANCE_SHADOW_READ_SAMPLE_RATE);
    this.maxConcurrent = options.maxConcurrent ?? parseShadowConcurrency(process.env.FALANCE_SHADOW_READ_MAX_CONCURRENCY);
  }

  async findFamilyById(familyId: string): Promise<Family | null> { return this.read("findFamilyById", () => this.primary.findFamilyById(familyId), () => this.secondary.findFamilyById(familyId)); }
  async findFamilyByCreatedBy(telegramUserId: string): Promise<Family | null> { return this.read("findFamilyByCreatedBy", () => this.primary.findFamilyByCreatedBy(telegramUserId), () => this.secondary.findFamilyByCreatedBy(telegramUserId)); }
  async findActiveMemberByTelegramUserId(telegramUserId: string): Promise<FamilyMember | null> { return this.read("findActiveMemberByTelegramUserId", () => this.primary.findActiveMemberByTelegramUserId(telegramUserId), () => this.secondary.findActiveMemberByTelegramUserId(telegramUserId)); }
  async findMembersByFamilyId(familyId: string): Promise<FamilyMember[]> { return this.read("findMembersByFamilyId", () => this.primary.findMembersByFamilyId(familyId), () => this.secondary.findMembersByFamilyId(familyId)); }
  async findInvitationByCode(code: string): Promise<Invitation | null> { return this.read("findInvitationByCode", () => this.primary.findInvitationByCode(code), () => this.secondary.findInvitationByCode(code)); }
  async findPendingConfirmation(telegramUserId: string): Promise<PendingConfirmation | null> { return this.read("findPendingConfirmation", () => this.primary.findPendingConfirmation(telegramUserId), () => this.secondary.findPendingConfirmation(telegramUserId)); }
  async findPendingFamilyCreation(telegramUserId: string): Promise<PendingFamilyCreation | null> { return this.read("findPendingFamilyCreation", () => this.primary.findPendingFamilyCreation(telegramUserId), () => this.secondary.findPendingFamilyCreation(telegramUserId)); }
  async findPendingTransactionDraft(telegramUserId: string): Promise<PendingTransactionDraft | null> { return this.read("findPendingTransactionDraft", () => this.primary.findPendingTransactionDraft(telegramUserId), () => this.secondary.findPendingTransactionDraft(telegramUserId)); }
  async findDraftApprovalClaim(draftId: string): Promise<DraftApprovalClaim | null> { return this.read("findDraftApprovalClaim", () => this.primary.findDraftApprovalClaim(draftId), () => this.secondary.findDraftApprovalClaim(draftId)); }
  async findTransactionsByFamilyId(familyId: string): Promise<Transaction[]> { return this.read("findTransactionsByFamilyId", () => this.primary.findTransactionsByFamilyId(familyId), () => this.secondary.findTransactionsByFamilyId(familyId)); }

  createFamily(value: Family): Promise<void> { return this.primary.createFamily(value); }
  updateFamilyName(familyId: string, familyName: string): Promise<void> { return this.primary.updateFamilyName(familyId, familyName); }
  updateFamilyStatus(familyId: string, status: Family["status"]): Promise<void> { return this.primary.updateFamilyStatus(familyId, status); }
  createPendingConfirmation(value: PendingConfirmation): Promise<void> { return this.primary.createPendingConfirmation(value); }
  updatePendingConfirmationStatus(confirmationId: string, status: PendingConfirmation["status"]): Promise<void> { return this.primary.updatePendingConfirmationStatus(confirmationId, status); }
  createAuditLog(value: AuditLogEntry): Promise<void> { return this.primary.createAuditLog(value); }
  createTransaction(value: Transaction): Promise<void> { return this.primary.createTransaction(value); }
  updateTransaction(transactionId: string, value: Transaction): Promise<void> { return this.primary.updateTransaction(transactionId, value); }
  createMember(value: FamilyMember): Promise<void> { return this.primary.createMember(value); }
  updateMemberRole(memberId: string, newRole: MemberRole): Promise<void> { return this.primary.updateMemberRole(memberId, newRole); }
  updateMemberStatus(memberId: string, newStatus: MemberStatus): Promise<void> { return this.primary.updateMemberStatus(memberId, newStatus); }
  createInvitation(value: Invitation): Promise<void> { return this.primary.createInvitation(value); }
  markInvitationUsed(invitationId: string, telegramUserId: string, usedAt: string): Promise<void> { return this.primary.markInvitationUsed(invitationId, telegramUserId, usedAt); }
  revokeInvitation(invitationId: string): Promise<void> { return this.primary.revokeInvitation(invitationId); }
  createPendingFamilyCreation(value: PendingFamilyCreation): Promise<void> { return this.primary.createPendingFamilyCreation(value); }
  clearPendingFamilyCreation(telegramUserId: string): Promise<void> { return this.primary.clearPendingFamilyCreation(telegramUserId); }
  createPendingTransactionDraft(value: PendingTransactionDraft): Promise<void> { return this.primary.createPendingTransactionDraft(value); }
  updatePendingTransactionDraft(value: PendingTransactionDraft): Promise<void> { return this.primary.updatePendingTransactionDraft(value); }
  claimDraftApproval(draftId: string, telegramUserId: string, familyId: string, transactionId: string, claimedAt: string, leaseMs: number): Promise<boolean> { return this.primary.claimDraftApproval(draftId, telegramUserId, familyId, transactionId, claimedAt, leaseMs); }
  completeDraftApproval(draftId: string, completedAt: string): Promise<void> { return this.primary.completeDraftApproval(draftId, completedAt); }
  claimTelegramUpdate(updateId: number, claimedAt: string): Promise<boolean> { return this.primary.claimTelegramUpdate(updateId, claimedAt); }
  completeTelegramUpdate(updateId: number, completedAt: string): Promise<void> { return this.primary.completeTelegramUpdate(updateId, completedAt); }
  claimReceiptVision(familyId: string, telegramUserId: string, claimedAt: string, cooldownMs: number, windowMs: number, maxRequests: number, leaseMs: number): Promise<boolean> { return this.primary.claimReceiptVision(familyId, telegramUserId, claimedAt, cooldownMs, windowMs, maxRequests, leaseMs); }
  completeReceiptVision(familyId: string, telegramUserId: string, completedAt: string): Promise<void> { return this.primary.completeReceiptVision(familyId, telegramUserId, completedAt); }
  claimTextUsage(familyId: string, telegramUserId: string, claimedAt: string, cooldownMs: number, windowMs: number, maxRequests: number, leaseMs: number): Promise<boolean> { return this.primary.claimTextUsage(familyId, telegramUserId, claimedAt, cooldownMs, windowMs, maxRequests, leaseMs); }
  completeTextUsage(familyId: string, telegramUserId: string, completedAt: string): Promise<void> { return this.primary.completeTextUsage(familyId, telegramUserId, completedAt); }

  private async read<T>(operation: string, primaryRead: () => Promise<T>, secondaryRead: () => Promise<T>): Promise<T> {
    const result = await primaryRead();
    if (this.shouldCompare()) {
      this.inFlight += 1;
      void this.compare(operation, result, secondaryRead).finally(() => {
        this.inFlight -= 1;
      });
    }
    return result;
  }

  private shouldCompare(): boolean {
    return this.inFlight < this.maxConcurrent && Math.random() < this.sampleRate;
  }

  private async compare<T>(operation: string, primaryResult: T, secondaryRead: () => Promise<T>): Promise<void> {
    try {
      const secondaryResult = await secondaryRead();
      const primaryDigest = digest(primaryResult);
      const secondaryDigest = digest(secondaryResult);
      if (primaryDigest !== secondaryDigest) {
        console.warn("[ShadowRead] result mismatch", { operation, primaryDigest, secondaryDigest });
      }
    } catch (error) {
      console.warn("[ShadowRead] secondary read failed", { operation, errorCode: shadowReadErrorCode(error) });
    }
  }
}

export type ShadowReadOptions = {
  sampleRate?: number;
  maxConcurrent?: number;
};

function parseShadowSampleRate(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
}

function parseShadowConcurrency(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 4;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(32, parsed) : 4;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function shadowReadErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = /\[([a-z][a-z0-9_]{0,40})\]/.exec(error.message)?.[1];
  if (code && (code === "network" || code === "invalid_response" || /^http_[0-9]{3}$/.test(code))) return code;
  return "unknown";
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).sort().join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}
