import assert from "node:assert/strict";
import test from "node:test";

import type { FamilyRepository } from "../src/lib/family/repository";
import {
  AlreadyRegisteredError,
  FamilyNameError,
  FamilyService,
  InvitationError,
  MemberManagementError,
  UnauthorizedError,
} from "../src/lib/family/service";
import type { Family, FamilyMember, Invitation, PendingFamilyCreation, TelegramUser } from "../src/lib/family/types";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };
const member: TelegramUser = { telegramUserId: "200", name: "Member", username: null };

test("creates a family with its creator as OWNER in the central repository", async () => {
  const repository = new FakeFamilyRepository();
  const service = new FamilyService(repository);
  await service.beginFamilyCreation(owner);
  const family = await service.createFamilyFromPending(owner, "Keluarga Beem");

  assert.equal(family.status, "ACTIVE");
  assert.equal("spreadsheetId" in family, false);
  assert.equal(repository.families[0].familyId, family.familyId);
  assert.equal(repository.members[0].role, "OWNER");
  assert.equal(repository.members[0].familyId, family.familyId);
  assert.equal(repository.spreadsheetCreationCalls, 0);
  assert.equal(repository.pending[0].status, "COMPLETED");
});

test("rejects a duplicate family creation for an active member", async () => {
  const repository = new FakeFamilyRepository();
  repository.members.push(activeMember("fam_existing", owner, "OWNER"));
  await assert.rejects(new FamilyService(repository).beginFamilyCreation(owner), AlreadyRegisteredError);
});

test("OWNER can update and normalize the family name", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);

  const updated = await service.updateFamilyName(owner, "  Keluarga   Baru  ");

  assert.equal(updated.familyName, "Keluarga Baru");
  assert.equal(repository.families.find((value) => value.familyId === "fam_1")?.familyName, "Keluarga Baru");
});

test("rejects family-name updates by non-OWNER and invalid names", async () => {
  await assert.rejects(
    new FamilyService(setupMember("ADMIN")).updateFamilyName(owner, "Nama Baru"),
    UnauthorizedError,
  );
  await assert.rejects(
    new FamilyService(setupMember("OWNER")).updateFamilyName(owner, "   "),
    FamilyNameError,
  );
  await assert.rejects(
    new FamilyService(setupMember("OWNER")).updateFamilyName(owner, "x".repeat(81)),
    FamilyNameError,
  );
});

test("OWNER and ADMIN can create invitations but MEMBER cannot", async () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    const repository = setupMember(role);
    const invitation = await new FamilyService(repository).createInvitation(owner);
    assert.equal(invitation.status, "PENDING");
    assert.equal(invitation.familyId, "fam_1");
  }
  await assert.rejects(new FamilyService(setupMember("MEMBER")).createInvitation(owner), UnauthorizedError);
});

test("lists only active members from the requester’s server-resolved family", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const leftMember: TelegramUser = { telegramUserId: "400", name: "Former Member", username: null };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    activeMember("fam_2", familyBOwner, "OWNER"),
    { ...activeMember("fam_1", leftMember, "MEMBER"), status: "LEFT" },
  );

  const listed = await new FamilyService(repository).listFamilyMembers(member.telegramUserId);

  assert.deepEqual(listed.map((value) => value.telegramUserId), [owner.telegramUserId, member.telegramUserId]);
  assert.equal(listed.every((value) => value.familyId === "fam_1"), true);
  assert.equal(listed.some((value) => value.telegramUserId === familyBOwner.telegramUserId), false);
});

test("rejects member listing for a user without active membership", async () => {
  await assert.rejects(
    new FamilyService(new FakeFamilyRepository()).listFamilyMembers("999"),
    UnauthorizedError,
  );
});

test("resolves invitation family ownership from server-side membership, not client input", async () => {
  const repository = setupMember("OWNER");
  repository.families.push({ ...family("fam_2"), createdBy: "999" });
  const invitation = await new FamilyService(repository).createInvitation(owner);
  assert.equal(invitation.familyId, "fam_1");
  assert.notEqual(invitation.familyId, "fam_2");
});

test("rejects a foreign family_id at the service authorization boundary", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    activeMember("fam_2", familyBOwner, "OWNER"),
  );
  const service = new FamilyService(repository);

  await assert.rejects(
    service.requireAuthorizedFamily(owner.telegramUserId, "fam_2"),
    UnauthorizedError,
  );
  await assert.rejects(
    service.requireAuthorizedFamily(member.telegramUserId, "fam_2"),
    UnauthorizedError,
  );
  assert.deepEqual(repository.familyLookupIds, []);

  assert.equal(
    (await service.requireAuthorizedFamily(owner.telegramUserId, "fam_1")).familyId,
    "fam_1",
  );
  assert.equal(
    (await service.requireAuthorizedFamily(member.telegramUserId, "fam_1")).familyId,
    "fam_1",
  );
  assert.equal(
    (await service.requireAuthorizedFamily(familyBOwner.telegramUserId, "fam_2")).familyId,
    "fam_2",
  );
});

test("OWNER and ADMIN can revoke only pending invitations in their own family", async () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    const repository = setupMember(role);
    const service = new FamilyService(repository);
    const created = await service.createInvitation(owner);

    await service.revokeInvitation(owner, created.code);

    assert.equal(repository.invitations[0].status, "REVOKED");
  }

  const memberRepository = setupMember("MEMBER");
  memberRepository.invitations.push(invitation("FAL-MEMBER-REV", "PENDING"));
  await assert.rejects(
    new FamilyService(memberRepository).revokeInvitation(owner, "FAL-MEMBER-REV"),
    UnauthorizedError,
  );
  assert.equal(memberRepository.invitations[0].status, "PENDING");
});

test("OWNER can promote MEMBER to ADMIN and demote ADMIN to MEMBER", async () => {
  const familyAdmin: TelegramUser = { telegramUserId: "300", name: "Family Admin", username: "family-admin" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"));
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    activeMember("fam_1", familyAdmin, "ADMIN"),
  );
  const service = new FamilyService(repository);

  await service.changeMemberRole(owner, "mem_200", "ADMIN");
  await service.changeMemberRole(owner, "mem_300", "MEMBER");

  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.role, "ADMIN");
  assert.equal(repository.members.find((value) => value.memberId === "mem_300")?.role, "MEMBER");
});

test("protects OWNER role and rejects non-OWNER and cross-family role changes", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const familyBMember: TelegramUser = { telegramUserId: "400", name: "Family B Member", username: "family-b-member" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    activeMember("fam_2", familyBOwner, "OWNER"),
    activeMember("fam_2", familyBMember, "MEMBER"),
  );
  const service = new FamilyService(repository);

  await assert.rejects(
    service.changeMemberRole(owner, "mem_100", "MEMBER"),
    MemberManagementError,
  );
  await assert.rejects(
    service.changeMemberRole(member, "mem_200", "ADMIN"),
    UnauthorizedError,
  );
  await assert.rejects(
    service.changeMemberRole(owner, "mem_400", "ADMIN"),
    MemberManagementError,
  );

  assert.equal(repository.members.find((value) => value.memberId === "mem_100")?.role, "OWNER");
  assert.equal(repository.members.find((value) => value.memberId === "mem_400")?.role, "MEMBER");
});

test("OWNER can deactivate an active non-OWNER member using explicit confirmation", async () => {
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"));
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
  );
  const service = new FamilyService(repository);

  await service.deactivateMember(owner, "mem_200", "confirm");

  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "SUSPENDED");
  assert.equal(await service.getActiveMembership(member.telegramUserId), null);
  assert.deepEqual((await service.listFamilyMembers(owner.telegramUserId)).map((value) => value.memberId), ["mem_100"]);
});

test("rejects unsafe member deactivation targets and missing confirmation", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const familyBMember: TelegramUser = { telegramUserId: "400", name: "Family B Member", username: "family-b-member" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    activeMember("fam_2", familyBOwner, "OWNER"),
    activeMember("fam_2", familyBMember, "MEMBER"),
  );
  const service = new FamilyService(repository);

  await assert.rejects(
    service.deactivateMember(owner, "mem_200", "REMOVE"),
    MemberManagementError,
  );
  await assert.rejects(
    service.deactivateMember(owner, "mem_100", "CONFIRM"),
    MemberManagementError,
  );
  await assert.rejects(
    service.deactivateMember(member, "mem_200", "CONFIRM"),
    UnauthorizedError,
  );
  await assert.rejects(
    service.deactivateMember(owner, "mem_400", "CONFIRM"),
    MemberManagementError,
  );

  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "ACTIVE");
  assert.equal(repository.members.find((value) => value.memberId === "mem_400")?.status, "ACTIVE");
});

test("OWNER can reactivate a SUSPENDED member by username without changing the member ID", async () => {
  const suspendedMember: TelegramUser = { telegramUserId: "200", name: "Member", username: "suspended-member" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"));
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    { ...activeMember("fam_1", suspendedMember, "MEMBER"), status: "SUSPENDED" },
  );
  const service = new FamilyService(repository);

  const reactivated = await service.reactivateMember(owner, "@suspended-member", "confirm");

  assert.equal(reactivated.memberId, "mem_200");
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "ACTIVE");
  assert.equal((await service.getActiveMembership(suspendedMember.telegramUserId))?.memberId, "mem_200");
});

test("rejects unsafe member reactivation targets and duplicate active membership", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const familyBMember: TelegramUser = { telegramUserId: "400", name: "Family B Member", username: "family-b-member" };
  const activeDuplicate: TelegramUser = { telegramUserId: "500", name: "Active Duplicate", username: "active-duplicate" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(
    activeMember("fam_1", owner, "OWNER"),
    activeMember("fam_1", member, "MEMBER"),
    { ...activeMember("fam_1", activeDuplicate, "MEMBER"), memberId: "mem_500", status: "ACTIVE" },
    { ...activeMember("fam_1", activeDuplicate, "MEMBER"), memberId: "mem_501", status: "SUSPENDED" },
    activeMember("fam_2", familyBOwner, "OWNER"),
    { ...activeMember("fam_2", familyBMember, "MEMBER"), status: "SUSPENDED" },
  );
  const service = new FamilyService(repository);

  await assert.rejects(
    service.reactivateMember(owner, "mem_200", "CONFIRM"),
    MemberManagementError,
  );
  await assert.rejects(
    service.reactivateMember(member, "mem_200", "CONFIRM"),
    UnauthorizedError,
  );
  await assert.rejects(
    service.reactivateMember(owner, "mem_400", "CONFIRM"),
    MemberManagementError,
  );
  await assert.rejects(
    service.reactivateMember(owner, "mem_501", "REMOVE"),
    MemberManagementError,
  );

  assert.equal(repository.members.find((value) => value.memberId === "mem_400")?.status, "SUSPENDED");
  assert.equal(repository.members.find((value) => value.memberId === "mem_501")?.status, "SUSPENDED");
});

test("rejects revoking a foreign or already-consumed invitation", async () => {
  const repository = setupMember("OWNER");
  repository.families.push({ ...family("fam_2"), createdBy: "300" });
  repository.invitations.push({ ...invitation("FAL-FOREIGN", "PENDING"), familyId: "fam_2" });
  const service = new FamilyService(repository);

  await assert.rejects(service.revokeInvitation(owner, "FAL-FOREIGN"), InvitationError);
  assert.equal(repository.invitations.at(-1)?.status, "PENDING");

  const used = await service.createInvitation(owner);
  used.status = "USED";
  await assert.rejects(service.revokeInvitation(owner, used.code), InvitationError);
});

test("joins a valid invitation once and marks it used", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);
  const invitation = await service.createInvitation(owner);
  const joinedFamily = await service.joinFamily(member, invitation.code);

  assert.equal(joinedFamily.familyId, "fam_1");
  assert.equal(repository.members.at(-1)?.role, "MEMBER");
  assert.equal(repository.members.at(-1)?.familyId, "fam_1");
  assert.equal(repository.invitations[0].status, "USED");
  await assert.rejects(service.joinFamily({ ...member, telegramUserId: "300" }, invitation.code), InvitationError);
});

test("rejects expired, reused, and revoked invitations", async () => {
  for (const status of ["USED", "REVOKED"] as const) {
    const repository = setupMember("OWNER");
    repository.invitations.push(invitation("FAL-AAAAAA", status));
    await assert.rejects(new FamilyService(repository).joinFamily(member, "FAL-AAAAAA"), InvitationError);
  }
  const repository = setupMember("OWNER");
  repository.invitations.push({ ...invitation("FAL-EXPIRE", "PENDING"), expiresAt: "2000-01-01T00:00:00.000Z" });
  await assert.rejects(new FamilyService(repository).joinFamily(member, "FAL-EXPIRE"), InvitationError);
});

test("does not permit an already-active member to join another family", async () => {
  const repository = setupMember("OWNER");
  repository.members.push(activeMember("fam_other", member, "MEMBER"));
  repository.invitations.push(invitation("FAL-AAAAAA", "PENDING"));
  await assert.rejects(new FamilyService(repository).joinFamily(member, "FAL-AAAAAA"), AlreadyRegisteredError);
});

test("does not complete family creation when a central membership write fails", async () => {
  const repository = new FakeFamilyRepository();
  repository.failMemberCreation = true;
  const service = new FamilyService(repository);
  await service.beginFamilyCreation(owner);
  await assert.rejects(service.createFamilyFromPending(owner, "Keluarga Beem"));
  assert.equal(repository.families.length, 1);
  assert.equal(repository.pending[0].status, "PENDING");
});

test("retries a partial family creation without creating a duplicate family", async () => {
  const repository = new FakeFamilyRepository();
  repository.failMemberCreation = true;
  const service = new FamilyService(repository);
  await service.beginFamilyCreation(owner);
  await assert.rejects(service.createFamilyFromPending(owner, "Keluarga Beem"));

  repository.failMemberCreation = false;
  const retry = await service.createFamilyFromPending(owner, "Keluarga Beem");
  assert.equal(repository.families.length, 1);
  assert.equal(repository.members.length, 1);
  assert.equal(repository.members[0].familyId, retry.familyId);
  assert.equal(repository.pending[0].status, "COMPLETED");
});

function setupMember(role: FamilyMember["role"]): FakeFamilyRepository {
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"));
  repository.members.push(activeMember("fam_1", owner, role));
  return repository;
}

function family(familyId: string): Family {
  return {
    familyId,
    familyName: "Keluarga",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: owner.telegramUserId,
    plan: "MVP",
  };
}

function activeMember(familyId: string, user: TelegramUser, role: FamilyMember["role"]): FamilyMember {
  return { memberId: `mem_${user.telegramUserId}`, familyId, ...user, role, status: "ACTIVE", joinedAt: "2026-01-01T00:00:00.000Z" };
}

function invitation(code: string, status: Invitation["status"]): Invitation {
  return { invitationId: `inv_${code}`, familyId: "fam_1", code, createdBy: owner.telegramUserId, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z", status, usedBy: null, usedAt: null };
}

class FakeFamilyRepository implements FamilyRepository {
  families: Family[] = [];
  familyLookupIds: string[] = [];
  members: FamilyMember[] = [];
  invitations: Invitation[] = [];
  pending: Array<PendingFamilyCreation & { status: "PENDING" | "COMPLETED" }> = [];
  failMemberCreation = false;
  spreadsheetCreationCalls = 0;

  async createFamily(value: Family) {
    if (!this.families.some((familyValue) => familyValue.familyId === value.familyId)) this.families.push(value);
  }
  async updateFamilyName(familyId: string, familyName: string) {
    const value = this.families.find((familyValue) => familyValue.familyId === familyId);
    if (value) value.familyName = familyName;
  }
  async findFamilyById(id: string) {
    this.familyLookupIds.push(id);
    return this.families.find((value) => value.familyId === id) ?? null;
  }
  async findFamilyByCreatedBy(id: string) { return this.families.find((value) => value.createdBy === id && value.status === "ACTIVE") ?? null; }
  async createMember(value: FamilyMember) {
    if (this.failMemberCreation) throw new Error("Google Sheets write failed");
    if (!this.members.some((memberValue) => memberValue.memberId === value.memberId)) this.members.push(value);
  }
  async findActiveMemberByTelegramUserId(id: string) { return this.members.find((value) => value.telegramUserId === id && value.status === "ACTIVE") ?? null; }
  async findMembersByFamilyId(id: string) { return this.members.filter((value) => value.familyId === id); }
  async updateMemberRole(memberId: string, newRole: FamilyMember["role"]) {
    const value = this.members.find((memberValue) => memberValue.memberId === memberId);
    if (value) value.role = newRole;
  }
  async updateMemberStatus(memberId: string, newStatus: FamilyMember["status"]) {
    const value = this.members.find((memberValue) => memberValue.memberId === memberId);
    if (value) value.status = newStatus;
  }
  async createInvitation(value: Invitation) { this.invitations.push(value); }
  async findInvitationByCode(code: string) { return this.invitations.find((value) => value.code === code) ?? null; }
  async markInvitationUsed(id: string, userId: string, usedAt: string) {
    const value = this.invitations.find((candidate) => candidate.invitationId === id);
    if (value) { value.status = "USED"; value.usedBy = userId; value.usedAt = usedAt; }
  }
  async revokeInvitation(id: string) {
    const value = this.invitations.find((candidate) => candidate.invitationId === id);
    if (value && value.status === "PENDING") value.status = "REVOKED";
  }
  async createPendingFamilyCreation(value: PendingFamilyCreation) {
    this.pending = this.pending.filter((pendingValue) => pendingValue.telegramUserId !== value.telegramUserId);
    this.pending.push({ ...value, status: "PENDING" });
  }
  async findPendingFamilyCreation(id: string) { return this.pending.find((value) => value.telegramUserId === id && value.status === "PENDING") ?? null; }
  async clearPendingFamilyCreation(id: string) {
    const value = this.pending.find((pendingValue) => pendingValue.telegramUserId === id && pendingValue.status === "PENDING");
    if (value) value.status = "COMPLETED";
  }
}
