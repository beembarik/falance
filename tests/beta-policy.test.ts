import assert from "node:assert/strict";
import test from "node:test";

import { isBetaFeatureEnabled, isPublicBetaEnabled } from "../src/lib/beta/policy";

const FEATURE_ENV_NAMES = [
  "FALANCE_BETA_VISION_ENABLED",
  "FALANCE_BETA_PRINT_ENABLED",
  "FALANCE_BETA_PDF_ENABLED",
] as const;

function withEnvironment(values: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("features remain enabled by default outside beta", () => {
  withEnvironment({
    FALANCE_PUBLIC_BETA: undefined,
    FALANCE_BETA_VISION_ENABLED: undefined,
    FALANCE_BETA_PRINT_ENABLED: undefined,
    FALANCE_BETA_PDF_ENABLED: undefined,
  }, () => {
    assert.equal(isPublicBetaEnabled(), false);
    assert.equal(isBetaFeatureEnabled("vision"), true);
    assert.equal(isBetaFeatureEnabled("print"), true);
    assert.equal(isBetaFeatureEnabled("pdf"), true);
  });
});

test("beta defaults Vision, Print, and PDF to disabled", () => {
  withEnvironment({
    FALANCE_PUBLIC_BETA: "true",
    FALANCE_BETA_VISION_ENABLED: undefined,
    FALANCE_BETA_PRINT_ENABLED: undefined,
    FALANCE_BETA_PDF_ENABLED: undefined,
  }, () => {
    assert.equal(isPublicBetaEnabled(), true);
    for (const feature of ["vision", "print", "pdf"] as const) {
      assert.equal(isBetaFeatureEnabled(feature), false);
    }
  });
});

test("the legacy Vision beta flag remains supported", () => {
  withEnvironment({
    FALANCE_PUBLIC_BETA: "true",
    FALANCE_BETA_VISION_ENABLED: undefined,
    PUBLIC_BETA_VISION_ENABLED: "false",
  }, () => {
    assert.equal(isBetaFeatureEnabled("vision"), false);
  });
});

test("explicit feature flags override the beta default", () => {
  withEnvironment({
    FALANCE_PUBLIC_BETA: "true",
    FALANCE_BETA_VISION_ENABLED: "true",
    FALANCE_BETA_PRINT_ENABLED: "false",
    FALANCE_BETA_PDF_ENABLED: "on",
  }, () => {
    assert.equal(isBetaFeatureEnabled("vision"), true);
    assert.equal(isBetaFeatureEnabled("print"), false);
    assert.equal(isBetaFeatureEnabled("pdf"), true);
  });
});

test("invalid values fall back to the Public Beta default", () => {
  withEnvironment({
    FALANCE_PUBLIC_BETA: "true",
    FALANCE_BETA_VISION_ENABLED: "maybe",
    FALANCE_BETA_PRINT_ENABLED: "",
    FALANCE_BETA_PDF_ENABLED: "unknown",
  }, () => {
    for (const name of FEATURE_ENV_NAMES) assert.ok(name.startsWith("FALANCE_BETA_"));
    assert.equal(isBetaFeatureEnabled("vision"), false);
    assert.equal(isBetaFeatureEnabled("print"), false);
    assert.equal(isBetaFeatureEnabled("pdf"), false);
  });
});
