import type { FamilyRepository } from "./repository";
import type { AuditLogEntry, Family, FamilyMember, Invitation, MemberRole, MemberStatus, PendingConfirmation, PendingFamilyCreation, PendingTransactionDraft, Transaction } from "./types";
import { SupabaseAtomicRepository, type SupabaseServerClient } from "./supabase-atomic-repository";

export interface SupabaseWriteClient extends SupabaseServerClient {
  insert(table: string, row: Record<string, unknown>): Promise<{ error: { message?: string } | null }>;
  upsert(table: string, row: Record<string, unknown>, conflictColumns: readonly string[]): Promise<{ error: { message?: string } | null }>;
  update(table: string, match: Record<string, string | number>, values: Record<string, unknown>): Promise<{ affectedRows: number; error: { message?: string } | null }>;
}

/** Full repository implementation behind an explicit server-side client seam. */
export class SupabaseFamilyRepository extends SupabaseAtomicRepository implements FamilyRepository {
  constructor(private readonly writeClient: SupabaseWriteClient) { super(writeClient); }

  async createFamily(family: Family): Promise<void> { await this.insert("families", { family_id: family.familyId, family_name: family.familyName, status: family.status, created_at: family.createdAt, created_by: family.createdBy, plan: family.plan }); }
  async updateFamilyName(familyId: string, familyName: string): Promise<void> { await this.update("families", { family_id: familyId }, { family_name: familyName }); }
  async updateFamilyStatus(familyId: string, status: Family["status"]): Promise<void> { await this.update("families", { family_id: familyId }, { status }); }
  async createPendingConfirmation(value: PendingConfirmation): Promise<void> { await this.insert("pending_confirmations", { confirmation_id: value.confirmationId, telegram_user_id: value.telegramUserId, family_id: value.familyId, action: value.action, target: value.target, created_at: value.createdAt, expires_at: value.expiresAt, status: value.status }); }
  async updatePendingConfirmationStatus(confirmationId: string, status: PendingConfirmation["status"]): Promise<void> { await this.update("pending_confirmations", { confirmation_id: confirmationId }, { status }); }
  async createAuditLog(value: AuditLogEntry): Promise<void> { await this.insert("audit_log", { audit_id: value.auditId, family_id: value.familyId, actor_member_id: value.actorMemberId, actor_role: value.actorRole, action: value.action, target_type: value.targetType, target_id: value.targetId, previous_value: value.previousValue, new_value: value.newValue, created_at: value.createdAt }); }
  async createTransaction(value: Transaction): Promise<void> { await this.insert("transactions", transactionRow(value)); }
  async updateTransaction(transactionId: string, value: Transaction): Promise<void> { await this.update("transactions", { transaction_id: transactionId }, transactionRow(value)); }
  async createMember(value: FamilyMember): Promise<void> { await this.insert("members", { member_id: value.memberId, family_id: value.familyId, telegram_user_id: value.telegramUserId, name: value.name, username: value.username, role: value.role, status: value.status, joined_at: value.joinedAt }); }
  async updateMemberRole(memberId: string, newRole: MemberRole): Promise<void> { await this.update("members", { member_id: memberId }, { role: newRole }); }
  async updateMemberStatus(memberId: string, newStatus: MemberStatus): Promise<void> { await this.update("members", { member_id: memberId }, { status: newStatus }); }
  async createInvitation(value: Invitation): Promise<void> { await this.insert("invitations", { invitation_id: value.invitationId, family_id: value.familyId, code: value.code, created_by: value.createdBy, created_at: value.createdAt, expires_at: value.expiresAt, status: value.status, used_by: value.usedBy, used_at: value.usedAt }); }
  async markInvitationUsed(invitationId: string, telegramUserId: string, usedAt: string): Promise<void> { await this.update("invitations", { invitation_id: invitationId, status: "PENDING" }, { status: "USED", used_by: telegramUserId, used_at: usedAt }); }
  async revokeInvitation(invitationId: string): Promise<void> { await this.update("invitations", { invitation_id: invitationId, status: "PENDING" }, { status: "REVOKED" }); }
  async createPendingFamilyCreation(value: PendingFamilyCreation): Promise<void> { await this.upsert("pending_family_creations", { telegram_user_id: value.telegramUserId, family_name: value.familyName, created_at: value.createdAt, expires_at: value.expiresAt, status: "PENDING" }, ["telegram_user_id"]); }
  async clearPendingFamilyCreation(telegramUserId: string): Promise<void> { await this.update("pending_family_creations", { telegram_user_id: telegramUserId, status: "PENDING" }, { status: "COMPLETED" }); }
  async createPendingTransactionDraft(value: PendingTransactionDraft): Promise<void> {
    await this.update("pending_transaction_drafts", { telegram_user_id: value.telegramUserId, status: "PENDING" }, { status: "CANCELLED" });
    await this.insert("pending_transaction_drafts", draftRow(value));
  }
  async updatePendingTransactionDraft(value: PendingTransactionDraft): Promise<void> { await this.update("pending_transaction_drafts", { draft_id: value.draftId }, draftRow(value)); }
  async completeDraftApproval(draftId: string, completedAt: string): Promise<void> { await this.update("draft_approval_claims", { draft_id: draftId, status: "CLAIMED" }, { completed_at: completedAt, status: "COMPLETED" }); }
  async completeTelegramUpdate(updateId: number, completedAt: string): Promise<void> { await this.update("processed_telegram_updates", { update_id: updateId, status: "CLAIMED" }, { completed_at: completedAt, status: "COMPLETED" }); }
  async completeReceiptVision(familyId: string, telegramUserId: string, completedAt: string): Promise<void> { await this.completeUsage("ai_vision_usage", familyId, telegramUserId, completedAt); }
  async completeTextUsage(familyId: string, telegramUserId: string, completedAt: string): Promise<void> { await this.completeUsage("ai_text_usage", familyId, telegramUserId, completedAt); }

  private async completeUsage(table: string, familyId: string, telegramUserId: string, completedAt: string): Promise<void> {
    await this.update(table, { usage_key: `${familyId}:${telegramUserId}`, status: "IN_FLIGHT" }, { lease_until: completedAt, status: "COMPLETED" });
  }

  private async insert(table: string, row: Record<string, unknown>): Promise<void> { const result = await this.writeClient.insert(table, row); if (result.error) throw writeError(); }
  private async upsert(table: string, row: Record<string, unknown>, conflictColumns: readonly string[]): Promise<void> { const result = await this.writeClient.upsert(table, row, conflictColumns); if (result.error) throw writeError(); }
  private async update(table: string, match: Record<string, string | number>, values: Record<string, unknown>): Promise<void> { const result = await this.writeClient.update(table, match, values); if (result.error) throw writeError(); if (result.affectedRows !== 1) throw writeError(); }
}

function transactionRow(value: Transaction): Record<string, unknown> { return { transaction_id: value.transactionId, family_id: value.familyId, transaction_type: value.transactionType, amount_minor: value.amountMinor, currency: value.currency, transaction_date: value.transactionDate, description: value.description, category: value.category ?? null, created_by_member_id: value.createdByMemberId, created_at: value.createdAt, status: value.status }; }
function draftRow(value: PendingTransactionDraft): Record<string, unknown> { return { draft_id: value.draftId, telegram_user_id: value.telegramUserId, family_id: value.familyId, transaction_type: value.transactionType, amount_minor: value.amountMinor, currency: value.currency, transaction_date: value.transactionDate, description: value.description, confidence: value.confidence, transaction_date_inferred: value.transactionDateInferred ?? false, category_suggestion: value.categorySuggestion ?? null, description_suggestion: value.descriptionSuggestion ?? null, created_at: value.createdAt, expires_at: value.expiresAt, status: value.status }; }
function writeError(): Error { return new Error("Supabase write failed."); }
