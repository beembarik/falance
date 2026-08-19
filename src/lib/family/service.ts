import { randomUUID } from "node:crypto";

import type { FamilyRepository } from "./repository";
import type {
  Family,
  FamilyMember,
  Invitation,
  MemberRole,
  TelegramUser,
} from "./types";

const FAMILY_NAME_MAX_LENGTH = 80;
const DEFAULT_INVITATION_EXPIRY_HOURS = 24;
const FAMILY_CREATION_EXPIRY_MINUTES = 15;

export class FamilyServiceError extends Error {}
export class AlreadyRegisteredError extends FamilyServiceError {}
export class UnauthorizedError extends FamilyServiceError {}
export class InvitationError extends FamilyServiceError {}
export class MemberManagementError extends FamilyServiceError {}

export class FamilyService {
  private readonly repository: FamilyRepository;

  constructor(repository: FamilyRepository) {
    this.repository = repository;
  }

  async getActiveMembership(telegramUserId: string): Promise<FamilyMember | null> {
    return this.repository.findActiveMemberByTelegramUserId(telegramUserId);
  }

  async beginFamilyCreation(user: TelegramUser): Promise<void> {
    if (await this.getActiveMembership(user.telegramUserId)) {
      throw new AlreadyRegisteredError("User already belongs to a family.");
    }

    const now = new Date();
    await this.repository.createPendingFamilyCreation({
      telegramUserId: user.telegramUserId,
      familyName: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + FAMILY_CREATION_EXPIRY_MINUTES * 60 * 1000,
      ).toISOString(),
    });
  }

  async createFamilyFromPending(
    user: TelegramUser,
    familyName: string,
  ): Promise<Family> {
    const pending = await this.repository.findPendingFamilyCreation(user.telegramUserId);
    if (!pending || new Date(pending.expiresAt) <= new Date()) {
      throw new FamilyServiceError("No active family creation request.");
    }

    const normalizedName = normalizeFamilyName(familyName);
    const activeMembership = await this.getActiveMembership(user.telegramUserId);
    if (activeMembership) {
      const activeFamily = await this.repository.findFamilyById(activeMembership.familyId);
      if (activeFamily?.createdBy === user.telegramUserId) {
        await this.repository.clearPendingFamilyCreation(user.telegramUserId);
        return activeFamily;
      }
      throw new AlreadyRegisteredError("User already belongs to a family.");
    }

    // A family row may have been written before a transient membership-write
    // failure. Reuse it instead of creating a second family on retry.
    const existingFamily = await this.repository.findFamilyByCreatedBy(user.telegramUserId);
    if (existingFamily) {
      const now = new Date().toISOString();
      await this.repository.createMember(
        createMember(existingFamily.familyId, user, "OWNER", now),
      );
      await this.repository.clearPendingFamilyCreation(user.telegramUserId);
      return existingFamily;
    }

    const family: Family = {
      familyId: createId("fam"),
      familyName: normalizedName,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      createdBy: user.telegramUserId,
      plan: "MVP",
    };
    const owner = createMember(family.familyId, user, "OWNER", family.createdAt);

    // The repository writes both records to the single authoritative
    // spreadsheet. Pending state is only completed after both writes succeed.
    await this.repository.createFamily(family);
    await this.repository.createMember(owner);
    await this.repository.clearPendingFamilyCreation(user.telegramUserId);

    return family;
  }

  async listFamilyMembers(telegramUserId: string): Promise<FamilyMember[]> {
    const member = await this.requireActiveMember(telegramUserId);
    return (await this.repository.findMembersByFamilyId(member.familyId)).filter(
      (familyMember) => familyMember.status === "ACTIVE",
    );
  }

  async requireAuthorizedFamily(
    telegramUserId: string,
    requestedFamilyId: string,
  ): Promise<Family> {
    const member = await this.requireActiveMember(telegramUserId);
    if (member.familyId !== requestedFamilyId) {
      throw new UnauthorizedError("User is not authorized for this family.");
    }

    const family = await this.repository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }
    return family;
  }

  async createInvitation(user: TelegramUser): Promise<Invitation> {
    const member = await this.requireActiveMember(user.telegramUserId);
    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      throw new UnauthorizedError("Only owners and admins can create invitations.");
    }

    const family = await this.repository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new FamilyServiceError("Family is unavailable.");
    }

    const now = new Date();
    const invitation: Invitation = {
      invitationId: createId("inv"),
      familyId: family.familyId,
      code: createInvitationCode(),
      createdBy: user.telegramUserId,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + getInvitationExpiryHours() * 60 * 60 * 1000,
      ).toISOString(),
      status: "PENDING",
      usedBy: null,
      usedAt: null,
    };

    await this.repository.createInvitation(invitation);
    return invitation;
  }

  async revokeInvitation(user: TelegramUser, code: string): Promise<void> {
    const member = await this.requireActiveMember(user.telegramUserId);
    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      throw new UnauthorizedError("Only owners and admins can revoke invitations.");
    }

    const invitation = await this.repository.findInvitationByCode(normalizeInvitationCode(code));
    if (!invitation || invitation.familyId !== member.familyId) {
      throw new InvitationError("Invitation is invalid.");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationError("Only pending invitations can be revoked.");
    }

    await this.repository.revokeInvitation(invitation.invitationId);
  }

  async changeMemberRole(
    actor: TelegramUser,
    targetMemberId: string,
    newRole: MemberRole,
  ): Promise<void> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can change member roles.");
    }

    const family = await this.repository.findFamilyById(actorMember.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }

    if (newRole !== "ADMIN" && newRole !== "MEMBER") {
      throw new MemberManagementError("Only MEMBER and ADMIN roles can be assigned.");
    }

    const target = (await this.repository.findMembersByFamilyId(actorMember.familyId)).find(
      (candidate) => candidate.memberId === targetMemberId && candidate.status === "ACTIVE",
    );
    if (!target) {
      throw new MemberManagementError("Member is not found in the active family.");
    }
    if (target.role === "OWNER") {
      throw new MemberManagementError("The OWNER role cannot be changed.");
    }
    if (target.role === newRole) {
      throw new MemberManagementError("Member already has this role.");
    }

    await this.repository.updateMemberRole(target.memberId, newRole);
  }

  async deactivateMember(
    actor: TelegramUser,
    targetMemberId: string,
    confirmation: string,
  ): Promise<void> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can deactivate members.");
    }
    if (confirmation.trim().toUpperCase() !== "CONFIRM") {
      throw new MemberManagementError("Explicit confirmation is required.");
    }

    const family = await this.repository.findFamilyById(actorMember.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }

    const target = (await this.repository.findMembersByFamilyId(actorMember.familyId)).find(
      (candidate) => candidate.memberId === targetMemberId && candidate.status === "ACTIVE",
    );
    if (!target) {
      throw new MemberManagementError("Member is not found in the active family.");
    }
    if (target.role === "OWNER") {
      throw new MemberManagementError("The OWNER role cannot be deactivated.");
    }

    await this.repository.updateMemberStatus(target.memberId, "SUSPENDED");
  }

  async reactivateMember(
    actor: TelegramUser,
    targetIdentifier: string,
    confirmation: string,
  ): Promise<FamilyMember> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can reactivate members.");
    }
    if (confirmation.trim().toUpperCase() !== "CONFIRM") {
      throw new MemberManagementError("Explicit confirmation is required.");
    }

    const family = await this.repository.findFamilyById(actorMember.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }

    const normalizedIdentifier = targetIdentifier.replace(/^@/, "").toLowerCase();
    const target = (await this.repository.findMembersByFamilyId(actorMember.familyId)).find(
      (candidate) =>
        candidate.status === "SUSPENDED" &&
        (candidate.memberId === targetIdentifier ||
          (candidate.username !== null && candidate.username.toLowerCase() === normalizedIdentifier)),
    );
    if (!target) {
      throw new MemberManagementError("Suspended member is not found in the active family.");
    }
    if (target.role === "OWNER") {
      throw new MemberManagementError("The OWNER role cannot be reactivated through this flow.");
    }

    const activeMembership = await this.repository.findActiveMemberByTelegramUserId(target.telegramUserId);
    if (activeMembership) {
      throw new MemberManagementError("Member already has an active membership.");
    }

    await this.repository.updateMemberStatus(target.memberId, "ACTIVE");
    return { ...target, status: "ACTIVE" };
  }

  async joinFamily(user: TelegramUser, code: string): Promise<Family> {
    if (await this.getActiveMembership(user.telegramUserId)) {
      throw new AlreadyRegisteredError("User already belongs to a family.");
    }

    const invitation = await this.repository.findInvitationByCode(normalizeInvitationCode(code));
    if (!invitation) {
      throw new InvitationError("Invitation is invalid.");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationError("Invitation cannot be used.");
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      throw new InvitationError("Invitation has expired.");
    }

    const family = await this.repository.findFamilyById(invitation.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new InvitationError("Family is unavailable.");
    }

    const usedAt = new Date().toISOString();
    await this.repository.createMember(createMember(family.familyId, user, "MEMBER", usedAt));
    await this.repository.markInvitationUsed(
      invitation.invitationId,
      user.telegramUserId,
      usedAt,
    );

    return family;
  }

  private async requireActiveMember(telegramUserId: string): Promise<FamilyMember> {
    const member = await this.getActiveMembership(telegramUserId);
    if (!member) {
      throw new UnauthorizedError("User is not an active member.");
    }
    return member;
  }
}

function createMember(
  familyId: string,
  user: TelegramUser,
  role: MemberRole,
  joinedAt: string,
): FamilyMember {
  return {
    memberId: createId("mem"),
    familyId,
    ...user,
    role,
    status: "ACTIVE",
    joinedAt,
  };
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function createInvitationCode(): string {
  return `FAL-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

function normalizeFamilyName(value: string): string {
  const name = value.trim().replaceAll(/\s+/g, " ");
  if (!name || name.length > FAMILY_NAME_MAX_LENGTH) {
    throw new FamilyServiceError("Family name is invalid.");
  }
  return name;
}

function normalizeInvitationCode(value: string): string {
  return value.trim().toUpperCase();
}

function getInvitationExpiryHours(): number {
  const configuredValue = Number(process.env.FALANCE_INVITATION_EXPIRY_HOURS);
  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : DEFAULT_INVITATION_EXPIRY_HOURS;
}
