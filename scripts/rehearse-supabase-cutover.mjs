import { createHash } from "node:crypto";
import { createSupabaseImportPlan } from "../src/lib/migration/supabase-import-plan.ts";
import { rehearseSupabaseMigration } from "../src/lib/migration/supabase-rehearsal.ts";

const outputPath = argument("--output");
const report = runRehearsal();
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outputPath, serialized, "utf8");
}
console.log(serialized);

if (!report.healthy) process.exitCode = 1;

function runRehearsal() {
  const baseSnapshot = fixtureSnapshot();
  const finalSnapshot = addFinalDelta(baseSnapshot);
  const rollbackSnapshot = cloneSnapshot(baseSnapshot);

  const base = validatePhase("pre_cutover_backup", baseSnapshot);
  const finalDelta = validatePhase("final_delta_after_write_freeze", finalSnapshot);
  const rollback = validatePhase("rollback_source", rollbackSnapshot);

  const basePlan = createSupabaseImportPlan(baseSnapshot);
  const finalPlan = createSupabaseImportPlan(finalSnapshot);
  const rollbackPlan = createSupabaseImportPlan(rollbackSnapshot);
  const repeatedFinalPlan = createSupabaseImportPlan(finalSnapshot);

  const finalPlanDigest = digest(finalPlan);
  const repeatedFinalPlanDigest = digest(repeatedFinalPlan);
  const idempotentPlan = finalPlanDigest === repeatedFinalPlanDigest;
  const finalDeltaDetected = finalDelta.rowCounts.Transactions > base.rowCounts.Transactions;
  const rollbackMatchesBackup = digest(rollbackPlan) === digest(basePlan);

  const checks = [
    { name: "pre_cutover_snapshot_healthy", passed: base.healthy },
    { name: "final_delta_snapshot_healthy", passed: finalDelta.healthy },
    { name: "rollback_snapshot_healthy", passed: rollback.healthy },
    { name: "final_delta_detected_after_freeze", passed: finalDeltaDetected },
    { name: "import_plan_is_idempotent", passed: idempotentPlan },
    { name: "rollback_plan_matches_backup", passed: rollbackMatchesBackup },
    { name: "production_switch_not_applied", passed: true },
    { name: "network_write_not_attempted", passed: true },
  ];

  return {
    version: 1,
    healthy: checks.every((check) => check.passed),
    mode: "local-only",
    sourceOfTruthBeforeAndAfterRehearsal: "google-sheets",
    candidateBackend: "supabase",
    productionSwitchApplied: false,
    networkWriteAttempted: false,
    writeFreezeSimulated: true,
    checks,
    phases: {
      preCutoverBackup: summarize(base, basePlan),
      finalDelta: summarize(finalDelta, finalPlan),
      rollbackSource: summarize(rollback, rollbackPlan),
    },
    idempotence: {
      finalImportPlanDigest: finalPlanDigest,
      repeatedFinalImportPlanDigest: repeatedFinalPlanDigest,
      equal: idempotentPlan,
    },
    rollback: {
      restoredSourceOfTruth: "google-sheets",
      backupPlanMatchesRollbackPlan: rollbackMatchesBackup,
      destructiveRollback: false,
    },
  };
}

function validatePhase(name, snapshot) {
  const report = rehearseSupabaseMigration(snapshot);
  return { phase: name, ...report };
}

function summarize(report, plan) {
  return {
    healthy: report.healthy,
    rowCounts: report.rowCounts,
    digests: report.digests,
    issues: report.issues,
    batchCounts: Object.fromEntries(plan.batches.map((batch) => [batch.table, batch.rows.length])),
  };
}

function fixtureSnapshot() {
  const timestamp = "2026-08-23T00:00:00.000Z";
  return {
    version: 1,
    checkedAt: timestamp,
    healthy: true,
    sheets: {
      Settings: [],
      Families: [{
        family_id: "cutover-family-001",
        family_name: "Cutover Test Family",
        status: "ACTIVE",
        created_at: timestamp,
        created_by: "cutover-user-001",
        plan: "FREE",
      }],
      Members: [{
        member_id: "cutover-member-001",
        family_id: "cutover-family-001",
        telegram_user_id: "cutover-user-001",
        name: "Cutover Test Member",
        username: "cutover_test_user",
        role: "OWNER",
        status: "ACTIVE",
        joined_at: timestamp,
      }],
      Invitations: [{
        invitation_id: "cutover-invitation-001",
        family_id: "cutover-family-001",
        code: "CUTOVER-001",
        created_by: "cutover-user-001",
        created_at: timestamp,
        expires_at: "2026-08-24T00:00:00.000Z",
        status: "PENDING",
      }],
      "Pending Family Creations": [],
      "Pending Confirmations": [],
      "Audit Log": [],
      "Pending Transaction Drafts": [],
      "Draft Approval Claims": [],
      "Processed Telegram Updates": [],
      "AI Vision Usage": [],
      "AI Text Usage": [],
      Transactions: [{
        transaction_id: "cutover-transaction-001",
        family_id: "cutover-family-001",
        transaction_type: "EXPENSE",
        amount_minor: 100000,
        currency: "IDR",
        transaction_date: "2026-08-22",
        description: "Cutover test expense",
        created_by_member_id: "cutover-member-001",
        created_at: timestamp,
        status: "ACTIVE",
        category: "FOOD",
      }],
    },
  };
}

function addFinalDelta(snapshot) {
  const next = cloneSnapshot(snapshot);
  next.sheets.Transactions.push({
    transaction_id: "cutover-transaction-002",
    family_id: "cutover-family-001",
    transaction_type: "INCOME",
    amount_minor: 250000,
    currency: "IDR",
    transaction_date: "2026-08-23",
    description: "Cutover final delta",
    created_by_member_id: "cutover-member-001",
    created_at: "2026-08-23T00:05:00.000Z",
    status: "ACTIVE",
    category: "SALARY",
  });
  next.sheets["Processed Telegram Updates"].push({
    update_id: 900001,
    claimed_at: "2026-08-23T00:05:00.000Z",
    completed_at: "2026-08-23T00:05:01.000Z",
    status: "COMPLETED",
  });
  return next;
}

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function digest(value) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
