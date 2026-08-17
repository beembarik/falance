const GOOGLE_SHEETS_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive";

export class GoogleConfigurationError extends Error {}
export class GoogleApiError extends Error {}

export class GoogleSheetsClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  async createFamilySpreadsheet(familyName: string, familyId: string): Promise<string> {
    const response = await this.request<{ spreadsheetId?: string }>(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        body: JSON.stringify({
          properties: { title: `Falancé — ${familyName}` },
          sheets: FAMILY_SHEETS.map((sheet) => ({
            properties: { title: sheet.name },
            data: [
              {
                rowData: [
                  {
                    values: sheet.headers.map((header) => ({
                      userEnteredValue: { stringValue: header },
                    })),
                  },
                ],
              },
            ],
          })),
        }),
      },
      "createSpreadsheet",
    );

    if (!response.spreadsheetId) {
      throw new GoogleApiError("Spreadsheet creation did not return an ID.");
    }

    await this.appendRows(
      response.spreadsheetId,
      "Settings",
      [["family_id", familyId]],
      "initializeFamilySettings",
    );
    return response.spreadsheetId;
  }

  async ensureRegistry(spreadsheetId: string): Promise<void> {
    const metadata = await this.request<{ sheets?: Array<{ properties?: { title?: string } }> }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
    );
    const existingSheets = new Set(
      metadata.sheets?.flatMap((sheet) => (sheet.properties?.title ? [sheet.properties.title] : [])),
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
      );
    }

    for (const sheet of REGISTRY_SHEETS) {
      const values = await this.getValues(spreadsheetId, `${sheet.name}!1:1`);
      if (values.length === 0) {
        await this.updateValues(spreadsheetId, `${sheet.name}!A1`, [sheet.headers]);
      }
    }
  }

  async getValues(spreadsheetId: string, range: string): Promise<string[][]> {
    const data = await this.request<{ values?: string[][] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    return data.values ?? [];
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
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly string[])[],
  ): Promise<void> {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values }) },
    );
  }

  private async request<T = Record<string, never>>(
    url: string,
    init: RequestInit = {},
    operation?: GoogleOperation,
  ): Promise<T> {
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
      logGoogleFailure(operation, url, init.method, undefined, error);
      throw new GoogleApiError("Google API request failed.");
    }
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      logGoogleFailure(operation, url, init.method, response.status, errorBody);
      throw new GoogleApiError("Google API returned an error response.");
    }
    return (await response.json()) as T;
  }

  private async getAccessToken(operation?: GoogleOperation): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replaceAll("\\n", "\n");
    if (!email || !privateKey) {
      throw new GoogleConfigurationError("Google service account is not configured.");
    }

    const assertion = await createServiceAccountAssertion(email, privateKey);
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

type GoogleOperation = "createSpreadsheet" | "initializeFamilySettings";

function logGoogleFailure(
  operation: GoogleOperation | undefined,
  url: string,
  method: string | undefined,
  status: number | undefined,
  error: unknown,
): void {
  if (!operation) return;

  const details = getSafeGoogleErrorDetails(error);
  console.error(`[Google] ${operation} failed`, {
    method: method ?? "GET",
    path: new URL(url).pathname,
    status,
    ...details,
  });
}

function getSafeGoogleErrorDetails(error: unknown): Record<string, string | number | undefined> {
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error !== "object" || error === null || !("error" in error)) {
    return {};
  }

  const googleError = error.error;
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
    message: typeof details.message === "string" ? details.message : undefined,
  };
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

const FAMILY_SHEETS = [
  { name: "Settings", headers: ["key", "value"] },
  { name: "Members", headers: ["member_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"] },
  { name: "Transactions", headers: ["transaction_id", "family_id", "created_by", "type", "amount", "currency", "category_id", "description", "transaction_date", "source", "created_at"] },
  { name: "Categories", headers: ["category_id", "family_id", "name", "type", "is_active"] },
  { name: "Monthly Summary", headers: ["summary_id", "family_id", "month", "income", "expense", "balance", "updated_at"] },
  { name: "AI Insights", headers: ["insight_id", "family_id", "period", "content", "created_at"] },
] as const;

const REGISTRY_SHEETS = [
  { name: "Families", headers: ["family_id", "family_name", "spreadsheet_id", "status", "created_at", "created_by", "plan"] },
  { name: "Members", headers: ["member_id", "family_id", "telegram_user_id", "name", "username", "role", "status", "joined_at"] },
  { name: "Invitations", headers: ["invitation_id", "family_id", "code", "created_by", "created_at", "expires_at", "status", "used_by", "used_at"] },
  { name: "Pending Family Creations", headers: ["telegram_user_id", "created_at", "expires_at", "status"] },
] as const;

export const FAMILY_MEMBER_HEADERS = FAMILY_SHEETS[1].headers;
