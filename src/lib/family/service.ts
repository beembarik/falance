import { randomUUID } from "node:crypto";

import type { FamilyRepository } from "./repository";
import type {
  AuditAction,
  AuditTargetType,
  ConfirmationAction,
  Family,
  FamilyMember,
  Invitation,
  MemberRole,
  PendingConfirmation,
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
export class FamilyNameError extends FamilyServiceError {}
export class ConfirmationError extends FamilyServiceError {}
export class FamilyLifecycleError extends FamilyServiceError {}
export class OwnerInvariantError extends FamilyServiceError {}

export interface ConfirmationResult {
  action: ConfirmationAction;
  targetName?: string;
  familyName?: string;
}

export class FamilyService {
  private readonly repository: FamilyRepository;

  constructor(repository: FamilyRepository) {
    this.repository = repository;
  }

  async getActiveMembership(telegramUserId: string): Promise<FamilyMember | null> {
    return this.repository.findActiveMemberByTelegramUserId(telegramUserId);
  }

  async getActiveFamily(telegramUserId: string): Promise<Family> {
    const member = await this.requireActiveMember(telegramUserId);
    const family = await this.repository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }
    return family;
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

  async updateFamilyName(actor: TelegramUser, familyName: string): Promise<Family> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can update the family name.");
    }

    const family = await this.repository.findFamilyById(actorMember.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }

    const normalizedName = normalizeFamilyName(familyName);
    await this.repository.updateFamilyName(actorMember.familyId, normalizedName);
    await this.recordAudit(actorMember, "RENAME_FAMILY", "FAMILY", family.familyId, null, null);
    return { ...family, familyName: normalizedName };
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
    await this.recordAudit(member, "CREATE_INVITATION", "INVITATION", invitation.invitationId, null, null);
    return invitation;
  }

  async requestInvitationRevocation(user: TelegramUser, code: string): Promise<PendingConfirmation> {
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

    return this.createPendingConfirmation(user, member.familyId, "REVOKE_INVITATION", invitation.code);
  }

  private async revokeInvitationDirect(user: TelegramUser, code: string): Promise<void> {
    const member = await this.requireActiveMember(user.telegramUserId);
    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      throw new UnauthorizedError("Only owners and admins can revoke invitations.");
    }
    const invitation = await this.repository.findInvitationByCode(normalizeInvitationCode(code));
    if (!invitation || invitation.familyId !== member.familyId || invitation.status !== "PENDING") {
      throw new InvitationError("Invitation is invalid.");
    }
    await this.repository.revokeInvitation(invitation.invitationId);
    await this.recordAudit(member, "REVOKE_INVITATION", "INVITATION", invitation.invitationId, "PENDING", "REVOKED");
  }

  async hasPendingConfirmation(telegramUserId: string): Promise<boolean> {
    const pending = await this.repository.findPendingConfirmation(telegramUserId);
    return Boolean(pending && new Date(pending.expiresAt) > new Date());
  }

  async cancelPendingConfirmation(user: TelegramUser): Promise<void> {
    const pending = await this.repository.findPendingConfirmation(user.telegramUserId);
    if (!pending) throw new ConfirmationError("No pending confirmation exists.");
    await this.repository.updatePendingConfirmationStatus(pending.confirmationId, "CANCELLED");
  }

  async confirmPendingAction(user: TelegramUser): Promise<ConfirmationResult> {
    const pending = await this.repository.findPendingConfirmation(user.telegramUserId);
    if (!pending) throw new ConfirmationError("No pending confirmation exists.");
    if (new Date(pending.expiresAt) <= new Date()) {
      await this.repository.updatePendingConfirmationStatus(pending.confirmationId, "EXPIRED");
      throw new ConfirmationError("The pending confirmation has expired.");
    }

    const member = await this.requireMember(user.telegramUserId);
    if (member.familyId !== pending.familyId) {
      throw new UnauthorizedError("Confirmation family does not match the active membership.");
    }

    let result: ConfirmationResult;
    if (pending.action === "REVOKE_INVITATION") {
      await this.revokeInvitationDirect(user, pending.target);
      result = { action: pending.action };
    } else if (pending.action === "DEACTIVATE_MEMBER") {
      const target = await this.deactivateMemberDirect(user, pending.target);
      result = { action: pending.action, targetName: target.name };
    } else {
      const family = await this.archiveFamilyDirect(user);
      result = { action: pending.action, familyName: family.familyName };
    }

    await this.repository.updatePendingConfirmationStatus(pending.confirmationId, "COMPLETED");
    return result;
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

    const familyMembers = await this.repository.findMembersByFamilyId(actorMember.familyId);
    const target = familyMembers.find(
      (candidate) => candidate.memberId === targetMemberId && candidate.status === "ACTIVE",
    );
    if (!target) {
      throw new MemberManagementError("Member is not found in the active family.");
    }
    assertOwnerInvariant(familyMembers, target, "changed");
    if (target.role === "OWNER") {
      throw new MemberManagementError("The OWNER role cannot be changed.");
    }
    if (target.role === newRole) {
      throw new MemberManagementError("Member already has this role.");
    }

    const previousRole = target.role;
    await this.repository.updateMemberRole(target.memberId, newRole);
    await this.recordAudit(actorMember, "CHANGE_MEMBER_ROLE", "MEMBER", target.memberId, previousRole, newRole);
  }

  async requestMemberDeactivation(actor: TelegramUser, targetMemberId: string): Promise<PendingConfirmation> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can deactivate members.");
    }
    const family = await this.requireActiveFamily(actorMember.familyId);
    const familyMembers = await this.repository.findMembersByFamilyId(family.familyId);
    const target = familyMembers.find(
      (candidate) => candidate.memberId === targetMemberId && candidate.status === "ACTIVE",
    );
    if (!target) throw new MemberManagementError("Member is not found in the active family.");
    assertOwnerInvariant(familyMembers, target, "deactivated");
    if (target.role === "OWNER") throw new MemberManagementError("The OWNER role cannot be deactivated.");
    return this.createPendingConfirmation(actor, family.familyId, "DEACTIVATE_MEMBER", target.memberId);
  }

  private async deactivateMemberDirect(actor: TelegramUser, targetMemberId: string): Promise<FamilyMember> {
    const actorMember = await this.requireActiveMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") throw new UnauthorizedError("Only the owner can deactivate members.");
    const family = await this.requireActiveFamily(actorMember.familyId);
    const familyMembers = await this.repository.findMembersByFamilyId(family.familyId);
    const target = familyMembers.find(
      (candidate) => candidate.memberId === targetMemberId && candidate.status === "ACTIVE",
    );
    if (!target) throw new MemberManagementError("Member is not found in the active family.");
    assertOwnerInvariant(familyMembers, target, "deactivated");
    if (target.role === "OWNER") throw new MemberManagementError("The OWNER role cannot be deactivated.");
    await this.repository.updateMemberStatus(target.memberId, "SUSPENDED");
    await this.recordAudit(actorMember, "DEACTIVATE_MEMBER", "MEMBER", target.memberId, "ACTIVE", "SUSPENDED");
    return target;
  }

  async requestFamilyArchive(actor: TelegramUser): Promise<PendingConfirmation> {
    const actorMember = await this.requireMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can archive the family.");
    }
    const family = await this.requireActiveFamily(actorMember.familyId);
    return this.createPendingConfirmation(actor, family.familyId, "ARCHIVE_FAMILY", family.familyId);
  }

  private async archiveFamilyDirect(actor: TelegramUser): Promise<Family> {
    const actorMember = await this.requireMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") throw new UnauthorizedError("Only the owner can archive the family.");
    const family = await this.requireActiveFamily(actorMember.familyId);
    await this.repository.updateFamilyStatus(family.familyId, "SUSPENDED");
    await this.recordAudit(actorMember, "ARCHIVE_FAMILY", "FAMILY", family.familyId, "ACTIVE", "SUSPENDED");
    return { ...family, status: "SUSPENDED" };
  }

  async reactivateFamily(actor: TelegramUser, confirmation: string): Promise<Family> {
    const actorMember = await this.requireMember(actor.telegramUserId);
    if (actorMember.role !== "OWNER") {
      throw new UnauthorizedError("Only the owner can reactivate the family.");
    }
    if (confirmation.trim().toUpperCase() !== "CONFIRM") {
      throw new ConfirmationError("Explicit confirmation is required.");
    }

    const family = await this.repository.findFamilyById(actorMember.familyId);
    if (!family || family.status !== "SUSPENDED") {
      throw new FamilyLifecycleError("Suspended family is not found.");
    }

    await this.repository.updateFamilyStatus(actorMember.familyId, "ACTIVE");
    await this.recordAudit(actorMember, "REACTIVATE_FAMILY", "FAMILY", family.familyId, "SUSPENDED", "ACTIVE");
    return { ...family, status: "ACTIVE" };
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
    await this.recordAudit(actorMember, "REACTIVATE_MEMBER", "MEMBER", target.memberId, "SUSPENDED", "ACTIVE");
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

  private async createPendingConfirmation(
    user: TelegramUser,
    familyId: string,
    action: ConfirmationAction,
    target: string,
  ): Promise<PendingConfirmation> {
    const createdAt = new Date();
    const pending: PendingConfirmation = {
      confirmationId: createId("confirm"),
      telegramUserId: user.telegramUserId,
      familyId,
      action,
      target,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(),
      status: "PENDING",
    };
    await this.repository.createPendingConfirmation(pending);
    return pending;
  }

  private async requireActiveFamily(familyId: string): Promise<Family> {
    const family = await this.repository.findFamilyById(familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
    }
    return family;
  }

  private async requireMember(telegramUserId: string): Promise<FamilyMember> {
    const member = await this.getActiveMembership(telegramUserId);
    if (!member) {
      throw new UnauthorizedError("User is not an active member.");
    }
    return member;
  }

  private async recordAudit(
    actor: FamilyMember,
    action: AuditAction,
    targetType: AuditTargetType,
    targetId: string,
    previousValue: string | null,
    newValue: string | null,
  ): Promise<void> {
    const entry = {
      auditId: createId("audit"),
      familyId: actor.familyId,
      actorMemberId: actor.memberId,
      actorRole: actor.role,
      action,
      targetType,
      targetId,
      previousValue,
      newValue,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.repository.createAuditLog(entry);
    } catch {
      console.error("[Audit] write failed", { action, targetType });
    }
  }

  private async requireActiveMember(telegramUserId: string): Promise<FamilyMember> {
    const member = await this.requireMember(telegramUserId);
    const family = await this.repository.findFamilyById(member.familyId);
    if (!family || family.status !== "ACTIVE") {
      throw new UnauthorizedError("Family is unavailable.");
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


function assertOwnerInvariant(
  members: FamilyMember[],
  target: FamilyMember,
  action: "changed" | "deactivated",
): void {
  const activeOwnerCount = members.filter(
    (member) => member.status === "ACTIVE" && member.role === "OWNER",
  ).length;
  if (target.role === "OWNER" && activeOwnerCount <= 1) {
    throw new OwnerInvariantError(`The last OWNER cannot be ${action}.`);
  }
}

function normalizeFamilyName(value: string): string {
  const name = value.trim().replaceAll(/\s+/g, " ");
  if (!name || name.length > FAMILY_NAME_MAX_LENGTH) {
    throw new FamilyNameError("Family name is invalid.");
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
