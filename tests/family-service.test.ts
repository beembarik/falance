import assert from "node:assert/strict";
import test from "node:test";

import type { FamilyRepository } from "../src/lib/family/repository";
import {
  AlreadyRegisteredError,
  FamilyService,
  InvitationError,
  UnauthorizedError,
} from "../src/lib/family/service";
import type { Family, FamilyMember, Invitation, PendingFamilyCreation, TelegramUser } from "../src/lib/family/types";

const owner: TelegramUser = { telegramUserId: "100", name: "Owner", username: "owner" };
const member: TelegramUser = { telegramUserId: "200", name: "Member", username: null };

test("creates a family with its creator as OWNER", async () => {
  const repository = new FakeFamilyRepository();
  const service = new FamilyService(repository);
  await service.beginFamilyCreation(owner);
  const family = await service.createFamilyFromPending(owner, "Keluarga Beem");

  assert.equal(family.status, "ACTIVE");
  assert.equal(repository.members[0].role, "OWNER");
  assert.equal(repository.members[0].telegramUserId, owner.telegramUserId);
  assert.match(family.spreadsheetId, /^spreadsheet_/);
});

test("rejects a duplicate family creation for an active member", async () => {
  const repository = new FakeFamilyRepository();
  repository.members.push(activeMember("fam_existing", owner, "OWNER"));
  await assert.rejects(new FamilyService(repository).beginFamilyCreation(owner), AlreadyRegisteredError);
});

test("allows OWNER and ADMIN to create invitations but rejects MEMBER", async () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    const repository = setupMember(role);
    const invitation = await new FamilyService(repository).createInvitation(owner);
    assert.equal(invitation.status, "PENDING");
  }
  await assert.rejects(new FamilyService(setupMember("MEMBER")).createInvitation(owner), UnauthorizedError);
});

test("joins a valid invitation once and marks it used", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);
  const invitation = await service.createInvitation(owner);
  const family = await service.joinFamily(member, invitation.code);

  assert.equal(family.familyId, "fam_1");
  assert.equal(repository.members.at(-1)?.role, "MEMBER");
  assert.equal(repository.invitations[0].status, "USED");
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

test("propagates Google provisioning failures without creating a membership", async () => {
  const repository = new FakeFamilyRepository();
  repository.failSpreadsheetCreation = true;
  const service = new FamilyService(repository);
  await service.beginFamilyCreation(owner);
  await assert.rejects(service.createFamilyFromPending(owner, "Keluarga Beem"));
  assert.equal(repository.members.length, 0);
});

function setupMember(role: FamilyMember["role"]): FakeFamilyRepository {
  const repository = new FakeFamilyRepository();
  repository.families.push({ familyId: "fam_1", familyName: "Keluarga", spreadsheetId: "sheet_1", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", createdBy: owner.telegramUserId, plan: "MVP" });
  repository.members.push(activeMember("fam_1", owner, role));
  return repository;
}

function activeMember(familyId: string, user: TelegramUser, role: FamilyMember["role"]): FamilyMember {
  return { memberId: `mem_${user.telegramUserId}`, familyId, ...user, role, status: "ACTIVE", joinedAt: "2026-01-01T00:00:00.000Z" };
}

function invitation(code: string, status: Invitation["status"]): Invitation {
  return { invitationId: `inv_${code}`, familyId: "fam_1", code, createdBy: owner.telegramUserId, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2030-01-01T00:00:00.000Z", status, usedBy: null, usedAt: null };
}

class FakeFamilyRepository implements FamilyRepository {
  families: Family[] = [];
  members: FamilyMember[] = [];
  invitations: Invitation[] = [];
  pending: PendingFamilyCreation[] = [];
  failSpreadsheetCreation = false;
  async createFamilySpreadsheet(_name: string, familyId: string) { if (this.failSpreadsheetCreation) throw new Error("Google API failure"); return `spreadsheet_${familyId}`; }
  async createFamily(family: Family) { this.families.push(family); }
  async findFamilyById(id: string) { return this.families.find((family) => family.familyId === id) ?? null; }
  async createMember(memberValue: FamilyMember) { this.members.push(memberValue); }
  async findActiveMemberByTelegramUserId(id: string) { return this.members.find((memberValue) => memberValue.telegramUserId === id && memberValue.status === "ACTIVE") ?? null; }
  async createInvitation(value: Invitation) { this.invitations.push(value); }
  async findInvitationByCode(code: string) { return this.invitations.find((value) => value.code === code) ?? null; }
  async markInvitationUsed(id: string, userId: string, usedAt: string) { const value = this.invitations.find((candidate) => candidate.invitationId === id); if (value) { value.status = "USED"; value.usedBy = userId; value.usedAt = usedAt; } }
  async createPendingFamilyCreation(value: PendingFamilyCreation) { this.pending.push(value); }
  async findPendingFamilyCreation(id: string) { return this.pending.find((value) => value.telegramUserId === id) ?? null; }
  async clearPendingFamilyCreation(id: string) { this.pending = this.pending.filter((value) => value.telegramUserId !== id); }
}
