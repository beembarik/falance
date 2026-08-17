import assert from "node:assert/strict";
import test from "node:test";

import { GoogleSheetsClient } from "../src/lib/google/sheets-client";

test("creates family spreadsheets in the configured Drive folder before Sheets initialization", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    folderId: process.env.GOOGLE_FALANCE_DRIVE_FOLDER_ID,
  };
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];

  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service-account@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = await createPrivateKeyPem();
  process.env.GOOGLE_FALANCE_DRIVE_FOLDER_ID = "falance-folder-id";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });

    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url === "https://www.googleapis.com/drive/v3/files?fields=id") {
      return jsonResponse({ id: "new-spreadsheet-id" });
    }
    if (url.includes("?fields=sheets.properties")) {
      return jsonResponse({ sheets: [{ properties: { sheetId: 0 } }] });
    }
    return jsonResponse({});
  };

  try {
    const spreadsheetId = await new GoogleSheetsClient().createFamilySpreadsheet(
      "Keluarga Beem",
      "fam_123",
    );

    assert.equal(spreadsheetId, "new-spreadsheet-id");
    const driveRequest = requests.find(
      (request) => request.url === "https://www.googleapis.com/drive/v3/files?fields=id",
    );
    assert.ok(driveRequest);
    assert.deepEqual(JSON.parse(String(driveRequest.init?.body)), {
      name: "Falancé — Keluarga Beem",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: ["falance-folder-id"],
    });
    assert.ok(requests.some((request) => request.url.includes(":batchUpdate")));
    assert.ok(requests.some((request) => request.url.includes("/values:batchUpdate")));
    assert.ok(requests.some((request) => request.url.includes("/values/Settings:append")));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_EMAIL", originalEnvironment.email);
    restoreEnvironment("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", originalEnvironment.privateKey);
    restoreEnvironment("GOOGLE_FALANCE_DRIVE_FOLDER_ID", originalEnvironment.folderId);
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
