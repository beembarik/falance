import type {
  Family,
  FamilyMember,
  Invitation,
  PendingFamilyCreation,
} from "./types";

export interface FamilyRepository {
  createFamilySpreadsheet(familyName: string, familyId: string): Promise<string>;
  createFamily(family: Family): Promise<void>;
  findFamilyById(familyId: string): Promise<Family | null>;
  createMember(member: FamilyMember): Promise<void>;
  findActiveMemberByTelegramUserId(
    telegramUserId: string,
  ): Promise<FamilyMember | null>;
  createInvitation(invitation: Invitation): Promise<void>;
  findInvitationByCode(code: string): Promise<Invitation | null>;
  markInvitationUsed(
    invitationId: string,
    telegramUserId: string,
    usedAt: string,
  ): Promise<void>;
  createPendingFamilyCreation(pending: PendingFamilyCreation): Promise<void>;
  findPendingFamilyCreation(
    telegramUserId: string,
  ): Promise<PendingFamilyCreation | null>;
  clearPendingFamilyCreation(telegramUserId: string): Promise<void>;
}
