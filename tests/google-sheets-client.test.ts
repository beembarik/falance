import assert from "node:assert/strict";
import test from "node:test";

import { GoogleSheetsClient } from "../src/lib/google/sheets-client";

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
    await new GoogleSheetsClient().ensureRegistry("central-registry-id");
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
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
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
