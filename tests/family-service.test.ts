import assert from "node:assert/strict";
import test from "node:test";

import type { FamilyRepository } from "../src/lib/family/repository";
import {
  AlreadyRegisteredError,
  ConfirmationError,
  FamilyLifecycleError,
  FamilyNameError,
  FamilyService,
  InvitationError,
  MemberManagementError,
  OwnerInvariantError,
  TransactionError,
  UnauthorizedError,
} from "../src/lib/family/service";
import type { AuditLogEntry, Family, FamilyMember, Invitation, PendingConfirmation, PendingFamilyCreation, TelegramUser, Transaction } from "../src/lib/family/types";

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

test("records administrative audit entries without Telegram identity or family-name values", async () => {
  const repository = setupMember("OWNER");
  repository.members.push(activeMember("fam_1", member, "MEMBER"));
  const service = new FamilyService(repository);

  await service.updateFamilyName(owner, "Nama Audit");
  const invitation = await service.createInvitation(owner);
  await service.changeMemberRole(owner, "mem_200", "ADMIN");
  await service.requestMemberDeactivation(owner, "mem_200");
  await service.confirmPendingAction(owner);
  await service.reactivateMember(owner, "mem_200", "CONFIRM");
  await service.requestFamilyArchive(owner);
  await service.confirmPendingAction(owner);
  await service.reactivateFamily(owner, "CONFIRM");

  assert.deepEqual(repository.auditLogs.map((entry) => entry.action), [
    "RENAME_FAMILY",
    "CREATE_INVITATION",
    "CHANGE_MEMBER_ROLE",
    "DEACTIVATE_MEMBER",
    "REACTIVATE_MEMBER",
    "ARCHIVE_FAMILY",
    "REACTIVATE_FAMILY",
  ]);
  assert.equal(repository.auditLogs.every((entry) => entry.familyId === "fam_1"), true);
  assert.equal(repository.auditLogs.every((entry) => entry.actorMemberId === "mem_100"), true);
  assert.equal(repository.auditLogs.some((entry) => entry.targetId === invitation.invitationId), true);
  assert.equal(repository.auditLogs.some((entry) => entry.previousValue === "MEMBER" && entry.newValue === "ADMIN"), true);
  assert.equal(repository.auditLogs.some((entry) => entry.previousValue === "SUSPENDED" && entry.newValue === "ACTIVE"), true);
  assert.equal(repository.auditLogs.some((entry) => entry.targetId === "100" || entry.targetId === "200"), false);
  assert.equal(repository.auditLogs.some((entry) => entry.newValue === "Nama Audit"), false);
});

test("administrative state changes succeed when audit persistence is unavailable", async () => {
  const repository = setupMember("OWNER");
  repository.failAuditLog = true;
  const updated = await new FamilyService(repository).updateFamilyName(owner, "Tetap Berhasil");

  assert.equal(updated.familyName, "Tetap Berhasil");
  assert.equal(repository.families[0].familyName, "Tetap Berhasil");
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

test("OWNER can archive and reactivate a family without deleting its row", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);

  const pendingArchive = await service.requestFamilyArchive(owner);
  assert.equal(pendingArchive.status, "PENDING");
  const archivedResult = await service.confirmPendingAction(owner);
  assert.equal(archivedResult.action, "ARCHIVE_FAMILY");
  const archived = repository.families[0];
  assert.equal(archived.status, "SUSPENDED");
  assert.equal(repository.families[0].status, "SUSPENDED");
  await assert.rejects(service.listFamilyMembers(owner.telegramUserId), UnauthorizedError);

  const reactivated = await service.reactivateFamily(owner, "confirm");
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(repository.families[0].status, "ACTIVE");
  assert.deepEqual((await service.listFamilyMembers(owner.telegramUserId)).map((value) => value.memberId), ["mem_100"]);
});

test("rejects unsafe family archival and reactivation attempts", async () => {
  await assert.rejects(
    new FamilyService(setupMember("ADMIN")).requestFamilyArchive(owner),
    UnauthorizedError,
  );
  await assert.rejects(
    new FamilyService(setupMember("OWNER")).confirmPendingAction(owner),
    ConfirmationError,
  );

  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);
  await assert.rejects(service.reactivateFamily(owner, "CONFIRM"), FamilyLifecycleError);
  await service.requestFamilyArchive(owner);
  await service.cancelPendingConfirmation(owner);
  assert.equal(repository.confirmations[0].status, "CANCELLED");
  assert.equal(repository.families[0].status, "ACTIVE");
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
  assert.deepEqual(repository.familyLookupIds, ["fam_1", "fam_1"]);

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

    await service.requestInvitationRevocation(owner, created.code);
    await service.confirmPendingAction(owner);

    assert.equal(repository.invitations[0].status, "REVOKED");
  }

  const memberRepository = setupMember("MEMBER");
  memberRepository.invitations.push(invitation("FAL-MEMBER-REV", "PENDING"));
  await assert.rejects(
    new FamilyService(memberRepository).requestInvitationRevocation(owner, "FAL-MEMBER-REV"),
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

test("protects the last OWNER from deactivation and role changes", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);

  await assert.rejects(
    service.changeMemberRole(owner, "mem_100", "MEMBER"),
    OwnerInvariantError,
  );
  await assert.rejects(
    service.requestMemberDeactivation(owner, "mem_100"),
    OwnerInvariantError,
  );
  assert.equal(repository.members.find((value) => value.memberId === "mem_100")?.status, "ACTIVE");
  assert.equal(repository.members.find((value) => value.memberId === "mem_100")?.role, "OWNER");
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
    OwnerInvariantError,
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

  await service.requestMemberDeactivation(owner, "mem_200");
  const result = await service.confirmPendingAction(owner);

  assert.equal(result.action, "DEACTIVATE_MEMBER");
  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "SUSPENDED");
  assert.equal(await service.getActiveMembership(member.telegramUserId), null);
  assert.deepEqual((await service.listFamilyMembers(owner.telegramUserId)).map((value) => value.memberId), ["mem_100"]);
});

test("expires pending member deactivation without changing member status", async () => {
  const repository = setupMember("OWNER");
  repository.members.push(activeMember("fam_1", member, "MEMBER"));
  const service = new FamilyService(repository);

  await service.requestMemberDeactivation(owner, "mem_200");
  repository.confirmations[0].expiresAt = "2020-01-01T00:00:00.000Z";

  await assert.rejects(service.confirmPendingAction(owner), ConfirmationError);
  assert.equal(repository.confirmations[0].status, "EXPIRED");
  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "ACTIVE");
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

  await service.requestMemberDeactivation(owner, "mem_200");
  await service.cancelPendingConfirmation(owner);
  assert.equal(repository.members.find((value) => value.memberId === "mem_200")?.status, "ACTIVE");
  await assert.rejects(
    service.requestMemberDeactivation(owner, "mem_100"),
    OwnerInvariantError,
  );
  await assert.rejects(
    service.requestMemberDeactivation(member, "mem_200"),
    UnauthorizedError,
  );
  await assert.rejects(
    service.requestMemberDeactivation(owner, "mem_400"),
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

  await assert.rejects(service.requestInvitationRevocation(owner, "FAL-FOREIGN"), InvitationError);
  assert.equal(repository.invitations.at(-1)?.status, "PENDING");

  const used = await service.createInvitation(owner);
  used.status = "USED";
  await assert.rejects(service.requestInvitationRevocation(owner, used.code), InvitationError);
});

test("creates normalized income and expense transactions with server-owned family and creator", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);

  const income = await service.createTransaction(owner, {
    transactionType: "INCOME",
    amountMinor: 15000,
    currency: "idr",
    transactionDate: "2026-08-19",
    description: "  Gaji   bulanan  ",
  });
  const expense = await service.createTransaction(owner, {
    transactionType: "EXPENSE",
    amountMinor: 2500,
    transactionDate: "2026-08-18",
    description: "Makan siang",
  });

  assert.equal(income.familyId, "fam_1");
  assert.equal(income.createdByMemberId, "mem_100");
  assert.equal(income.currency, "IDR");
  assert.equal(income.description, "Gaji bulanan");
  assert.equal(expense.transactionType, "EXPENSE");
  assert.deepEqual(repository.transactions.map((value) => value.transactionId), [income.transactionId, expense.transactionId]);
  assert.equal(repository.auditLogs.at(-1)?.action, "CREATE_TRANSACTION");
  assert.equal(repository.auditLogs.at(-1)?.targetType, "TRANSACTION");
});

test("lists only active transactions from the requester’s server-resolved family", async () => {
  const familyBOwner: TelegramUser = { telegramUserId: "300", name: "Family B Owner", username: "family-b-owner" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: familyBOwner.telegramUserId });
  repository.members.push(activeMember("fam_1", owner, "OWNER"), activeMember("fam_2", familyBOwner, "OWNER"));
  repository.transactions.push(
    transaction("txn_a", "fam_1", "ACTIVE"),
    transaction("txn_void", "fam_1", "VOID"),
    transaction("txn_b", "fam_2", "ACTIVE"),
  );

  const listed = await new FamilyService(repository).listTransactions(owner.telegramUserId);

  assert.deepEqual(listed.map((value) => value.transactionId), ["txn_a"]);
  assert.equal(listed.every((value) => value.familyId === "fam_1"), true);
});

test("rejects invalid transaction input and archived-family transaction access", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);
  const valid = {
    transactionType: "INCOME" as const,
    amountMinor: 100,
    transactionDate: "2026-08-19",
    description: "Valid",
  };

  await assert.rejects(service.createTransaction(owner, { ...valid, amountMinor: 0 }), TransactionError);
  await assert.rejects(service.createTransaction(owner, { ...valid, amountMinor: 1.5 }), TransactionError);
  await assert.rejects(service.createTransaction(owner, { ...valid, transactionType: "OTHER" as "INCOME" }), TransactionError);
  await assert.rejects(service.createTransaction(owner, { ...valid, transactionDate: "19-08-2026" }), TransactionError);
  await assert.rejects(service.createTransaction(owner, { ...valid, description: "   " }), TransactionError);
  await assert.rejects(service.createTransaction(owner, { ...valid, currency: "RUPIAH" }), TransactionError);

  repository.families[0].status = "SUSPENDED";
  await assert.rejects(service.createTransaction(owner, valid), UnauthorizedError);
  await assert.rejects(service.listTransactions(owner.telegramUserId), UnauthorizedError);
  assert.equal(repository.transactions.length, 0);
});

test("updates an active transaction in its server-resolved family and records an audit event", async () => {
  const repository = setupMember("OWNER");
  const service = new FamilyService(repository);
  const created = await service.createTransaction(owner, {
    transactionType: "EXPENSE",
    amountMinor: 1000,
    transactionDate: "2026-08-19",
    description: "Lama",
  });

  const updated = await service.updateTransaction(owner, created.transactionId, {
    transactionType: "INCOME",
    amountMinor: 2500,
    currency: "idr",
    transactionDate: "2026-08-20",
    description: "  Baru   dinormalisasi ",
  });

  assert.equal(updated.familyId, "fam_1");
  assert.equal(updated.createdByMemberId, "mem_100");
  assert.equal(updated.transactionType, "INCOME");
  assert.equal(updated.amountMinor, 2500);
  assert.equal(updated.currency, "IDR");
  assert.equal(updated.description, "Baru dinormalisasi");
  assert.equal(repository.transactions.length, 1);
  assert.equal(repository.auditLogs.at(-1)?.action, "UPDATE_TRANSACTION");
});

test("rejects editing or voiding a transaction from another family", async () => {
  const otherOwner: TelegramUser = { telegramUserId: "300", name: "Other Owner", username: "other" };
  const repository = new FakeFamilyRepository();
  repository.families.push(family("fam_1"), { ...family("fam_2"), createdBy: otherOwner.telegramUserId });
  repository.members.push(activeMember("fam_1", owner, "OWNER"), activeMember("fam_2", otherOwner, "OWNER"));
  repository.transactions.push(transaction("txn_foreign", "fam_2", "ACTIVE"));
  const service = new FamilyService(repository);

  await assert.rejects(service.updateTransaction(owner, "txn_foreign", {
    transactionType: "EXPENSE",
    amountMinor: 100,
    transactionDate: "2026-08-19",
    description: "Tidak boleh",
  }), TransactionError);
  await assert.rejects(service.requestTransactionVoid(owner, "txn_foreign"), TransactionError);
  assert.equal(repository.confirmations.length, 0);
  assert.equal(repository.transactions[0].status, "ACTIVE");
});

test("voids an active transaction only after confirmation and keeps the row", async () => {
  const repository = setupMember("OWNER");
  repository.transactions.push(transaction("txn_voidable", "fam_1", "ACTIVE"));
  const service = new FamilyService(repository);

  const pending = await service.requestTransactionVoid(owner, "txn_voidable");
  assert.equal(pending.action, "VOID_TRANSACTION");
  assert.equal(repository.transactions[0].status, "ACTIVE");

  const result = await service.confirmPendingAction(owner);

  assert.equal(result.action, "VOID_TRANSACTION");
  assert.equal(repository.transactions.length, 1);
  assert.equal(repository.transactions[0].status, "VOID");
  assert.equal(repository.auditLogs.at(-1)?.action, "VOID_TRANSACTION");
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

function transaction(transactionId: string, familyId: string, status: Transaction["status"]): Transaction {
  return {
    transactionId,
    familyId,
    transactionType: "EXPENSE",
    amountMinor: 1000,
    currency: "IDR",
    transactionDate: "2026-08-19",
    description: "Test",
    createdByMemberId: "mem_100",
    createdAt: "2026-08-19T00:00:00.000Z",
    status,
  };
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
  confirmations: PendingConfirmation[] = [];
  auditLogs: AuditLogEntry[] = [];
  transactions: Transaction[] = [];
  failAuditLog = false;
  failMemberCreation = false;
  spreadsheetCreationCalls = 0;

  async createFamily(value: Family) {
    if (!this.families.some((familyValue) => familyValue.familyId === value.familyId)) this.families.push(value);
  }
  async updateFamilyName(familyId: string, familyName: string) {
    const value = this.families.find((familyValue) => familyValue.familyId === familyId);
    if (value) value.familyName = familyName;
  }
  async updateFamilyStatus(familyId: string, status: Family["status"]) {
    const value = this.families.find((familyValue) => familyValue.familyId === familyId);
    if (value) value.status = status;
  }
  async createPendingConfirmation(value: PendingConfirmation) {
    this.confirmations = this.confirmations.filter((candidate) => candidate.telegramUserId !== value.telegramUserId);
    this.confirmations.push(value);
  }
  async findPendingConfirmation(telegramUserId: string) {
    return this.confirmations.find((value) => value.telegramUserId === telegramUserId && value.status === "PENDING") ?? null;
  }
  async updatePendingConfirmationStatus(confirmationId: string, status: PendingConfirmation["status"]) {
    const value = this.confirmations.find((candidate) => candidate.confirmationId === confirmationId);
    if (value) value.status = status;
  }
  async createAuditLog(entry: AuditLogEntry) {
    if (this.failAuditLog) throw new Error("audit unavailable");
    this.auditLogs.push(entry);
  }
  async createTransaction(value: Transaction) {
    if (!this.transactions.some((candidate) => candidate.transactionId === value.transactionId)) this.transactions.push(value);
  }
  async updateTransaction(transactionId: string, value: Transaction) {
    const index = this.transactions.findIndex((candidate) => candidate.transactionId === transactionId);
    if (index >= 0) this.transactions[index] = value;
  }
  async findTransactionsByFamilyId(familyId: string) {
    return this.transactions.filter((value) => value.familyId === familyId);
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
