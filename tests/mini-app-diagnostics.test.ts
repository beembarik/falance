import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { classifyMiniAppError, isMiniAppDiagnosticsEnabled, logMiniAppDiagnostic } from "../src/lib/mini-app/diagnostics.ts";

const originalDiagnosticsFlag = process.env.FALANCE_MINI_APP_DIAGNOSTICS;
const originalVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  if (originalDiagnosticsFlag === undefined) delete process.env.FALANCE_MINI_APP_DIAGNOSTICS;
  else process.env.FALANCE_MINI_APP_DIAGNOSTICS = originalDiagnosticsFlag;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

describe("mini app diagnostics", () => {
  it("is disabled unless explicitly enabled", () => {
    assert.equal(isMiniAppDiagnosticsEnabled({}), false);
    assert.equal(isMiniAppDiagnosticsEnabled({ FALANCE_MINI_APP_DIAGNOSTICS: "true" }), true);
  });

  it("is enabled on Vercel Preview and disabled on Production", () => {
    assert.equal(isMiniAppDiagnosticsEnabled({ VERCEL_ENV: "preview" }), true);
    assert.equal(isMiniAppDiagnosticsEnabled({ FALANCE_MINI_APP_DIAGNOSTICS: "true", VERCEL_ENV: "production" }), false);
  });

  it("classifies known persistence failures without returning raw messages", () => {
    assert.equal(classifyMiniAppError(new Error("Supabase read failed for families [unknown].")), "supabase_read_families");
    assert.equal(classifyMiniAppError(new Error("Supabase read failed for members [http_401].")), "supabase_read_members_http_401");
    assert.equal(classifyMiniAppError(new Error("a secret value must not appear")), "unknown_error");
  });

  it("logs only allowlisted diagnostic fields", () => {
    process.env.FALANCE_MINI_APP_DIAGNOSTICS = "true";
    delete process.env.VERCEL_ENV;
    const originalConsoleInfo = console.info;
    const calls: unknown[][] = [];
    console.info = (...args: unknown[]) => calls.push(args);

    try {
      logMiniAppDiagnostic("report", "failure", {
        status: 500,
        errorClass: "Error",
      });
    } finally {
      console.info = originalConsoleInfo;
    }

    assert.deepEqual(calls, [
      ["[MiniAppDiagnostic]", { operation: "report", state: "failure", status: 500, errorClass: "Error" }],
    ]);
  });
});
