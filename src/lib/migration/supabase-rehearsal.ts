import { createHash } from "node:crypto";

export interface MigrationSnapshot {
  sheets: Record<string, readonly Record<string, unknown>[]>;
}

export interface MigrationIssue {
  sheet: string;
  code: string;
  count?: number;
}

export interface MigrationRehearsalReport {
  healthy: boolean;
  checkedSheets: string[];
  rowCounts: Record<string, number>;
  digests: Record<string, string>;
  issues: MigrationIssue[];
}

interface SheetRule {
  primaryKey: string;
  required?: readonly string[];
  enums?: Record<string, readonly string[]>;
}

const SHEET_RULES: Record<string, SheetRule> = {
  Settings: { primaryKey: "key", required: ["key", "value"] },
  Families: { primaryKey: "family_id", required: ["family_id", "family_name", "status", "created_at", "created_by", "plan"], enums: { status: ["ACTIVE", "SUSPENDED"] } },
  Members: { primaryKey: "member_id", required: ["member_id", "family_id", "telegram_user_id", "name", "role", "status", "joined_at"], enums: { role: ["OWNER", "ADMIN", "MEMBER"], status: ["ACTIVE", "SUSPENDED", "LEFT"] } },
  Invitations: { primaryKey: "invitation_id", required: ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "status"], enums: { status: ["PENDING", "USED", "EXPIRED", "REVOKED"] } },
  "Pending Family Creations": { primaryKey: "telegram_user_id", required: ["telegram_user_id", "created_at", "expires_at"] },
  "Pending Confirmations": { primaryKey: "confirmation_id", required: ["confirmation_id", "telegram_user_id", "family_id", "action", "target", "created_at", "expires_at", "status"], enums: { status: ["PENDING", "COMPLETED", "CANCELLED", "EXPIRED"] } },
  "Audit Log": { primaryKey: "audit_id", required: ["audit_id", "family_id", "actor_member_id", "actor_role", "action", "target_type", "target_id", "created_at"] },
  "Pending Transaction Drafts": { primaryKey: "draft_id", required: ["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "created_at", "expires_at", "status"], enums: { transaction_type: ["INCOME", "EXPENSE"], confidence: ["HIGH", "MEDIUM", "LOW"], status: ["PENDING", "EDITING", "COMPLETED", "CANCELLED", "EXPIRED"] } },
  "Draft Approval Claims": { primaryKey: "draft_id", required: ["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "lease_until", "status"], enums: { status: ["CLAIMED", "COMPLETED"] } },
  "Processed Telegram Updates": { primaryKey: "update_id", required: ["update_id", "claimed_at", "status"], enums: { status: ["CLAIMED", "COMPLETED"] } },
  "AI Vision Usage": { primaryKey: "usage_key", required: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"], enums: { status: ["IN_FLIGHT", "COMPLETED"] } },
  "AI Text Usage": { primaryKey: "usage_key", required: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"], enums: { status: ["IN_FLIGHT", "COMPLETED"] } },
  Transactions: { primaryKey: "transaction_id", required: ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status"], enums: { transaction_type: ["INCOME", "EXPENSE"], status: ["ACTIVE", "VOID"] } },
};

export function rehearseSupabaseMigration(snapshot: MigrationSnapshot): MigrationRehearsalReport {
  const sheets = snapshot?.sheets ?? {};
  const issues: MigrationIssue[] = [];
  const rowCounts: Record<string, number> = {};
  const digests: Record<string, string> = {};
  const checkedSheets = Object.keys(SHEET_RULES);

  for (const [sheetName, rule] of Object.entries(SHEET_RULES)) {
    const rows = sheets[sheetName] ?? [];
    rowCounts[sheetName] = rows.length;
    digests[sheetName] = digestRows(rows);
    validateSheet(sheetName, rows, rule, issues);
  }

  for (const sheetName of Object.keys(sheets)) {
    if (!SHEET_RULES[sheetName]) issues.push({ sheet: sheetName, code: "UNKNOWN_SHEET" });
  }

  const familyIds = values(sheets.Families, "family_id");
  const memberIds = values(sheets.Members, "member_id");
  for (const sheetName of ["Members", "Invitations", "Pending Confirmations", "Pending Transaction Drafts", "Draft Approval Claims", "AI Vision Usage", "AI Text Usage", "Transactions", "Audit Log"]) {
    for (const row of sheets[sheetName] ?? []) {
      if (typeof row.family_id === "string" && !familyIds.has(row.family_id)) issues.push({ sheet: sheetName, code: "ORPHAN_FAMILY_REFERENCE" });
    }
  }
  for (const sheetName of ["Transactions", "Audit Log"]) {
    for (const row of sheets[sheetName] ?? []) {
      if (typeof row.created_by_member_id === "string" && !memberIds.has(row.created_by_member_id)) issues.push({ sheet: sheetName, code: "ORPHAN_MEMBER_REFERENCE" });
      if (typeof row.actor_member_id === "string" && !memberIds.has(row.actor_member_id)) issues.push({ sheet: sheetName, code: "ORPHAN_MEMBER_REFERENCE" });
    }
  }

  return { healthy: issues.length === 0, checkedSheets, rowCounts, digests, issues };
}

function validateSheet(sheetName: string, rows: readonly Record<string, unknown>[], rule: SheetRule, issues: MigrationIssue[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row[rule.primaryKey];
    if (key === undefined || key === null || key === "") issues.push({ sheet: sheetName, code: "MISSING_PRIMARY_KEY" });
    else if (seen.has(String(key))) issues.push({ sheet: sheetName, code: "DUPLICATE_PRIMARY_KEY" });
    else seen.add(String(key));
    for (const field of rule.required ?? []) if (row[field] === undefined || row[field] === null || row[field] === "") issues.push({ sheet: sheetName, code: "MISSING_REQUIRED_FIELD" });
    for (const [field, allowed] of Object.entries(rule.enums ?? {})) if (row[field] !== undefined && row[field] !== null && !allowed.includes(String(row[field]))) issues.push({ sheet: sheetName, code: "INVALID_ENUM" });
    if ("amount_minor" in row && (typeof row.amount_minor !== "number" || !Number.isSafeInteger(row.amount_minor) || row.amount_minor <= 0)) issues.push({ sheet: sheetName, code: "INVALID_AMOUNT" });
    if ("request_count" in row && (typeof row.request_count !== "number" || !Number.isSafeInteger(row.request_count) || row.request_count < 0)) issues.push({ sheet: sheetName, code: "INVALID_REQUEST_COUNT" });
  }
}

function values(rows: readonly Record<string, unknown>[] | undefined, key: string): Set<string> {
  return new Set((rows ?? []).map((row) => row[key]).filter((value): value is string => typeof value === "string"));
}

function digestRows(rows: readonly Record<string, unknown>[]): string {
  const canonical = rows.map((row) => canonicalize(row)).sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
