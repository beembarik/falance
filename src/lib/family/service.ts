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
    if (await this.getActiveMembership(user.telegramUserId)) {
      throw new AlreadyRegisteredError("User already belongs to a family.");
    }

    const familyId = createId("fam");
    const now = new Date().toISOString();
    const spreadsheetId = await this.repository.createFamilySpreadsheet(
      normalizedName,
      familyId,
    );
    const family: Family = {
      familyId,
      familyName: normalizedName,
      spreadsheetId,
      status: "ACTIVE",
      createdAt: now,
      createdBy: user.telegramUserId,
      plan: "MVP",
    };
    const owner = createMember(familyId, user, "OWNER", now);

    await this.repository.createFamily(family);
    await this.repository.createMember(owner);
    await this.repository.clearPendingFamilyCreation(user.telegramUserId);

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
