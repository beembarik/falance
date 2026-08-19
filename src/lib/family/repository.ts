import type {
  Family,
  AuditLogEntry,
  FamilyMember,
  Invitation,
  MemberRole,
  MemberStatus,
  PendingConfirmation,
  PendingFamilyCreation,
  Transaction,
} from "./types";

export interface FamilyRepository {
  createFamily(family: Family): Promise<void>;
  updateFamilyName(familyId: string, familyName: string): Promise<void>;
  updateFamilyStatus(familyId: string, status: Family["status"]): Promise<void>;
  createPendingConfirmation(confirmation: PendingConfirmation): Promise<void>;
  findPendingConfirmation(telegramUserId: string): Promise<PendingConfirmation | null>;
  updatePendingConfirmationStatus(confirmationId: string, status: PendingConfirmation["status"]): Promise<void>;
  createAuditLog(entry: AuditLogEntry): Promise<void>;
  createTransaction(transaction: Transaction): Promise<void>;
  findTransactionsByFamilyId(familyId: string): Promise<Transaction[]>;
  findFamilyById(familyId: string): Promise<Family | null>;
  findFamilyByCreatedBy(telegramUserId: string): Promise<Family | null>;
  createMember(member: FamilyMember): Promise<void>;
  findActiveMemberByTelegramUserId(
    telegramUserId: string,
  ): Promise<FamilyMember | null>;
  findMembersByFamilyId(familyId: string): Promise<FamilyMember[]>;
  updateMemberRole(memberId: string, newRole: MemberRole): Promise<void>;
  updateMemberStatus(memberId: string, newStatus: MemberStatus): Promise<void>;
  createInvitation(invitation: Invitation): Promise<void>;
  findInvitationByCode(code: string): Promise<Invitation | null>;
  markInvitationUsed(
    invitationId: string,
    telegramUserId: string,
    usedAt: string,
  ): Promise<void>;
  revokeInvitation(invitationId: string): Promise<void>;
  createPendingFamilyCreation(pending: PendingFamilyCreation): Promise<void>;
  findPendingFamilyCreation(
    telegramUserId: string,
  ): Promise<PendingFamilyCreation | null>;
  clearPendingFamilyCreation(telegramUserId: string): Promise<void>;
}
