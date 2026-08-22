import { GoogleConfigurationError, GoogleSheetsClient, REGISTRY_SHEETS } from "./sheets-client.ts";
import type {
  AuditAction,
  AuditTargetType,
  ConfirmationAction,
  ConfirmationStatus,
  DraftApprovalClaimStatus,
  FamilyStatus,
  InvitationStatus,
  MemberRole,
  MemberStatus,
  TransactionDraftStatus,
  TransactionStatus,
  TransactionType,
} from "../family/types";
import { CATEGORY_CODES } from "../family/category-analytics";

export interface RegistryIntegrityIssue {
  sheet: string;
  row: number;
  field?: string;
  code: string;
}

export interface RegistryIntegrityReport {
  checkedAt: string;
  healthy: boolean;
  rowCounts: Record<string, number>;
  issues: RegistryIntegrityIssue[];
}

const FAMILY_STATUSES = new Set<FamilyStatus>(["ACTIVE", "SUSPENDED"]);
const MEMBER_ROLES = new Set<MemberRole>(["OWNER", "ADMIN", "MEMBER"]);
const MEMBER_STATUSES = new Set<MemberStatus>(["ACTIVE", "SUSPENDED", "LEFT"]);
const INVITATION_STATUSES = new Set<InvitationStatus>(["PENDING", "USED", "EXPIRED", "REVOKED"]);
const CONFIRMATION_ACTIONS = new Set<ConfirmationAction>(["REVOKE_INVITATION", "DEACTIVATE_MEMBER", "ARCHIVE_FAMILY", "VOID_TRANSACTION"]);
const CONFIRMATION_STATUSES = new Set<ConfirmationStatus>(["PENDING", "COMPLETED", "CANCELLED", "EXPIRED"]);
const TRANSACTION_TYPES = new Set<TransactionType>(["INCOME", "EXPENSE"]);
const TRANSACTION_STATUSES = new Set<TransactionStatus>(["ACTIVE", "VOID"]);
const TRANSACTION_CATEGORIES = new Set<string>(CATEGORY_CODES);
const TRANSACTION_DRAFT_STATUSES = new Set<TransactionDraftStatus>(["PENDING", "EDITING", "COMPLETED", "CANCELLED", "EXPIRED"]);
const DRAFT_APPROVAL_CLAIM_STATUSES = new Set<DraftApprovalClaimStatus>(["CLAIMED", "COMPLETED"]);
const AUDIT_TARGET_TYPES = new Set<AuditTargetType>(["INVITATION", "MEMBER", "FAMILY", "TRANSACTION"]);
const AUDIT_ACTIONS = new Set<AuditAction>([
  "CREATE_INVITATION", "REVOKE_INVITATION", "CHANGE_MEMBER_ROLE", "DEACTIVATE_MEMBER",
  "REACTIVATE_MEMBER", "RENAME_FAMILY", "ARCHIVE_FAMILY", "REACTIVATE_FAMILY",
      "CREATE_TRANSACTION", "UPDATE_TRANSACTION", "UPDATE_TRANSACTION_CATEGORY", "VOID_TRANSACTION",

]);

export async function inspectRegistryIntegrity(
  client = new GoogleSheetsClient(),
): Promise<RegistryIntegrityReport> {
  const spreadsheetId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  if (!spreadsheetId) throw new GoogleConfigurationError("Central registry spreadsheet is not configured.");

  await client.ensureRegistry(spreadsheetId, "readRegistryIntegrity");
  const rowsBySheet = new Map<string, string[][]>();
  const issues: RegistryIntegrityIssue[] = [];
  const rowCounts: Record<string, number> = {};

  for (const sheet of REGISTRY_SHEETS) {
    const values = await client.getValues(spreadsheetId, sheet.name, "readRegistryIntegrity");
    const header = values[0] ?? [];
    if (!sameValues(header, sheet.headers)) {
      issues.push({ sheet: sheet.name, row: 1, code: "HEADER_MISMATCH" });
    }
    const rows = values.slice(1);
    rowsBySheet.set(sheet.name, rows);
    rowCounts[sheet.name] = rows.length;
  }

  validateFamilies(rowsBySheet.get("Families") ?? [], issues);
  validateMembers(rowsBySheet.get("Members") ?? [], rowsBySheet.get("Families") ?? [], issues);
  validateInvitations(rowsBySheet.get("Invitations") ?? [], rowsBySheet.get("Families") ?? [], rowsBySheet.get("Members") ?? [], issues);
  validateConfirmations(rowsBySheet.get("Pending Confirmations") ?? [], rowsBySheet.get("Families") ?? [], issues);
  validatePendingFamilyCreations(rowsBySheet.get("Pending Family Creations") ?? [], issues);
  validateDrafts(rowsBySheet.get("Pending Transaction Drafts") ?? [], rowsBySheet.get("Families") ?? [], rowsBySheet.get("Members") ?? [], issues);
  validateTransactions(rowsBySheet.get("Transactions") ?? [], rowsBySheet.get("Families") ?? [], rowsBySheet.get("Members") ?? [], issues);
  validateProcessedUpdates(rowsBySheet.get("Processed Telegram Updates") ?? [], issues);
  validateVisionUsage(rowsBySheet.get("AI Vision Usage") ?? [], rowsBySheet.get("Families") ?? [], rowsBySheet.get("Members") ?? [], issues);
  validateDraftApprovalClaims(
    rowsBySheet.get("Draft Approval Claims") ?? [],
    rowsBySheet.get("Families") ?? [],
    rowsBySheet.get("Members") ?? [],
    rowsBySheet.get("Pending Transaction Drafts") ?? [],
    rowsBySheet.get("Transactions") ?? [],
    issues,
  );
  validateAuditLog(rowsBySheet.get("Audit Log") ?? [], rowsBySheet.get("Families") ?? [], rowsBySheet.get("Members") ?? [], issues);

  return {
    checkedAt: new Date().toISOString(),
    healthy: issues.length === 0,
    rowCounts,
    issues,
  };
}

function validateFamilies(rows: string[][], issues: RegistryIntegrityIssue[]): void {
  const ids = new Set<string>();
  forEachRow("Families", rows, (row, rowNumber) => {
    required("Families", row, rowNumber, [0, 1, 3, 4, 5], issues);
    unique("Families", row[0], ids, rowNumber, issues);
    if (!FAMILY_STATUSES.has(row[2] as FamilyStatus)) issue(issues, "Families", rowNumber, "status", "INVALID_ENUM");
  });

  const activeOwnerCount = new Map<string, number>();
  // Owner-count integrity is validated in validateMembers after member rows are available.
  void activeOwnerCount;
}

function validateMembers(rows: string[][], familyRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const ids = new Set<string>();
  const activeTelegramIds = new Set<string>();
  const activeOwners = new Map<string, number>();
  forEachRow("Members", rows, (row, rowNumber) => {
    required("Members", row, rowNumber, [0, 1, 2, 3, 5, 6, 7], issues);
    unique("Members", row[0], ids, rowNumber, issues);
    foreign("Members", rowNumber, "family_id", row[1], familyIds, issues);
    if (!MEMBER_ROLES.has(row[5] as MemberRole)) issue(issues, "Members", rowNumber, "role", "INVALID_ENUM");
    if (!MEMBER_STATUSES.has(row[6] as MemberStatus)) issue(issues, "Members", rowNumber, "status", "INVALID_ENUM");
    if (row[6] === "ACTIVE") {
      if (activeTelegramIds.has(row[2])) issue(issues, "Members", rowNumber, "telegram_user_id", "DUPLICATE_ACTIVE_IDENTITY");
      activeTelegramIds.add(row[2]);
      if (row[5] === "OWNER") activeOwners.set(row[1], (activeOwners.get(row[1]) ?? 0) + 1);
    }
  });
  for (const family of familyRows) {
    if (family[0] && (activeOwners.get(family[0]) ?? 0) < 1) {
      const familyRow = familyRows.indexOf(family) + 2;
      issue(issues, "Families", familyRow, "family_id", "NO_ACTIVE_OWNER");
    }
  }
}

function validateInvitations(rows: string[][], familyRows: string[][], memberRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const memberTelegramIds = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[2]}`));
  const ids = new Set<string>();
  const codes = new Set<string>();
  forEachRow("Invitations", rows, (row, rowNumber) => {
    required("Invitations", row, rowNumber, [0, 1, 2, 3, 4, 5, 8], issues);
    unique("Invitations", row[0], ids, rowNumber, issues);
    unique("Invitations", row[2], codes, rowNumber, issues);
    foreign("Invitations", rowNumber, "family_id", row[1], familyIds, issues);
    if (!INVITATION_STATUSES.has(row[8] as InvitationStatus)) issue(issues, "Invitations", rowNumber, "status", "INVALID_ENUM");
    if (!memberTelegramIds.has(`${row[1]}:${row[3]}`)) issue(issues, "Invitations", rowNumber, "created_by", "ORPHAN_ACTOR");
    if (row[8] === "USED" && (!row[6] || !row[7])) issue(issues, "Invitations", rowNumber, "used_at", "USED_WITHOUT_CONSUMER");
  });
}

function validateConfirmations(rows: string[][], familyRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const ids = new Set<string>();
  forEachRow("Pending Confirmations", rows, (row, rowNumber) => {
    required("Pending Confirmations", row, rowNumber, [0, 1, 2, 3, 4, 5, 6, 7], issues);
    unique("Pending Confirmations", row[0], ids, rowNumber, issues);
    foreign("Pending Confirmations", rowNumber, "family_id", row[2], familyIds, issues);
    if (!CONFIRMATION_ACTIONS.has(row[3] as ConfirmationAction)) issue(issues, "Pending Confirmations", rowNumber, "action", "INVALID_ENUM");
    if (!CONFIRMATION_STATUSES.has(row[7] as ConfirmationStatus)) issue(issues, "Pending Confirmations", rowNumber, "status", "INVALID_ENUM");
  });
}

function validatePendingFamilyCreations(rows: string[][], issues: RegistryIntegrityIssue[]): void {
  forEachRow("Pending Family Creations", rows, (row, rowNumber) => {
    required("Pending Family Creations", row, rowNumber, [0, 2, 3, 4], issues);
    if (!new Set(["PENDING", "COMPLETED"]).has(row[4])) issue(issues, "Pending Family Creations", rowNumber, "status", "INVALID_ENUM");
  });
}

function validateDrafts(rows: string[][], familyRows: string[][], memberRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const members = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[2]}`));
  const ids = new Set<string>();
  forEachRow("Pending Transaction Drafts", rows, (row, rowNumber) => {
    required("Pending Transaction Drafts", row, rowNumber, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], issues);
    unique("Pending Transaction Drafts", row[0], ids, rowNumber, issues);
    foreign("Pending Transaction Drafts", rowNumber, "family_id", row[2], familyIds, issues);
    if (!members.has(`${row[2]}:${row[1]}`)) issue(issues, "Pending Transaction Drafts", rowNumber, "telegram_user_id", "ORPHAN_MEMBER");
    if (!TRANSACTION_TYPES.has(row[3] as TransactionType)) issue(issues, "Pending Transaction Drafts", rowNumber, "transaction_type", "INVALID_ENUM");
    if (!TRANSACTION_DRAFT_STATUSES.has(row[11] as TransactionDraftStatus)) issue(issues, "Pending Transaction Drafts", rowNumber, "status", "INVALID_ENUM");
    if (!Number.isSafeInteger(Number(row[4])) || Number(row[4]) <= 0) issue(issues, "Pending Transaction Drafts", rowNumber, "amount_minor", "INVALID_AMOUNT");
  });
}

function validateTransactions(rows: string[][], familyRows: string[][], memberRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const members = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[0]}`));
  const ids = new Set<string>();
  forEachRow("Transactions", rows, (row, rowNumber) => {
    required("Transactions", row, rowNumber, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], issues);
    unique("Transactions", row[0], ids, rowNumber, issues);
    foreign("Transactions", rowNumber, "family_id", row[1], familyIds, issues);
    if (!TRANSACTION_TYPES.has(row[2] as TransactionType)) issue(issues, "Transactions", rowNumber, "transaction_type", "INVALID_ENUM");
    if (!TRANSACTION_STATUSES.has(row[9] as TransactionStatus)) issue(issues, "Transactions", rowNumber, "status", "INVALID_ENUM");
    if (!TRANSACTION_CATEGORIES.has(row[10])) issue(issues, "Transactions", rowNumber, "category", "INVALID_ENUM");
    if (!members.has(`${row[1]}:${row[7]}`)) issue(issues, "Transactions", rowNumber, "created_by_member_id", "ORPHAN_MEMBER");
    if (!Number.isSafeInteger(Number(row[3])) || Number(row[3]) <= 0) issue(issues, "Transactions", rowNumber, "amount_minor", "INVALID_AMOUNT");
  });
}

function validateProcessedUpdates(rows: string[][], issues: RegistryIntegrityIssue[]): void {
  const ids = new Set<string>();
  forEachRow("Processed Telegram Updates", rows, (row, rowNumber) => {
    required("Processed Telegram Updates", row, rowNumber, [0, 1, 3], issues);
    unique("Processed Telegram Updates", row[0], ids, rowNumber, issues);
    if (!Number.isSafeInteger(Number(row[0])) || Number(row[0]) < 0) issue(issues, "Processed Telegram Updates", rowNumber, "update_id", "INVALID_UPDATE_ID");
    if (!new Set(["CLAIMED", "COMPLETED"]).has(row[3])) issue(issues, "Processed Telegram Updates", rowNumber, "status", "INVALID_ENUM");
  });
}

function validateVisionUsage(rows: string[][], familyRows: string[][], memberRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const members = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[2]}`));
  const ids = new Set<string>();
  forEachRow("AI Vision Usage", rows, (row, rowNumber) => {
    required("AI Vision Usage", row, rowNumber, [0, 1, 2, 3, 4, 5, 6, 7], issues);
    unique("AI Vision Usage", row[0], ids, rowNumber, issues);
    foreign("AI Vision Usage", rowNumber, "family_id", row[1], familyIds, issues);
    if (!members.has(`${row[1]}:${row[2]}`)) issue(issues, "AI Vision Usage", rowNumber, "telegram_user_id", "ORPHAN_MEMBER");
    if (!new Set(["IN_FLIGHT", "COMPLETED"]).has(row[7])) issue(issues, "AI Vision Usage", rowNumber, "status", "INVALID_ENUM");
    if (!Number.isSafeInteger(Number(row[4])) || Number(row[4]) < 0) issue(issues, "AI Vision Usage", rowNumber, "request_count", "INVALID_COUNT");
  });
}

function validateDraftApprovalClaims(
  rows: string[][],
  familyRows: string[][],
  memberRows: string[][],
  draftRows: string[][],
  transactionRows: string[][],
  issues: RegistryIntegrityIssue[],
): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const members = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[2]}`));
  const drafts = new Set(draftRows.map((row) => row[0]).filter(Boolean));
  const transactions = new Set(transactionRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[0]}`));
  const ids = new Set<string>();
  forEachRow("Draft Approval Claims", rows, (row, rowNumber) => {
    required("Draft Approval Claims", row, rowNumber, [0, 1, 2, 3, 4, 6, 7], issues);
    unique("Draft Approval Claims", row[0], ids, rowNumber, issues);
    foreign("Draft Approval Claims", rowNumber, "family_id", row[2], familyIds, issues);
    if (!drafts.has(row[0])) issue(issues, "Draft Approval Claims", rowNumber, "draft_id", "ORPHAN_DRAFT");
    if (!members.has(`${row[2]}:${row[1]}`)) issue(issues, "Draft Approval Claims", rowNumber, "telegram_user_id", "ORPHAN_MEMBER");
    if (!DRAFT_APPROVAL_CLAIM_STATUSES.has(row[7] as DraftApprovalClaimStatus)) issue(issues, "Draft Approval Claims", rowNumber, "status", "INVALID_ENUM");
    if (row[7] === "COMPLETED" && !transactions.has(`${row[2]}:${row[3]}`)) issue(issues, "Draft Approval Claims", rowNumber, "transaction_id", "COMPLETED_WITHOUT_TRANSACTION");
  });
}

function validateAuditLog(rows: string[][], familyRows: string[][], memberRows: string[][], issues: RegistryIntegrityIssue[]): void {
  const familyIds = new Set(familyRows.map((row) => row[0]).filter(Boolean));
  const members = new Set(memberRows.filter((row) => row[1]).map((row) => `${row[1]}:${row[0]}`));
  const ids = new Set<string>();
  forEachRow("Audit Log", rows, (row, rowNumber) => {
    required("Audit Log", row, rowNumber, [0, 1, 2, 3, 4, 5, 6, 9], issues);
    unique("Audit Log", row[0], ids, rowNumber, issues);
    foreign("Audit Log", rowNumber, "family_id", row[1], familyIds, issues);
    if (!members.has(`${row[1]}:${row[2]}`)) issue(issues, "Audit Log", rowNumber, "actor_member_id", "ORPHAN_ACTOR");
    if (!MEMBER_ROLES.has(row[3] as MemberRole)) issue(issues, "Audit Log", rowNumber, "actor_role", "INVALID_ENUM");
    if (!AUDIT_ACTIONS.has(row[4] as AuditAction)) issue(issues, "Audit Log", rowNumber, "action", "INVALID_ENUM");
    if (!AUDIT_TARGET_TYPES.has(row[5] as AuditTargetType)) issue(issues, "Audit Log", rowNumber, "target_type", "INVALID_ENUM");
  });
}

function forEachRow(
  sheet: string,
  rows: string[][],
  callback: (row: string[], rowNumber: number) => void,
): void {
  rows.forEach((row, index) => callback(row, index + 2));
}

function required(
  sheet: string,
  row: string[],
  rowNumber: number,
  indexes: number[],
  issues: RegistryIntegrityIssue[],
): void {
  for (const index of indexes) {
    if (!row[index]) issue(issues, sheet, rowNumber, String(index), "MISSING_REQUIRED_FIELD");
  }
}

function foreign(
  sheet: string,
  rowNumber: number,
  field: string,
  value: string,
  known: Set<string>,
  issues: RegistryIntegrityIssue[],
): void {
  if (!known.has(value)) issue(issues, sheet, rowNumber, field, "ORPHAN_REFERENCE");
}

function unique(
  sheet: string,
  value: string,
  seen: Set<string>,
  rowNumber: number,
  issues: RegistryIntegrityIssue[],
): void {
  if (!value) return;
  if (seen.has(value)) issue(issues, sheet, rowNumber, "0", "DUPLICATE_KEY");
  seen.add(value);
}

function issue(
  issues: RegistryIntegrityIssue[],
  sheet: string,
  row: number,
  field: string,
  code: string,
): void {
  issues.push({ sheet, row, field, code });
}

function sameValues(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
