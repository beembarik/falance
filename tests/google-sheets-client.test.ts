import assert from "node:assert/strict";
import test from "node:test";

import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import { GoogleSheetsClient, REGISTRY_SHEETS } from "../src/lib/google/sheets-client";
import { inspectRegistryIntegrity } from "../src/lib/google/registry-integrity";

test("logs a redacted operation label when a Google Sheets write fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  const logs: unknown[][] = [];
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  console.error = (...args: unknown[]) => logs.push(args);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    return new Response(JSON.stringify({
      error: {
        code: 403,
        message: "The service-account@example.iam.gserviceaccount.com caller does not have permission.",
        status: "PERMISSION_DENIED",
        errors: [{ reason: "PERMISSION_DENIED" }],
      },
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      new GoogleSheetsClient().appendRows(
        "central-registry-id",
        "Members",
        [["member-secret", "family-secret"]],
        "createMember",
      ),
    );
    assert.equal(logs.length, 1);
    const [label, details] = logs[0] as [string, Record<string, unknown>];
    assert.equal(label, "[Google] request failed");
    assert.deepEqual(details, {
      operation: "createMember",
      method: "POST",
      path: "/v4/spreadsheets/[redacted]/values/Members:append",
      status: 403,
      code: 403,
      reason: "PERMISSION_DENIED",
      statusText: "PERMISSION_DENIED",
      message: "The [redacted-email] caller does not have permission.",
    });
    assert.equal(JSON.stringify(logs).includes("central-registry-id"), false);
    assert.equal(JSON.stringify(logs).includes("member-secret"), false);
    assert.equal(JSON.stringify(logs).includes("family-secret"), false);
    assert.equal(JSON.stringify(logs).includes("service-account@example.iam.gserviceaccount.com"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
  }
});

test("logs a safe OAuth failure reason when Google authentication is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  const logs: unknown[][] = [];
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  console.error = (...args: unknown[]) => logs.push(args);
  globalThis.fetch = async (input) => {
    assert.equal(String(input), "https://oauth2.googleapis.com/token");
    return new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "Invalid JWT signature for service-account@example.iam.gserviceaccount.com",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(new GoogleSheetsClient().getValues("central-registry-id", "Members", "readMembers"));
    const [label, details] = logs[0] as [string, Record<string, unknown>];
    assert.equal(label, "[Google] request failed");
    assert.deepEqual(details, {
      operation: "readMembers",
      method: "POST",
      path: "/token",
      status: 400,
      reason: "invalid_grant",
      message: "Invalid JWT signature for [redacted-email]",
    });
    assert.equal(JSON.stringify(logs).includes("private"), false);
    assert.equal(JSON.stringify(logs).includes("service-account@example.iam.gserviceaccount.com"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
  }
});

test("marks Google Sheets 429 responses as quota telemetry with a safe operation label", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleInfo = console.info;
  const originalConsoleError = console.error;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    timingLogs: process.env.FALANCE_TIMING_LOGS,
  };
  const timingLogs: unknown[][] = [];
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  process.env.FALANCE_TIMING_LOGS = "true";
  console.info = (...args: unknown[]) => timingLogs.push(args);
  console.error = () => {};
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(new GoogleSheetsClient().getValues("central-registry-id", "Members", "readMembers"));
    const quotaLog = timingLogs.find((entry) => entry[0] === "[Timing]" && (entry[1] as Record<string, unknown>).scope === "google.request");
    assert.deepEqual(quotaLog?.[1], {
      scope: "google.request",
      durationMs: (quotaLog?.[1] as Record<string, unknown>).durationMs,
      operation: "readMembers",
      method: "GET",
      status: 429,
      outcome: "quota_exceeded",
      quota: "google_sheets",
    });
    assert.equal(JSON.stringify(timingLogs).includes("central-registry-id"), false);
    assert.equal(JSON.stringify(timingLogs).includes("test-access-token"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalConsoleInfo;
    console.error = originalConsoleError;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
    restoreEnvironment("FALANCE_TIMING_LOGS", originalEnvironment.timingLogs);
  }
});

test("reports registry foreign references without exposing row values", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const headers: Record<string, string[]> = {
    Settings: ["key", "value"],
    Families: ["family_id", "family_name", "status", "created_at", "created_by", "plan"],
    Members: ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"],
    Invitations: ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "used_at", "used_by", "status"],
    "Pending Family Creations": ["telegram_user_id", "family_name", "created_at", "expires_at", "status"],
    "Pending Confirmations": ["confirmation_id", "telegram_user_id", "family_id", "action", "target", "created_at", "expires_at", "status"],
    "Pending Transaction Drafts": ["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "created_at", "expires_at", "status"],
    "Audit Log": ["audit_id", "family_id", "actor_member_id", "actor_role", "action", "target_type", "target_id", "previous_value", "new_value", "created_at"],
    Transactions: ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"],
    "Processed Telegram Updates": ["update_id", "claimed_at", "completed_at", "status"],
    "AI Vision Usage": ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"],
    "Draft Approval Claims": ["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "completed_at", "lease_until", "status"],
  };
  const values: Record<string, string[][]> = Object.fromEntries(Object.entries(headers).map(([name, header]) => [name, [header]]));
  values.Families.push(["fam_1", "Keluarga Rahasia", "ACTIVE", "2026-01-01T00:00:00.000Z", "100", "MVP"]);
  values.Members.push(["mem_1", "fam_1", "100", "Owner Rahasia", "owner", "OWNER", "ACTIVE", "2026-01-01T00:00:00.000Z"]);
  values.Transactions.push(["txn_1", "fam_missing", "EXPENSE", "1000", "IDR", "2026-08-21", "Data Rahasia", "mem_1", "2026-08-21T00:00:00.000Z", "ACTIVE", "UNCATEGORIZED"]);
  const client = {
    ensureRegistry: async () => {},
    getValues: async (_spreadsheetId: string, sheetName: string) => values[sheetName],
  } as unknown as GoogleSheetsClient;

  try {
    const report = await inspectRegistryIntegrity(client);
    assert.equal(report.healthy, false);
    assert.ok(report.issues.some((issue) => issue.sheet === "Transactions" && issue.code === "ORPHAN_REFERENCE"));
    assert.equal(JSON.stringify(report).includes("Keluarga Rahasia"), false);
    assert.equal(JSON.stringify(report).includes("Data Rahasia"), false);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("initializes the single central registry without Drive or spreadsheet creation calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body));
      const assertion = String(body.get("assertion"));
      const claim = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8")) as { scope: string };
      assert.equal(claim.scope, "https://www.googleapis.com/auth/spreadsheets");
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url.includes("?fields=sheets.properties")) {
      return jsonResponse({ sheets: [
        { properties: { title: "Settings", sheetId: 1 } },
        { properties: { title: "Families", sheetId: 2 } },
        { properties: { title: "Members", sheetId: 3 } },
        { properties: { title: "Invitations", sheetId: 4 } },
        { properties: { title: "Pending Family Creations", sheetId: 5 } },
      ] });
    }
    if (url.includes("/values/") && url.includes("%3A1")) return jsonResponse({ values: [] });
    return jsonResponse({});
  };

  try {
    const client = new GoogleSheetsClient();
    await client.ensureRegistry("central-registry-id");
    const requestCountAfterInitialization = requests.length;
    await client.ensureRegistry("central-registry-id");
    assert.equal(requests.length, requestCountAfterInitialization);
    assert.ok(requests.some((request) => request.url.includes("/spreadsheets/central-registry-id")));
    assert.equal(requests.some((request) => request.url.includes("www.googleapis.com/drive")), false);
    assert.equal(requests.some((request) => request.url.includes("drive/v3/files")), false);
    assert.equal(requests.some((request) => String(request.init?.body).includes("createDriveSpreadsheet")), false);
    const headerBodies = requests
      .filter((request) => request.url.includes("/values/") && request.url.includes("A1") && request.init?.body !== undefined)
      .map((request) => JSON.parse(String(request.init?.body)).values[0]);
    assert.deepEqual(headerBodies, [
      ["key", "value"],
      ["family_id", "family_name", "status", "created_at", "created_by", "plan"],
      ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"],
      ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "used_at", "used_by", "status"],
      ["telegram_user_id", "family_name", "created_at", "expires_at", "status"],
      ["confirmation_id", "telegram_user_id", "family_id", "action", "target", "created_at", "expires_at", "status"],
      ["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "created_at", "expires_at", "status"],
      ["audit_id", "family_id", "actor_member_id", "actor_role", "action", "target_type", "target_id", "previous_value", "new_value", "created_at"],
      ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"],
      ["update_id", "claimed_at", "completed_at", "status"],
      ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"],
      ["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "completed_at", "lease_until", "status"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
  }
});

test("migrates legacy invitation and pending family creation schemas without deleting rows", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  const updates: Array<{ url: string; values: string[][]; operation: string | undefined }> = [];
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  const expectedHeaders = new Map<string, string[]>(REGISTRY_SHEETS.map((sheet) => [sheet.name, [...sheet.headers]]));
  const legacyInvitationHeader = ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "status", "used_by", "used_at"];
  const legacyPendingHeader = ["telegram_user_id", "created_at", "expires_at", "status"];
  const legacyTransactionHeader = ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status"];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url.includes("?fields=sheets.properties")) {
      return jsonResponse({ sheets: [...expectedHeaders.keys()].map((title, index) => ({ properties: { title, sheetId: index + 1 } })) });
    }
    if (url.endsWith("/values/Invitations!1%3A1")) return jsonResponse({ values: [legacyInvitationHeader] });
    if (url.endsWith("/values/Pending%20Family%20Creations!1%3A1")) return jsonResponse({ values: [legacyPendingHeader] });
    if (url.endsWith("/values/Transactions!1%3A1")) return jsonResponse({ values: [legacyTransactionHeader] });
    if (url.endsWith("/values/Invitations")) return jsonResponse({ values: [legacyInvitationHeader, ["inv_1", "fam_1", "FAL-AAAAAA", "100", "2026-01-01", "2026-01-02", "PENDING", "", ""]] });
    if (url.endsWith("/values/Pending%20Family%20Creations")) return jsonResponse({ values: [legacyPendingHeader, ["100", "2026-01-01", "2026-01-02", "PENDING"]] });
    if (url.endsWith("/values/Transactions")) return jsonResponse({ values: [legacyTransactionHeader, ["txn_1", "fam_1", "EXPENSE", "1000", "IDR", "2026-08-19", "Makan", "mem_100", "2026-08-19T00:00:00.000Z", "ACTIVE"]] });
    if (url.includes("/values/") && init?.method === "PUT") {
      updates.push({ url, values: JSON.parse(String(init.body)).values, operation: undefined });
      return jsonResponse({});
    }
    const sheetName = decodeURIComponent(url.split("/values/")[1] ?? "").split("!")[0];
    return jsonResponse({ values: [expectedHeaders.get(sheetName) ?? []] });
  };

  try {
    await new GoogleSheetsClient().ensureRegistry("central-registry-id");
    const invitationUpdates = updates.filter((update) => update.url.includes("Invitations"));
    const pendingUpdates = updates.filter((update) => update.url.includes("Pending%20Family%20Creations"));
    const transactionUpdates = updates.filter((update) => update.url.includes("Transactions"));
    assert.deepEqual(invitationUpdates.map((update) => update.values), [
      [["inv_1", "fam_1", "FAL-AAAAAA", "100", "2026-01-01", "2026-01-02", "", "", "PENDING"]],
      [expectedHeaders.get("Invitations")],
    ]);
    assert.deepEqual(pendingUpdates.map((update) => update.values), [
      [["100", "", "2026-01-01", "2026-01-02", "PENDING"]],
      [expectedHeaders.get("Pending Family Creations")],
    ]);
    assert.deepEqual(transactionUpdates.map((update) => update.values), [
      [["txn_1", "fam_1", "EXPENSE", "1000", "IDR", "2026-08-19", "Makan", "mem_100", "2026-08-19T00:00:00.000Z", "ACTIVE", "UNCATEGORIZED"]],
      [expectedHeaders.get("Transactions")],
    ]);
    assert.equal(updates.some((update) => update.url.includes("deleteDimension")), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
  }
});

test("updates a Families row name without creating a new family row", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const updates: Array<{
    spreadsheetId: string;
    range: string;
    values: readonly (readonly string[])[];
    operation: string | undefined;
  }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [
      ["family_id", "family_name", "status", "created_at", "created_by", "plan"],
      ["fam_1", "Keluarga Lama", "ACTIVE", "2026-01-01T00:00:00.000Z", "100", "MVP"],
    ],
    updateValues: async (
      spreadsheetId: string,
      range: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => updates.push({ spreadsheetId, range, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).updateFamilyName("fam_1", "Keluarga Baru");
    assert.deepEqual(updates, [{
      spreadsheetId: "central-registry-id",
      range: "Families!A2",
      values: [["fam_1", "Keluarga Baru", "ACTIVE", "2026-01-01T00:00:00.000Z", "100", "MVP"]],
      operation: "updateFamilyName",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("updates a Families row status without creating or deleting the family row", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const updates: Array<{
    spreadsheetId: string;
    range: string;
    values: readonly (readonly string[])[];
    operation: string | undefined;
  }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [
      ["family_id", "family_name", "status", "created_at", "created_by", "plan"],
      ["fam_1", "Keluarga", "ACTIVE", "2026-01-01T00:00:00.000Z", "100", "MVP"],
    ],
    updateValues: async (
      spreadsheetId: string,
      range: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => updates.push({ spreadsheetId, range, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).updateFamilyStatus("fam_1", "SUSPENDED");
    assert.deepEqual(updates, [{
      spreadsheetId: "central-registry-id",
      range: "Families!A2",
      values: [["fam_1", "Keluarga", "SUSPENDED", "2026-01-01T00:00:00.000Z", "100", "MVP"]],
      operation: "updateFamilyStatus",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("appends an audit record to the Audit Log worksheet", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const appends: Array<{ spreadsheetId: string; sheetName: string; values: readonly (readonly string[])[]; operation: string | undefined }> = [];
  const client = {
    ensureRegistry: async () => {},
    appendRows: async (
      spreadsheetId: string,
      sheetName: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => appends.push({ spreadsheetId, sheetName, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).createAuditLog({
      auditId: "audit_1",
      familyId: "fam_1",
      actorMemberId: "mem_100",
      actorRole: "OWNER",
      action: "CHANGE_MEMBER_ROLE",
      targetType: "MEMBER",
      targetId: "mem_200",
      previousValue: "MEMBER",
      newValue: "ADMIN",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(appends, [{
      spreadsheetId: "central-registry-id",
      sheetName: "Audit Log",
      values: [["audit_1", "fam_1", "mem_100", "OWNER", "CHANGE_MEMBER_ROLE", "MEMBER", "mem_200", "MEMBER", "ADMIN", "2026-01-01T00:00:00.000Z"]],
      operation: "createAuditLog",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("appends a transaction row with the mandatory family_id and typed fields", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const appends: Array<{ spreadsheetId: string; sheetName: string; values: readonly (readonly string[])[]; operation: string | undefined }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"]],
    appendRows: async (
      spreadsheetId: string,
      sheetName: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => appends.push({ spreadsheetId, sheetName, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).createTransaction({
      transactionId: "txn_1",
      familyId: "fam_1",
      transactionType: "EXPENSE",
      amountMinor: 15000,
      currency: "IDR",
      transactionDate: "2026-08-19",
      description: "Makan siang",
      createdByMemberId: "mem_100",
      createdAt: "2026-08-19T00:00:00.000Z",
      status: "ACTIVE",
    });
    assert.deepEqual(appends, [{
      spreadsheetId: "central-registry-id",
      sheetName: "Transactions",
      values: [["txn_1", "fam_1", "EXPENSE", "15000", "IDR", "2026-08-19", "Makan siang", "mem_100", "2026-08-19T00:00:00.000Z", "ACTIVE", "UNCATEGORIZED"]],
      operation: "createTransaction",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("appends a pending AI draft row with server-owned identity and expiry fields", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const appends: Array<{ spreadsheetId: string; sheetName: string; values: readonly (readonly string[])[]; operation: string | undefined }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "created_at", "expires_at", "status"]],
    appendRows: async (
      spreadsheetId: string,
      sheetName: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => appends.push({ spreadsheetId, sheetName, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).createPendingTransactionDraft({
      draftId: "draft_1",
      telegramUserId: "100",
      familyId: "fam_1",
      transactionType: "EXPENSE",
      amountMinor: 35000,
      currency: "IDR",
      transactionDate: "2026-08-19",
      description: "Beli susu",
      confidence: "HIGH",
      createdAt: "2026-08-19T00:00:00.000Z",
      expiresAt: "2026-08-19T00:05:00.000Z",
      status: "PENDING",
    });
    assert.deepEqual(appends, [{
      spreadsheetId: "central-registry-id",
      sheetName: "Pending Transaction Drafts",
      values: [["draft_1", "100", "fam_1", "EXPENSE", "35000", "IDR", "2026-08-19", "Beli susu", "HIGH", "2026-08-19T00:00:00.000Z", "2026-08-19T00:05:00.000Z", "PENDING"]],
      operation: "createPendingTransactionDraft",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("updates a transaction row in place without creating a new transaction row", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const updates: Array<{
    spreadsheetId: string;
    range: string;
    values: readonly (readonly string[])[];
    operation: string | undefined;
  }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [
      ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"],
      ["txn_1", "fam_1", "EXPENSE", "15000", "IDR", "2026-08-19", "Makan siang", "mem_100", "2026-08-19T00:00:00.000Z", "ACTIVE", "UNCATEGORIZED"],
    ],
    updateValues: async (
      spreadsheetId: string,
      range: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => updates.push({ spreadsheetId, range, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).updateTransaction("txn_1", {
      transactionId: "txn_1",
      familyId: "fam_1",
      transactionType: "EXPENSE",
      amountMinor: 20000,
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Belanja baru",
      createdByMemberId: "mem_100",
      createdAt: "2026-08-19T00:00:00.000Z",
      status: "VOID",
    });
    assert.deepEqual(updates, [{
      spreadsheetId: "central-registry-id",
      range: "Transactions!A2",
      values: [["txn_1", "fam_1", "EXPENSE", "20000", "IDR", "2026-08-20", "Belanja baru", "mem_100", "2026-08-19T00:00:00.000Z", "VOID", "UNCATEGORIZED"]],
      operation: "updateTransaction",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("reads a legacy transaction row without category as UNCATEGORIZED", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status"], [
      "txn_legacy", "fam_1", "EXPENSE", "1000", "IDR", "2026-08-19", "Makan", "mem_100", "2026-08-19T00:00:00.000Z", "ACTIVE",
    ]],
  } as unknown as GoogleSheetsClient;

  try {
    const transactions = await new GoogleSheetsFamilyRepository(client).findTransactionsByFamilyId("fam_1");
    assert.equal(transactions[0]?.transactionId, "txn_legacy");
    assert.equal(transactions[0]?.category, "UNCATEGORIZED");
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("updates a suspended Members row to ACTIVE without creating a new member row", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const updates: Array<{
    spreadsheetId: string;
    range: string;
    values: readonly (readonly string[])[];
    operation: string | undefined;
  }> = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => [
      ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"],
      ["mem_200", "fam_1", "200", "Member", "suspended-member", "MEMBER", "SUSPENDED", "2026-01-01T00:00:00.000Z"],
    ],
    updateValues: async (
      spreadsheetId: string,
      range: string,
      values: readonly (readonly string[])[],
      operation?: string,
    ) => updates.push({ spreadsheetId, range, values, operation }),
  } as unknown as GoogleSheetsClient;

  try {
    await new GoogleSheetsFamilyRepository(client).updateMemberStatus("mem_200", "ACTIVE");
    assert.deepEqual(updates, [{
      spreadsheetId: "central-registry-id",
      range: "Members!A2",
      values: [["mem_200", "fam_1", "200", "Member", "suspended-member", "MEMBER", "ACTIVE", "2026-01-01T00:00:00.000Z"]],
      operation: "updateMemberStatus",
    }]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

async function createPrivateKeyPem(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in keyPair)) throw new Error("Expected an RSA key pair.");
  const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const base64 = Buffer.from(privateKey).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("claims a Telegram update once and suppresses it after completion", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const rows: string[][] = [["update_id", "claimed_at", "completed_at", "status"]];
  const updates: string[][] = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => rows,
    appendRows: async (
      _spreadsheetId: string,
      _sheetName: string,
      values: readonly (readonly string[])[],
    ) => rows.push(...values.map((value) => [...value])),
    updateValues: async (
      _spreadsheetId: string,
      _range: string,
      values: readonly (readonly string[])[],
    ) => {
      updates.push(...values.map((value) => [...value]));
      rows[1] = [...values[0]];
    },
  } as unknown as GoogleSheetsClient;

  try {
    const repository = new GoogleSheetsFamilyRepository(client);
    const parallelClaims = await Promise.all([
      repository.claimTelegramUpdate(900001, "2026-08-21T00:00:00.000Z"),
      repository.claimTelegramUpdate(900001, "2026-08-21T00:01:00.000Z"),
    ]);
    assert.deepEqual(parallelClaims.sort(), [false, true]);
    await repository.completeTelegramUpdate(900001, "2026-08-21T00:02:00.000Z");
    assert.equal(await repository.claimTelegramUpdate(900001, "2026-08-21T00:03:00.000Z"), false);
    assert.deepEqual(rows[1], ["900001", "2026-08-21T00:00:00.000Z", "2026-08-21T00:02:00.000Z", "COMPLETED"]);
    assert.deepEqual(updates, [["900001", "2026-08-21T00:00:00.000Z", "2026-08-21T00:02:00.000Z", "COMPLETED"]]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("reclaims a stale Telegram update claim after the five-minute lease", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const rows: string[][] = [
    ["update_id", "claimed_at", "completed_at", "status"],
    ["900002", "2026-08-21T00:00:00.000Z", "", "CLAIMED"],
  ];
  const updates: string[][] = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async () => rows,
    updateValues: async (
      _spreadsheetId: string,
      _range: string,
      values: readonly (readonly string[])[],
    ) => {
      updates.push(...values.map((value) => [...value]));
      rows[1] = [...values[0]];
    },
  } as unknown as GoogleSheetsClient;

  try {
    const repository = new GoogleSheetsFamilyRepository(client);
    assert.equal(await repository.claimTelegramUpdate(900002, "2026-08-21T00:05:00.000Z"), true);
    assert.deepEqual(updates, [["900002", "2026-08-21T00:05:00.000Z", "", "CLAIMED"]]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("claims draft approval once, completes it, and reclaims a stale lease", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const rows: string[][] = [["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "completed_at", "lease_until", "status"]];
  const updates: string[][] = [];
  const client = {
    ensureRegistry: async () => {},
    getValues: async (_spreadsheetId: string, range: string) => range.startsWith("Draft Approval Claims") ? rows : [],
    appendRows: async (_spreadsheetId: string, _sheetName: string, values: readonly (readonly string[])[]) => rows.push(...values.map((value) => [...value])),
    updateValues: async (_spreadsheetId: string, range: string, values: readonly (readonly string[])[]) => {
      updates.push(...values.map((value) => [...value]));
      const rowIndex = Number(range.match(/!A(\d+)/)?.[1] ?? "0") - 1;
      rows[rowIndex] = [...values[0]];
    },
  } as unknown as GoogleSheetsClient;

  try {
    const repository = new GoogleSheetsFamilyRepository(client);
    const parallelClaims = await Promise.all([
      repository.claimDraftApproval("draft_claim_1", "100", "fam_1", "txn_claim_1", "2026-08-21T00:00:00.000Z", 60_000),
      repository.claimDraftApproval("draft_claim_1", "100", "fam_1", "txn_claim_2", "2026-08-21T00:00:00.001Z", 60_000),
    ]);
    assert.deepEqual(parallelClaims.sort(), [false, true]);
    assert.equal((await repository.findDraftApprovalClaim("draft_claim_1"))?.transactionId, "txn_claim_1");

    await repository.completeDraftApproval("draft_claim_1", "2026-08-21T00:00:02.000Z");
    assert.equal(await repository.claimDraftApproval("draft_claim_1", "100", "fam_1", "txn_claim_3", "2026-08-21T00:00:03.000Z", 60_000), false);
    assert.equal(rows[1][7], "COMPLETED");

    assert.equal(await repository.claimDraftApproval("draft_claim_stale", "100", "fam_1", "txn_old", "2026-08-21T00:00:00.000Z", 60_000), true);
    assert.equal(await repository.claimDraftApproval("draft_claim_stale", "100", "fam_1", "txn_new", "2026-08-21T00:01:01.000Z", 60_000), true);
    assert.equal((await repository.findDraftApprovalClaim("draft_claim_stale"))?.transactionId, "txn_new");
    assert.deepEqual(updates, [
      ["draft_claim_1", "100", "fam_1", "txn_claim_1", "2026-08-21T00:00:00.000Z", "2026-08-21T00:00:02.000Z", "", "COMPLETED"],
      ["draft_claim_stale", "100", "fam_1", "txn_new", "2026-08-21T00:01:01.000Z", "", "2026-08-21T00:02:01.000Z", "CLAIMED"],
    ]);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});

test("enforces durable AI vision cooldown, lease, and rolling-window quota", async () => {
  const originalRegistryId = process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID;
  process.env.GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID = "central-registry-id";
  const header = ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"];
  const values: string[][] = [header];
  const fakeClient = {
    ensureRegistry: async () => {},
    getValues: async (_spreadsheetId: string, range: string) => range.startsWith("AI Vision Usage") ? values : [],
    appendRows: async (_spreadsheetId: string, _sheet: string, rows: string[][]) => values.push(...rows),
    updateValues: async (_spreadsheetId: string, range: string, rows: readonly (readonly string[])[]) => {
      const rowIndex = Number(range.match(/!A(\d+)/)?.[1] ?? "0") - 1;
      values[rowIndex] = [...rows[0]];
    },
  } as unknown as GoogleSheetsClient;
  const repository = new GoogleSheetsFamilyRepository(fakeClient);
  const first = "2026-08-21T00:00:00.000Z";
  const second = "2026-08-21T00:00:00.001Z";
  const afterCooldown = "2026-08-21T00:00:31.000Z";

  try {
    assert.equal(await repository.claimReceiptVision("fam_1", "100", first, 30_000, 3_600_000, 2, 60_000), true);
    assert.equal(await repository.claimReceiptVision("fam_1", "100", second, 30_000, 3_600_000, 2, 60_000), false);
    await repository.completeReceiptVision("fam_1", "100", "2026-08-21T00:00:02.000Z");
    assert.equal(await repository.claimReceiptVision("fam_1", "100", afterCooldown, 30_000, 3_600_000, 2, 60_000), true);
    await repository.completeReceiptVision("fam_1", "100", "2026-08-21T00:00:32.000Z");
    assert.equal(await repository.claimReceiptVision("fam_1", "100", "2026-08-21T00:01:03.000Z", 30_000, 3_600_000, 2, 60_000), false);
  } finally {
    restoreEnvironment("GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID", originalRegistryId);
  }
});
