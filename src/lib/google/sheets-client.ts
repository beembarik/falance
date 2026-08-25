import { logDuration } from "../observability/timing.ts";

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_VALUES_CACHE_MS = 3_000;

export class GoogleConfigurationError extends Error {}
export class GoogleApiError extends Error {}

export class GoogleSheetsClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private readonly registryInitialization = new Map<string, Promise<void>>();
  private readonly valuesCache = new Map<string, CachedValues>();

  async ensureRegistry(
    spreadsheetId: string,
    operation: GoogleOperation = "ensureRegistry",
  ): Promise<void> {
    const existing = this.registryInitialization.get(spreadsheetId);
    if (existing) return existing;

    const initialization = this.initializeRegistry(spreadsheetId, operation);
    this.registryInitialization.set(spreadsheetId, initialization);
    try {
      await initialization;
    } catch (error) {
      if (this.registryInitialization.get(spreadsheetId) === initialization) {
        this.registryInitialization.delete(spreadsheetId);
      }
      throw error;
    }
  }

  private async initializeRegistry(
    spreadsheetId: string,
    operation: GoogleOperation,
  ): Promise<void> {
    let metadata = await this.request<SpreadsheetMetadata>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
      {},
      operation,
    );
    const existingSheets = new Map(
      metadata.sheets?.flatMap((sheet) => {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        return title && typeof sheetId === "number" ? [[title, sheetId] as const] : [];
      }),
    );
    const missingSheets = REGISTRY_SHEETS.filter((sheet) => !existingSheets.has(sheet.name));

    if (missingSheets.length > 0) {
      await this.request(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          method: "POST",
          body: JSON.stringify({
            requests: missingSheets.map((sheet) => ({
              addSheet: { properties: { title: sheet.name } },
            })),
          }),
        },
        operation,
      );
      metadata = await this.request<SpreadsheetMetadata>(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
        {},
        operation,
      );
    }

    const currentSheets = new Map(
      metadata.sheets?.flatMap((sheet) => {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        return title && typeof sheetId === "number" ? [[title, sheetId] as const] : [];
      }),
    );

    for (const sheet of REGISTRY_SHEETS) {
      const values = await this.getValues(spreadsheetId, `${sheet.name}!1:1`, operation);
      const header = values[0] ?? [];
      const legacyMigration = getLegacyRegistryMigration(sheet.name, header);
      if (legacyMigration) {
        const allValues = await this.getValues(spreadsheetId, sheet.name, operation);
        const migratedRows = allValues.slice(1)
          .filter((row) => row.some((value) => value !== ""))
          .map(legacyMigration.transformRow);
        if (migratedRows.length > 0) {
          await this.updateValues(spreadsheetId, `${sheet.name}!A2`, migratedRows, legacyMigration.operation);
        }
        await this.updateValues(spreadsheetId, `${sheet.name}!A1`, [sheet.headers], legacyMigration.operation);
        continue;
      }
      if (sheet.name === "Families" && header.includes("spreadsheet_id")) {
        const sheetId = currentSheets.get(sheet.name);
        if (sheetId !== undefined) {
          await this.request(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
            {
              method: "POST",
              body: JSON.stringify({
                requests: [{
                  deleteDimension: {
                    range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 },
                  },
                }],
              }),
            },
            "migrateFamiliesSchema",
          );
        }
      }
      if (header.length === 0 || header.includes("spreadsheet_id")) {
        await this.updateValues(spreadsheetId, `${sheet.name}!A1`, [sheet.headers], operation);
      }
    }
  }

  async getValues(
    spreadsheetId: string,
    range: string,
    operation?: GoogleOperation,
  ): Promise<string[][]> {
    const cacheKey = `${spreadsheetId}:${range}`;
    const cached = this.valuesCache.get(cacheKey);
    if (cached?.pending) return cloneValues(await cached.pending);
    if (cached && cached.expiresAt > Date.now()) return cloneValues(cached.values);

    const pending = this.request<{ values?: string[][] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      {},
      operation,
    ).then((data) => data.values ?? []);
    this.valuesCache.set(cacheKey, { values: [], expiresAt: 0, pending });
    try {
      const values = await pending;
      this.valuesCache.set(cacheKey, { values, expiresAt: Date.now() + GOOGLE_VALUES_CACHE_MS });
      return cloneValues(values);
    } catch (error) {
      if (this.valuesCache.get(cacheKey)?.pending === pending) this.valuesCache.delete(cacheKey);
      throw error;
    }
  }

  async appendRows(
    spreadsheetId: string,
    sheetName: string,
    values: string[][],
    operation?: GoogleOperation,
  ): Promise<void> {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values }) },
      operation,
    );
    this.invalidateValuesCache(spreadsheetId);
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly string[])[],
    operation?: GoogleOperation,
  ): Promise<void> {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values }) },
      operation,
    );
    this.invalidateValuesCache(spreadsheetId);
  }

  private invalidateValuesCache(spreadsheetId: string): void {
    for (const key of this.valuesCache.keys()) {
      if (key.startsWith(`${spreadsheetId}:`)) this.valuesCache.delete(key);
    }
  }

  private async request<T = Record<string, never>>(
    url: string,
    init: RequestInit = {},
    operation?: GoogleOperation,
  ): Promise<T> {
    const requestStartedAt = performance.now();
    const token = await this.getAccessToken(operation);
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (error) {
      logDuration("google.request", performance.now() - requestStartedAt, {
        operation,
        method: init.method ?? "GET",
        outcome: "network_error",
      });
      logGoogleFailure(operation, url, init.method, undefined, error);
      throw new GoogleApiError("Google API request failed.");
    }
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      logDuration("google.request", performance.now() - requestStartedAt, {
        operation,
        method: init.method ?? "GET",
        status: response.status,
        outcome: response.status === 429 ? "quota_exceeded" : "error",
        ...(response.status === 429 ? { quota: "google_sheets" } : {}),
      });
      logGoogleFailure(operation, url, init.method, response.status, errorBody);
      throw new GoogleApiError("Google API returned an error response.");
    }
    const data = (await response.json()) as T;
    logDuration("google.request", performance.now() - requestStartedAt, {
      operation,
      method: init.method ?? "GET",
      status: response.status,
      outcome: "success",
    });
    return data;
  }

  private async getAccessToken(operation?: GoogleOperation): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll("\\n", "\n");
    if (!email || !privateKey) {
      logGoogleFailure(
        operation,
        "https://oauth2.googleapis.com/token",
        "POST",
        undefined,
        new Error("Google service account is not configured."),
      );
      throw new GoogleConfigurationError("Google service account is not configured.");
    }

    let assertion: string;
    try {
      assertion = await createServiceAccountAssertion(email, privateKey);
    } catch (error) {
      logGoogleFailure(operation, "https://oauth2.googleapis.com/token", "POST", undefined, error);
      throw new GoogleConfigurationError("Google service account private key is invalid.");
    }
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      });
    } catch (error) {
      logGoogleFailure(operation, "https://oauth2.googleapis.com/token", "POST", undefined, error);
      throw new GoogleApiError("Google authentication request failed.");
    }
    const data = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;
    if (!response.ok || !data?.access_token || !data.expires_in) {
      logGoogleFailure(operation, "https://oauth2.googleapis.com/token", "POST", response.status, data);
      throw new GoogleApiError("Google authentication failed.");
    }
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }
}

type CachedValues = {
  values: string[][];
  expiresAt: number;
  pending?: Promise<string[][]>;
};

function cloneValues(values: string[][]): string[][] {
  return values.map((row) => [...row]);
}

export type GoogleOperation =
  | "ensureRegistry"
  | "readFamilies"
  | "readMembers"
  | "readInvitations"
  | "readPendingFamilyCreations"
  | "readPendingTransactionDrafts"
  | "createFamily"
  | "updateFamilyName"
  | "updateFamilyStatus"
  | "readPendingConfirmations"
  | "readTransactions"
  | "createPendingConfirmation"
  | "updatePendingConfirmation"
  | "createAuditLog"
  | "createTransaction"
  | "updateTransaction"
  | "createMember"
  | "updateMemberRole"
  | "updateMemberStatus"
  | "createInvitation"
  | "revokeInvitation"
  | "createPendingFamilyCreation"
  | "markInvitationUsed"
  | "completePendingFamilyCreation"
  | "createPendingTransactionDraft"
  | "updatePendingTransactionDraft"
  | "claimTelegramUpdate"
  | "completeTelegramUpdate"
  | "claimReceiptVision"
  | "completeReceiptVision"
  | "claimTextUsage"
  | "completeTextUsage"
  | "claimDraftApproval"
  | "completeDraftApproval"
  | "readDraftApprovalClaims"
  | "readRegistryIntegrity"
  | "migrateInvitationsSchema"
  | "migratePendingFamilyCreationsSchema"
  | "migrateFamiliesSchema"
  | "migrateTransactionsSchema";

function logGoogleFailure(
  operation: GoogleOperation | undefined,
  url: string,
  method: string | undefined,
  status: number | undefined,
  error: unknown,
): void {
  if (!operation) return;

  const details = getSafeGoogleErrorDetails(error);
  console.error("[Google] request failed", {
    operation,
    method: method ?? "GET",
    path: redactGooglePath(url),
    status,
    ...details,
  });
}

function getSafeGoogleErrorDetails(error: unknown): Record<string, string | number | undefined> {
  if (error instanceof Error) {
    return { message: redactLogText(error.message) };
  }
  if (typeof error !== "object" || error === null || !("error" in error)) {
    return {};
  }

  const oauthError = error.error;
  if (typeof oauthError === "string") {
    const description = "error_description" in error && typeof error.error_description === "string"
      ? error.error_description
      : undefined;
    return {
      reason: redactLogText(oauthError),
      ...(description ? { message: redactLogText(description) } : {}),
    };
  }

  const googleError = oauthError;
  if (typeof googleError !== "object" || googleError === null) return {};

  const details = googleError as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  return {
    code: typeof details.code === "number" ? details.code : undefined,
    reason: typeof details.errors?.[0]?.reason === "string" ? details.errors[0].reason : undefined,
    statusText: typeof details.status === "string" ? details.status : undefined,
    message: typeof details.message === "string" ? redactLogText(details.message) : undefined,
  };
}

function redactGooglePath(url: string): string {
  const path = new URL(url).pathname;
  return path.replace(/(\/spreadsheets\/)[^/]+/, "$1[redacted]");
}

function redactLogText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "[redacted-id]");
}

async function createServiceAccountAssertion(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: email,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

function base64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

type LegacyRegistryMigration = {
  operation: GoogleOperation;
  transformRow: (row: string[]) => string[];
};

function getLegacyRegistryMigration(
  sheetName: string,
  header: readonly string[],
): LegacyRegistryMigration | null {
  if (sheetName === "Invitations" && sameHeader(header, [
    "invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "status", "used_by", "used_at",
  ])) {
    return {
      operation: "migrateInvitationsSchema",
      transformRow: (row) => isInvitationStatus(row[8])
        ? row.slice(0, 9)
        : [row[0] ?? "", row[1] ?? "", row[2] ?? "", row[3] ?? "", row[4] ?? "", row[5] ?? "", row[8] ?? "", row[7] ?? "", row[6] ?? ""],
    };
  }
  if (sheetName === "Pending Family Creations" && sameHeader(header, [
    "telegram_user_id", "created_at", "expires_at", "status",
  ])) {
    return {
      operation: "migratePendingFamilyCreationsSchema",
      transformRow: (row) => isPendingFamilyCreationStatus(row[4])
        ? row.slice(0, 5)
        : [row[0] ?? "", "", row[1] ?? "", row[2] ?? "", row[3] ?? ""],
    };
  }
  if (sheetName === "Transactions" && sameHeader(header, [
    "transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status",
  ])) {
    return {
      operation: "migrateTransactionsSchema",
      transformRow: (row) => [...row.slice(0, 10), "UNCATEGORIZED"],
    };
  }
  return null;
}

function isInvitationStatus(value: string | undefined): boolean {
  return value === "PENDING" || value === "USED" || value === "EXPIRED" || value === "REVOKED";
}

function isPendingFamilyCreationStatus(value: string | undefined): boolean {
  return value === "PENDING" || value === "COMPLETED";
}

function sameHeader(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export const REGISTRY_SHEETS = [
  { name: "Settings", headers: ["key", "value"] },
  { name: "Families", headers: ["family_id", "family_name", "status", "created_at", "created_by", "plan"] },
  { name: "Members", headers: ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"] },
  { name: "Invitations", headers: ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "used_at", "used_by", "status"] },
  { name: "Pending Family Creations", headers: ["telegram_user_id", "family_name", "created_at", "expires_at", "status"] },
  { name: "Pending Confirmations", headers: ["confirmation_id", "telegram_user_id", "family_id", "action", "target", "created_at", "expires_at", "status"] },
  { name: "Pending Transaction Drafts", headers: ["draft_id", "telegram_user_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "confidence", "created_at", "expires_at", "status"] },
  { name: "Audit Log", headers: ["audit_id", "family_id", "actor_member_id", "actor_role", "action", "target_type", "target_id", "previous_value", "new_value", "created_at"] },
  { name: "Transactions", headers: ["transaction_id", "family_id", "transaction_type", "amount_minor", "currency", "transaction_date", "description", "created_by_member_id", "created_at", "status", "category"] },
  { name: "Processed Telegram Updates", headers: ["update_id", "claimed_at", "completed_at", "status"] },
  { name: "AI Vision Usage", headers: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"] },
  { name: "AI Text Usage", headers: ["usage_key", "family_id", "telegram_user_id", "window_started_at", "request_count", "last_claimed_at", "lease_until", "status"] },
  { name: "Draft Approval Claims", headers: ["draft_id", "telegram_user_id", "family_id", "transaction_id", "claimed_at", "completed_at", "lease_until", "status"] },
] as const;

interface SpreadsheetMetadata {
  sheets?: Array<{
    properties?: {
      title?: string;
      sheetId?: number;
    };
  }>;
}

export const FAMILY_MEMBER_HEADERS = REGISTRY_SHEETS[2].headers;
