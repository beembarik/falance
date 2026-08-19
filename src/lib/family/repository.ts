import type {
  Family,
  FamilyMember,
  Invitation,
  MemberRole,
  MemberStatus,
  PendingFamilyCreation,
} from "./types";

export interface FamilyRepository {
  createFamily(family: Family): Promise<void>;
  updateFamilyName(familyId: string, familyName: string): Promise<void>;
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
