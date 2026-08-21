import {
  GoogleConfigurationError,
  GoogleSheetsClient,
  type GoogleOperation,
} from "../google/sheets-client";
import type { FamilyRepository } from "./repository";
import type { AuditLogEntry, Family, FamilyMember, Invitation, PendingConfirmation, PendingFamilyCreation, PendingTransactionDraft, Transaction } from "./types";

/**
 * Repository backed by the single Falancé database spreadsheet configured for
 * this deployment. Family isolation is enforced by filtering rows with the
 * server-resolved family_id; Telegram input never selects a spreadsheet.
 */
const sharedGoogleSheetsClient = new GoogleSheetsClient();
const telegramUpdateClaimLocks = new Map<string, Promise<boolean>>();
const receiptVisionClaimLocks = new Map<string, Promise<boolean>>();
const TELEGRAM_UPDATE_CLAIM_LEASE_MS = 5 * 60 * 1000;

export class GoogleSheetsFamilyRepository implements FamilyRepository {
  private readonly client: GoogleSheetsClient;

  constructor(client = sharedGoogleSheetsClient) {
    this.client = client;
  }

  async createFamily(family: Family): Promise<void> {
    const existing = await this.findFamilyById(family.familyId);
    if (existing) return;
    await this.append("Families", [
      family.familyId, family.familyName, family.status,
      family.createdAt, family.createdBy, family.plan,
    ], "createFamily");
  }

  async updateFamilyName(familyId: string, familyName: string): Promise<void> {
    const rows = await this.rows("Families", "updateFamilyName");
    const index = rows.findIndex((row) => row[0] === familyId);
    if (index < 0) throw new GoogleConfigurationError("Family registry record is missing.");
    const row = rows[index];
    if (row[1] === familyName) return;
    await this.client.updateValues(this.registryId(), `Families!A${index + 2}`, [[
      row[0], familyName, ...row.slice(2),
    ]], "updateFamilyName");
  }

  async updateFamilyStatus(familyId: string, status: Family["status"]): Promise<void> {
    const rows = await this.rows("Families", "updateFamilyStatus");
    const index = rows.findIndex((row) => row[0] === familyId);
    if (index < 0) throw new GoogleConfigurationError("Family registry record is missing.");
    const row = rows[index];
    if (row[2] === status) return;
    await this.client.updateValues(this.registryId(), `Families!A${index + 2}`, [[
      row[0], row[1], status, ...row.slice(3),
    ]], "updateFamilyStatus");
  }

  async createPendingConfirmation(confirmation: PendingConfirmation): Promise<void> {
    const existing = await this.findPendingConfirmation(confirmation.telegramUserId);
    if (existing) {
      await this.updatePendingConfirmationStatus(existing.confirmationId, "CANCELLED");
    }
    await this.append("Pending Confirmations", [
      confirmation.confirmationId,
      confirmation.telegramUserId,
      confirmation.familyId,
      confirmation.action,
      confirmation.target,
      confirmation.createdAt,
      confirmation.expiresAt,
      confirmation.status,
    ], "createPendingConfirmation");
  }

  async findPendingConfirmation(telegramUserId: string): Promise<PendingConfirmation | null> {
    const row = (await this.rows("Pending Confirmations", "readPendingConfirmations")).find(
      (value) => value[1] === telegramUserId && value[7] === "PENDING",
    );
    return row ? pendingConfirmationFromRow(row) : null;
  }

  async updatePendingConfirmationStatus(
    confirmationId: string,
    status: PendingConfirmation["status"],
  ): Promise<void> {
    const rows = await this.rows("Pending Confirmations", "updatePendingConfirmation");
    const index = rows.findIndex((row) => row[0] === confirmationId);
    if (index < 0) throw new GoogleConfigurationError("Pending confirmation record is missing.");
    const row = rows[index];
    if (row[7] === status) return;
    await this.client.updateValues(this.registryId(), `Pending Confirmations!A${index + 2}`, [[
      ...row.slice(0, 7), status,
    ]], "updatePendingConfirmation");
  }

  async createAuditLog(entry: AuditLogEntry): Promise<void> {
    await this.append("Audit Log", [
      entry.auditId,
      entry.familyId,
      entry.actorMemberId,
      entry.actorRole,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.previousValue ?? "",
      entry.newValue ?? "",
      entry.createdAt,
    ], "createAuditLog");
  }

  async createTransaction(transaction: Transaction): Promise<void> {
    const existing = (await this.findTransactionsByFamilyId(transaction.familyId)).find(
      (candidate) => candidate.transactionId === transaction.transactionId,
    );
    if (existing) return;
    await this.append("Transactions", [
      transaction.transactionId,
      transaction.familyId,
      transaction.transactionType,
      String(transaction.amountMinor),
      transaction.currency,
      transaction.transactionDate,
      transaction.description,
      transaction.createdByMemberId,
      transaction.createdAt,
      transaction.status,
    ], "createTransaction");
  }

  async updateTransaction(transactionId: string, transaction: Transaction): Promise<void> {
    const rows = await this.rows("Transactions", "updateTransaction");
    const index = rows.findIndex((row) => row[0] === transactionId);
    if (index < 0) throw new GoogleConfigurationError("Transaction registry record is missing.");
    await this.client.updateValues(this.registryId(), `Transactions!A${index + 2}`, [[
      transaction.transactionId,
      transaction.familyId,
      transaction.transactionType,
      String(transaction.amountMinor),
      transaction.currency,
      transaction.transactionDate,
      transaction.description,
      transaction.createdByMemberId,
      transaction.createdAt,
      transaction.status,
    ]], "updateTransaction");
  }

  async findTransactionsByFamilyId(familyId: string): Promise<Transaction[]> {
    return (await this.rows("Transactions", "readTransactions"))
      .filter((row) => row[1] === familyId)
      .map(transactionFromRow);
  }

  async findFamilyById(familyId: string): Promise<Family | null> {
    const row = (await this.rows("Families", "readFamilies")).find((value) => value[0] === familyId);
    return row ? familyFromRow(row) : null;
  }

  async findFamilyByCreatedBy(telegramUserId: string): Promise<Family | null> {
    const row = (await this.rows("Families", "readFamilies")).find(
      (value) => value[4] === telegramUserId && value[2] === "ACTIVE",
    );
    return row ? familyFromRow(row) : null;
  }

  async createMember(member: FamilyMember): Promise<void> {
    const existingRows = await this.rows("Members", "readMembers");
    if (existingRows.some((row) => row[0] === member.memberId)) return;
    await this.append("Members", [
      member.memberId, member.familyId, member.telegramUserId, member.name,
      member.username ?? "", member.role, member.status, member.joinedAt,
    ], "createMember");
  }

  async findActiveMemberByTelegramUserId(telegramUserId: string): Promise<FamilyMember | null> {
    const row = (await this.rows("Members", "readMembers")).find(
      (value) => value[2] === telegramUserId && value[6] === "ACTIVE",
    );
    return row ? memberFromRow(row) : null;
  }

  async findMembersByFamilyId(familyId: string): Promise<FamilyMember[]> {
    return (await this.rows("Members", "readMembers"))
      .filter((row) => row[1] === familyId)
      .map(memberFromRow);
  }

  async updateMemberRole(memberId: string, newRole: FamilyMember["role"]): Promise<void> {
    const rows = await this.rows("Members", "updateMemberRole");
    const index = rows.findIndex((row) => row[0] === memberId);
    if (index < 0) throw new GoogleConfigurationError("Member registry record is missing.");
    const row = rows[index];
    if (row[6] !== "ACTIVE") return;
    await this.client.updateValues(this.registryId(), `Members!A${index + 2}`, [[
      ...row.slice(0, 5), newRole, ...row.slice(6),
    ]], "updateMemberRole");
  }

  async updateMemberStatus(memberId: string, newStatus: FamilyMember["status"]): Promise<void> {
    const rows = await this.rows("Members", "updateMemberStatus");
    const index = rows.findIndex((row) => row[0] === memberId);
    if (index < 0) throw new GoogleConfigurationError("Member registry record is missing.");
    const row = rows[index];
    if (row[6] === newStatus) return;
    await this.client.updateValues(this.registryId(), `Members!A${index + 2}`, [[
      ...row.slice(0, 6), newStatus, ...row.slice(7),
    ]], "updateMemberStatus");
  }

  async createInvitation(invitation: Invitation): Promise<void> {
    const existing = await this.findInvitationByCode(invitation.code);
    if (existing) return;
    await this.append("Invitations", [
      invitation.invitationId, invitation.familyId, invitation.code, invitation.createdBy,
      invitation.createdAt, invitation.expiresAt, invitation.usedAt ?? "",
      invitation.usedBy ?? "", invitation.status,
    ], "createInvitation");
  }

  async findInvitationByCode(code: string): Promise<Invitation | null> {
    const row = (await this.rows("Invitations", "readInvitations")).find((value) => value[2] === code);
    return row ? invitationFromRow(row) : null;
  }

  async markInvitationUsed(invitationId: string, telegramUserId: string, usedAt: string): Promise<void> {
    const rows = await this.rows("Invitations", "markInvitationUsed");
    const index = rows.findIndex((row) => row[0] === invitationId);
    if (index < 0) throw new GoogleConfigurationError("Invitation registry record is missing.");
    const row = rows[index];
    if (row[8] !== "PENDING") return;
    await this.client.updateValues(this.registryId(), `Invitations!A${index + 2}`, [[
      ...row.slice(0, 6), usedAt, telegramUserId, "USED",
    ]], "markInvitationUsed");
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const rows = await this.rows("Invitations", "revokeInvitation");
    const index = rows.findIndex((row) => row[0] === invitationId);
    if (index < 0) throw new GoogleConfigurationError("Invitation registry record is missing.");
    const row = rows[index];
    if (row[8] !== "PENDING") return;
    await this.client.updateValues(this.registryId(), `Invitations!A${index + 2}`, [[
      ...row.slice(0, 8), "REVOKED",
    ]], "revokeInvitation");
  }

  async createPendingTransactionDraft(draft: PendingTransactionDraft): Promise<void> {
    const existing = await this.findPendingTransactionDraft(draft.telegramUserId);
    if (existing) {
      await this.updatePendingTransactionDraft({ ...existing, status: "CANCELLED" });
    }
    await this.append("Pending Transaction Drafts", [
      draft.draftId,
      draft.telegramUserId,
      draft.familyId,
      draft.transactionType,
      String(draft.amountMinor),
      draft.currency,
      draft.transactionDate,
      draft.description,
      draft.confidence,
      draft.createdAt,
      draft.expiresAt,
      draft.status,
    ], "createPendingTransactionDraft");
  }

  async findPendingTransactionDraft(telegramUserId: string): Promise<PendingTransactionDraft | null> {
    const row = (await this.rows("Pending Transaction Drafts", "readPendingTransactionDrafts")).find(
      (value) => value[1] === telegramUserId && (value[11] === "PENDING" || value[11] === "EDITING"),
    );
    return row ? pendingTransactionDraftFromRow(row) : null;
  }

  async updatePendingTransactionDraft(draft: PendingTransactionDraft): Promise<void> {
    const rows = await this.rows("Pending Transaction Drafts", "updatePendingTransactionDraft");
    const index = rows.findIndex((row) => row[0] === draft.draftId);
    if (index < 0) throw new GoogleConfigurationError("Pending transaction draft record is missing.");
    await this.client.updateValues(this.registryId(), `Pending Transaction Drafts!A${index + 2}`, [[
      draft.draftId,
      draft.telegramUserId,
      draft.familyId,
      draft.transactionType,
      String(draft.amountMinor),
      draft.currency,
      draft.transactionDate,
      draft.description,
      draft.confidence,
      draft.createdAt,
      draft.expiresAt,
      draft.status,
    ]], "updatePendingTransactionDraft");
  }

  async createPendingFamilyCreation(pending: PendingFamilyCreation): Promise<void> {
    await this.clearPendingFamilyCreation(pending.telegramUserId);
    await this.append("Pending Family Creations", [
      pending.telegramUserId, pending.familyName ?? "", pending.createdAt, pending.expiresAt, "PENDING",
    ], "createPendingFamilyCreation");
  }

  async findPendingFamilyCreation(telegramUserId: string): Promise<PendingFamilyCreation | null> {
    const row = (await this.rows("Pending Family Creations", "readPendingFamilyCreations")).find(
      (value) => value[0] === telegramUserId && value[4] === "PENDING",
    );
    return row ? {
      telegramUserId: row[0], familyName: row[1] || null, createdAt: row[2], expiresAt: row[3],
    } : null;
  }

  async clearPendingFamilyCreation(telegramUserId: string): Promise<void> {
    const rows = await this.rows("Pending Family Creations", "completePendingFamilyCreation");
    const index = rows.findIndex((row) => row[0] === telegramUserId && row[4] === "PENDING");
    if (index >= 0) {
      const row = rows[index];
      await this.client.updateValues(this.registryId(), `Pending Family Creations!A${index + 2}`, [[
        row[0], row[1], row[2], row[3], "COMPLETED",
      ]], "completePendingFamilyCreation");
    }
  }

  async claimTelegramUpdate(updateId: number, claimedAt: string): Promise<boolean> {
    const lockKey = `${this.registryId()}:${updateId}`;
    const previous = telegramUpdateClaimLocks.get(lockKey) ?? Promise.resolve(false);
    const claim = previous.catch(() => false).then(() => this.claimTelegramUpdateWithoutLock(updateId, claimedAt));
    const trackedClaim = claim.finally(() => {
      if (telegramUpdateClaimLocks.get(lockKey) === trackedClaim) telegramUpdateClaimLocks.delete(lockKey);
    });
    telegramUpdateClaimLocks.set(lockKey, trackedClaim);
    return trackedClaim;
  }

  async completeTelegramUpdate(updateId: number, completedAt: string): Promise<void> {
    const rows = await this.rows("Processed Telegram Updates", "completeTelegramUpdate");
    const index = rows.findIndex((row) => row[0] === String(updateId));
    if (index < 0) throw new GoogleConfigurationError("Processed Telegram update record is missing.");
    const row = rows[index];
    if (row[3] === "COMPLETED") return;
    await this.client.updateValues(this.registryId(), `Processed Telegram Updates!A${index + 2}`, [[
      row[0], row[1], completedAt, "COMPLETED",
    ]], "completeTelegramUpdate");
  }

  async claimReceiptVision(
    familyId: string,
    telegramUserId: string,
    claimedAt: string,
    cooldownMs: number,
    windowMs: number,
    maxRequests: number,
    leaseMs: number,
  ): Promise<boolean> {
    const lockKey = `${this.registryId()}:${familyId}:${telegramUserId}`;
    const previous = receiptVisionClaimLocks.get(lockKey) ?? Promise.resolve(false);
    const claim = previous.catch(() => false).then(() => this.claimReceiptVisionWithoutLock(
      familyId,
      telegramUserId,
      claimedAt,
      cooldownMs,
      windowMs,
      maxRequests,
      leaseMs,
    ));
    const trackedClaim = claim.finally(() => {
      if (receiptVisionClaimLocks.get(lockKey) === trackedClaim) receiptVisionClaimLocks.delete(lockKey);
    });
    receiptVisionClaimLocks.set(lockKey, trackedClaim);
    return trackedClaim;
  }

  async completeReceiptVision(familyId: string, telegramUserId: string, completedAt: string): Promise<void> {
    void completedAt;
    const rows = await this.rows("AI Vision Usage", "completeReceiptVision");
    const usageKey = `${familyId}:${telegramUserId}`;
    const index = rows.findIndex((row) => row[0] === usageKey);
    if (index < 0) throw new GoogleConfigurationError("AI vision usage record is missing.");
    const row = rows[index];
    if (row[7] === "COMPLETED" && !row[6]) return;
    await this.client.updateValues(this.registryId(), `AI Vision Usage!A${index + 2}`, [[
      ...row.slice(0, 6), "", "COMPLETED",
    ]], "completeReceiptVision");
  }

  private async claimReceiptVisionWithoutLock(
    familyId: string,
    telegramUserId: string,
    claimedAt: string,
    cooldownMs: number,
    windowMs: number,
    maxRequests: number,
    leaseMs: number,
  ): Promise<boolean> {
    const rows = await this.rows("AI Vision Usage", "claimReceiptVision");
    const usageKey = `${familyId}:${telegramUserId}`;
    const index = rows.findIndex((row) => row[0] === usageKey);
    const claimedAtMs = Date.parse(claimedAt);
    if (Number.isNaN(claimedAtMs)) return false;
    const leaseUntil = new Date(claimedAtMs + leaseMs).toISOString();
    if (index < 0) {
      await this.append("AI Vision Usage", [
        usageKey,
        familyId,
        telegramUserId,
        claimedAt,
        "1",
        claimedAt,
        leaseUntil,
        "IN_FLIGHT",
      ], "claimReceiptVision");
      return true;
    }

    const row = rows[index];
    const previousLeaseMs = Date.parse(row[6]);
    if (!Number.isNaN(previousLeaseMs) && previousLeaseMs > claimedAtMs) return false;

    const previousClaimMs = Date.parse(row[5]);
    if (!Number.isNaN(previousClaimMs) && claimedAtMs - previousClaimMs < cooldownMs) return false;

    const previousWindowMs = Date.parse(row[3]);
    const previousCount = Number(row[4]);
    const windowActive = !Number.isNaN(previousWindowMs) && claimedAtMs - previousWindowMs < windowMs;
    const requestCount = windowActive ? previousCount + 1 : 1;
    if (windowActive && (!Number.isSafeInteger(previousCount) || requestCount > maxRequests)) return false;

    await this.client.updateValues(this.registryId(), `AI Vision Usage!A${index + 2}`, [[
      usageKey,
      familyId,
      telegramUserId,
      windowActive ? row[3] : claimedAt,
      String(requestCount),
      claimedAt,
      leaseUntil,
      "IN_FLIGHT",
    ]], "claimReceiptVision");
    return true;
  }

  private async claimTelegramUpdateWithoutLock(updateId: number, claimedAt: string): Promise<boolean> {
    const rows = await this.rows("Processed Telegram Updates", "claimTelegramUpdate");
    const index = rows.findIndex((row) => row[0] === String(updateId));
    if (index < 0) {
      await this.append("Processed Telegram Updates", [String(updateId), claimedAt, "", "CLAIMED"], "claimTelegramUpdate");
      return true;
    }

    const row = rows[index];
    if (row[3] === "COMPLETED") return false;
    const previousClaimedAt = Date.parse(row[1]);
    const currentClaimedAt = Date.parse(claimedAt);
    if (!Number.isNaN(previousClaimedAt) && !Number.isNaN(currentClaimedAt) && currentClaimedAt - previousClaimedAt >= TELEGRAM_UPDATE_CLAIM_LEASE_MS) {
      await this.client.updateValues(this.registryId(), `Processed Telegram Updates!A${index + 2}`, [[
        row[0], claimedAt, "", "CLAIMED",
      ]], "claimTelegramUpdate");
      return true;
    }
    return false;
  }

  private async rows(sheet: string, operation: GoogleOperation): Promise<string[][]> {
    await this.client.ensureRegistry(this.registryId(), operation);
    const values = await this.client.getValues(this.registryId(), sheet, operation);
    return values.slice(1);
  }

  private async append(sheet: string, row: string[], operation: GoogleOperation): Promise<void> {
    await this.client.ensureRegistry(this.registryId(), operation);
    await this.client.appendRows(this.registryId(), sheet, [row], operation);
  }

  private registryId(): string {
    const registryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
    if (!registryId) throw new GoogleConfigurationError("Google family registry is not configured.");
    return registryId;
  }
}

function memberFromRow(row: string[]): FamilyMember {
  return {
    memberId: row[0], familyId: row[1], telegramUserId: row[2], name: row[3],
    username: row[4] || null, role: row[5] as FamilyMember["role"],
    status: row[6] as FamilyMember["status"], joinedAt: row[7],
  };
}

function pendingConfirmationFromRow(row: string[]): PendingConfirmation {
  return {
    confirmationId: row[0],
    telegramUserId: row[1],
    familyId: row[2],
    action: row[3] as PendingConfirmation["action"],
    target: row[4],
    createdAt: row[5],
    expiresAt: row[6],
    status: row[7] as PendingConfirmation["status"],
  };
}

function pendingTransactionDraftFromRow(row: string[]): PendingTransactionDraft {
  return {
    draftId: row[0],
    telegramUserId: row[1],
    familyId: row[2],
    transactionType: row[3] as PendingTransactionDraft["transactionType"],
    amountMinor: Number(row[4]),
    currency: row[5],
    transactionDate: row[6],
    description: row[7],
    confidence: row[8] as PendingTransactionDraft["confidence"],
    createdAt: row[9],
    expiresAt: row[10],
    status: row[11] as PendingTransactionDraft["status"],
  };
}

function transactionFromRow(row: string[]): Transaction {
  return {
    transactionId: row[0],
    familyId: row[1],
    transactionType: row[2] as Transaction["transactionType"],
    amountMinor: Number(row[3]),
    currency: row[4],
    transactionDate: row[5],
    description: row[6],
    createdByMemberId: row[7],
    createdAt: row[8],
    status: row[9] as Transaction["status"],
  };
}

function familyFromRow(row: string[]): Family {
  return {
    familyId: row[0], familyName: row[1], status: row[2] as Family["status"],
    createdAt: row[3], createdBy: row[4], plan: row[5],
  };
}

function invitationFromRow(row: string[]): Invitation {
  return {
    invitationId: row[0], familyId: row[1], code: row[2], createdBy: row[3],
    createdAt: row[4], expiresAt: row[5],     usedAt: row[6] || null, usedBy: row[7] || null,
    status: row[8] as Invitation["status"],

  };
}
