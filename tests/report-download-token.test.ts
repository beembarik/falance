import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORT_DOWNLOAD_TOKEN_TTL_SECONDS,
  createReportDownloadToken,
  verifyReportDownloadToken,
} from "../src/lib/telegram/report-download-token";

const secret = "report-token-secret-for-tests";

test("creates and verifies a short-lived encrypted report token", () => {
  const token = createReportDownloadToken({
    uid: "100",
    format: "pdf",
    month: "2026-08",
    password: "rahasia-pdf",
  }, secret, 1_700_000_000);
  assert.equal(token.includes("rahasia-pdf"), false);
  const verified = verifyReportDownloadToken(token, secret, 1_700_000_000);
  assert.ok(verified);
  assert.equal(verified.uid, "100");
  assert.equal(verified.format, "pdf");
  assert.equal(verified.month, "2026-08");
  assert.equal(verified.password, "rahasia-pdf");
  assert.equal(verified.exp, 1_700_000_000 + REPORT_DOWNLOAD_TOKEN_TTL_SECONDS);
  assert.equal(typeof verified.nonce, "string");
});

test("rejects a tampered or expired report token", () => {
  const token = createReportDownloadToken({ uid: "100", format: "csv", month: "2026-08" }, secret, 1_700_000_000);
  assert.equal(verifyReportDownloadToken(`${token}tampered`, secret, 1_700_000_000), null);
  assert.equal(verifyReportDownloadToken(token, secret, 1_700_000_001 + REPORT_DOWNLOAD_TOKEN_TTL_SECONDS), null);
  assert.equal(verifyReportDownloadToken(token, "wrong-secret", 1_700_000_000), null);
});
