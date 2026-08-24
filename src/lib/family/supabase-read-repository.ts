import type { FamilyRepository } from "./repository";
import type {
  AuditLogEntry,
  DraftApprovalClaim,
  Family,
  FamilyMember,
  Invitation,
  PendingConfirmation,
  PendingFamilyCreation,
  PendingTransactionDraft,
  Transaction,
  MemberRole,
  MemberStatus,
} from "./types";

export interface SupabaseReadQuery {
  select(columns: string): SupabaseReadQuery;
  eq(column: string, value: string | number): SupabaseReadQuery;
  in(column: string, values: readonly string[]): SupabaseReadQuery;
  order(column: string, options?: { ascending?: boolean }): SupabaseReadQuery;
  limit(count: number): SupabaseReadQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>;
  returns(): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string; code?: string } | null }>;
}

export interface SupabaseReadClient {
  from(table: string): SupabaseReadQuery;
}

export class SupabaseReadRepository implements FamilyRepository {
  private readonly client: SupabaseReadClient;
  constructor(client: SupabaseReadClient) { this.client = client; }

  async findFamilyById(familyId: string): Promise<Family | null> {
    return this.single("families", (query) => query.eq("family_id", familyId), toFamily);
  }

  async findFamilyByCreatedBy(telegramUserId: string): Promise<Family | null> {
    return this.single("families", (query) => query.eq("created_by", telegramUserId).eq("status", "ACTIVE"), toFamily);
  }

  async findActiveMemberByTelegramUserId(telegramUserId: string): Promise<FamilyMember | null> {
    return this.single("members", (query) => query.eq("telegram_user_id", telegramUserId).eq("status", "ACTIVE"), toMember);
  }

  async findMembersByFamilyId(familyId: string): Promise<FamilyMember[]> {
    return this.many("members", (query) => query.eq("family_id", familyId).order("joined_at", { ascending: true }), toMember);
  }

  async findInvitationByCode(code: string): Promise<Invitation | null> {
    return this.single("invitations", (query) => query.eq("code", code), toInvitation);
  }

  async findPendingConfirmation(telegramUserId: string): Promise<PendingConfirmation | null> {
    return this.single("pending_confirmations", (query) => query.eq("telegram_user_id", telegramUserId).eq("status", "PENDING"), toPendingConfirmation);
  }

  async findPendingFamilyCreation(telegramUserId: string): Promise<PendingFamilyCreation | null> {
    return this.single("pending_family_creations", (query) => query.eq("telegram_user_id", telegramUserId).eq("status", "PENDING"), toPendingFamilyCreation);
  }

  async findPendingTransactionDraft(telegramUserId: string): Promise<PendingTransactionDraft | null> {
    return this.single("pending_transaction_drafts", (query) => query.eq("telegram_user_id", telegramUserId).in("status", ["PENDING", "EDITING"]), toPendingTransactionDraft);
  }

  async findDraftApprovalClaim(draftId: string): Promise<DraftApprovalClaim | null> {
    return this.single("draft_approval_claims", (query) => query.eq("draft_id", draftId), toDraftApprovalClaim);
  }

  async findTransactionsByFamilyId(familyId: string): Promise<Transaction[]> {
    return this.many("transactions", (query) => query.eq("family_id", familyId).eq("status", "ACTIVE").order("transaction_date", { ascending: false }), toTransaction);
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  createFamily(_family: Family): Promise<void> { return unsupported("createFamily"); }
  updateFamilyName(_familyId: string, _familyName: string): Promise<void> { return unsupported("updateFamilyName"); }
  updateFamilyStatus(_familyId: string, _status: Family["status"]): Promise<void> { return unsupported("updateFamilyStatus"); }
  createPendingConfirmation(_confirmation: PendingConfirmation): Promise<void> { return unsupported("createPendingConfirmation"); }
  updatePendingConfirmationStatus(_confirmationId: string, _status: PendingConfirmation["status"]): Promise<void> { return unsupported("updatePendingConfirmationStatus"); }
  createAuditLog(_entry: AuditLogEntry): Promise<void> { return unsupported("createAuditLog"); }
  createTransaction(_transaction: Transaction): Promise<void> { return unsupported("createTransaction"); }
  updateTransaction(_transactionId: string, _transaction: Transaction): Promise<void> { return unsupported("updateTransaction"); }
  createMember(_member: FamilyMember): Promise<void> { return unsupported("createMember"); }
  updateMemberRole(_memberId: string, _newRole: MemberRole): Promise<void> { return unsupported("updateMemberRole"); }
  updateMemberStatus(_memberId: string, _newStatus: MemberStatus): Promise<void> { return unsupported("updateMemberStatus"); }
  createInvitation(_invitation: Invitation): Promise<void> { return unsupported("createInvitation"); }
  markInvitationUsed(_invitationId: string, _telegramUserId: string, _usedAt: string): Promise<void> { return unsupported("markInvitationUsed"); }
  revokeInvitation(_invitationId: string): Promise<void> { return unsupported("revokeInvitation"); }
  createPendingFamilyCreation(_pending: PendingFamilyCreation): Promise<void> { return unsupported("createPendingFamilyCreation"); }
  clearPendingFamilyCreation(_telegramUserId: string): Promise<void> { return unsupported("clearPendingFamilyCreation"); }
  createPendingTransactionDraft(_draft: PendingTransactionDraft): Promise<void> { return unsupported("createPendingTransactionDraft"); }
  updatePendingTransactionDraft(_draft: PendingTransactionDraft): Promise<void> { return unsupported("updatePendingTransactionDraft"); }
  claimDraftApproval(_draftId: string, _telegramUserId: string, _familyId: string, _transactionId: string, _claimedAt: string, _leaseMs: number): Promise<boolean> { return unsupported("claimDraftApproval"); }
  completeDraftApproval(_draftId: string, _completedAt: string): Promise<void> { return unsupported("completeDraftApproval"); }
  claimTelegramUpdate(_updateId: number, _claimedAt: string): Promise<boolean> { return unsupported("claimTelegramUpdate"); }
  completeTelegramUpdate(_updateId: number, _completedAt: string): Promise<void> { return unsupported("completeTelegramUpdate"); }
  claimReceiptVision(_familyId: string, _telegramUserId: string, _claimedAt: string, _cooldownMs: number, _windowMs: number, _maxRequests: number, _leaseMs: number): Promise<boolean> { return unsupported("claimReceiptVision"); }
  completeReceiptVision(_familyId: string, _telegramUserId: string, _completedAt: string): Promise<void> { return unsupported("completeReceiptVision"); }
  claimTextUsage(_familyId: string, _telegramUserId: string, _claimedAt: string, _cooldownMs: number, _windowMs: number, _maxRequests: number, _leaseMs: number): Promise<boolean> { return unsupported("claimTextUsage"); }
  completeTextUsage(_familyId: string, _telegramUserId: string, _completedAt: string): Promise<void> { return unsupported("completeTextUsage"); }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  private async single<T>(table: string, apply: (query: SupabaseReadQuery) => SupabaseReadQuery, map: (row: Record<string, unknown>) => T): Promise<T | null> {
    const result = await apply(this.client.from(table).select("*")) .maybeSingle();
    if (result.error) throw new Error(`Supabase read failed for ${table} [${safeReadErrorCode(result.error.code)}].`);
    return result.data ? map(result.data) : null;
  }

  private async many<T>(table: string, apply: (query: SupabaseReadQuery) => SupabaseReadQuery, map: (row: Record<string, unknown>) => T): Promise<T[]> {
    const result = await apply(this.client.from(table).select("*")).returns();
    if (result.error) throw new Error(`Supabase read failed for ${table} [${safeReadErrorCode(result.error.code)}].`);
    return (result.data ?? []).map(map);
  }
}

function safeReadErrorCode(code: string | undefined): string {
  return code && /^[a-z][a-z0-9_]{0,40}$/.test(code) ? code : "unknown";
}

function unsupported(operation: string): never {
  throw new Error(`Supabase read-only adapter does not support ${operation}.`);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) throw new Error("Invalid Supabase row.");
  return value;
}

function optionalString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : requiredString(row, key);
}

function requiredNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Invalid Supabase row.");
  return value;
}

function toFamily(row: Record<string, unknown>): Family {
  return { familyId: requiredString(row, "family_id"), familyName: requiredString(row, "family_name"), status: requiredString(row, "status") as Family["status"], createdAt: requiredString(row, "created_at"), createdBy: requiredString(row, "created_by"), plan: requiredString(row, "plan") };
}

function toMember(row: Record<string, unknown>): FamilyMember {
  return { memberId: requiredString(row, "member_id"), familyId: requiredString(row, "family_id"), telegramUserId: requiredString(row, "telegram_user_id"), name: requiredString(row, "name"), username: optionalString(row, "username"), role: requiredString(row, "role") as FamilyMember["role"], status: requiredString(row, "status") as FamilyMember["status"], joinedAt: requiredString(row, "joined_at") };
}

function toInvitation(row: Record<string, unknown>): Invitation {
  return { invitationId: requiredString(row, "invitation_id"), familyId: requiredString(row, "family_id"), code: requiredString(row, "code"), createdBy: requiredString(row, "created_by"), createdAt: requiredString(row, "created_at"), expiresAt: requiredString(row, "expires_at"), status: requiredString(row, "status") as Invitation["status"], usedBy: optionalString(row, "used_by"), usedAt: optionalString(row, "used_at") };
}

function toPendingConfirmation(row: Record<string, unknown>): PendingConfirmation {
  return { confirmationId: requiredString(row, "confirmation_id"), telegramUserId: requiredString(row, "telegram_user_id"), familyId: requiredString(row, "family_id"), action: requiredString(row, "action") as PendingConfirmation["action"], target: requiredString(row, "target"), createdAt: requiredString(row, "created_at"), expiresAt: requiredString(row, "expires_at"), status: requiredString(row, "status") as PendingConfirmation["status"] };
}

function toPendingFamilyCreation(row: Record<string, unknown>): PendingFamilyCreation {
  return { telegramUserId: requiredString(row, "telegram_user_id"), familyName: optionalString(row, "family_name"), createdAt: requiredString(row, "created_at"), expiresAt: requiredString(row, "expires_at") };
}

function toPendingTransactionDraft(row: Record<string, unknown>): PendingTransactionDraft {
  return { draftId: requiredString(row, "draft_id"), telegramUserId: requiredString(row, "telegram_user_id"), familyId: requiredString(row, "family_id"), transactionType: requiredString(row, "transaction_type") as PendingTransactionDraft["transactionType"], amountMinor: requiredNumber(row, "amount_minor"), currency: requiredString(row, "currency"), transactionDate: requiredString(row, "transaction_date"), description: requiredString(row, "description"), confidence: requiredString(row, "confidence") as PendingTransactionDraft["confidence"], transactionDateInferred: row.transaction_date_inferred === true, categorySuggestion: optionalString(row, "category_suggestion") ?? undefined, descriptionSuggestion: optionalString(row, "description_suggestion") ?? undefined, createdAt: requiredString(row, "created_at"), expiresAt: requiredString(row, "expires_at"), status: requiredString(row, "status") as PendingTransactionDraft["status"] };
}

function toDraftApprovalClaim(row: Record<string, unknown>): DraftApprovalClaim {
  return { draftId: requiredString(row, "draft_id"), telegramUserId: requiredString(row, "telegram_user_id"), familyId: requiredString(row, "family_id"), transactionId: requiredString(row, "transaction_id"), claimedAt: requiredString(row, "claimed_at"), completedAt: optionalString(row, "completed_at"), leaseUntil: requiredString(row, "lease_until"), status: requiredString(row, "status") as DraftApprovalClaim["status"] };
}

function toTransaction(row: Record<string, unknown>): Transaction {
  return { transactionId: requiredString(row, "transaction_id"), familyId: requiredString(row, "family_id"), transactionType: requiredString(row, "transaction_type") as Transaction["transactionType"], amountMinor: requiredNumber(row, "amount_minor"), currency: requiredString(row, "currency"), transactionDate: requiredString(row, "transaction_date"), description: requiredString(row, "description"), createdByMemberId: requiredString(row, "created_by_member_id"), createdAt: requiredString(row, "created_at"), status: requiredString(row, "status") as Transaction["status"], category: optionalString(row, "category") ?? undefined };
}
