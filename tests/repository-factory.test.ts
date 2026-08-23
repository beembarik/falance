import assert from "node:assert/strict";
import test from "node:test";

import { GoogleConfigurationError } from "../src/lib/google/sheets-client";
import { createFamilyRepository } from "../src/lib/family/repository-factory";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";
import { ShadowReadRepository } from "../src/lib/family/shadow-read-repository";

const originalBackend = process.env.FALANCE_PERSISTENCE_BACKEND;
const originalShadowReads = process.env.FALANCE_SHADOW_READS;
const originalShadowUrl = process.env.FALANCE_SHADOW_SUPABASE_URL;
const originalShadowKey = process.env.FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY;

test.afterEach(() => {
  if (originalBackend === undefined) delete process.env.FALANCE_PERSISTENCE_BACKEND;
  else process.env.FALANCE_PERSISTENCE_BACKEND = originalBackend;
  for (const [name, value] of [["FALANCE_SHADOW_READS", originalShadowReads], ["FALANCE_SHADOW_SUPABASE_URL", originalShadowUrl], ["FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY", originalShadowKey]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("repository factory keeps Google Sheets as the default backend", () => {
  delete process.env.FALANCE_PERSISTENCE_BACKEND;
  assert.ok(createFamilyRepository() instanceof GoogleSheetsFamilyRepository);
});

test("repository factory fails closed for an unsupported backend", () => {
  process.env.FALANCE_PERSISTENCE_BACKEND = "supabase";
  assert.throws(() => createFamilyRepository(), GoogleConfigurationError);
});

test("repository factory keeps primary Google Sheets when shadow configuration is incomplete", () => {
  process.env.FALANCE_SHADOW_READS = "true";
  delete process.env.FALANCE_SHADOW_SUPABASE_URL;
  delete process.env.FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(createFamilyRepository() instanceof GoogleSheetsFamilyRepository);
});

test("repository factory enables opt-in shadow reads without changing the backend", () => {
  process.env.FALANCE_SHADOW_READS = "true";
  process.env.FALANCE_SHADOW_SUPABASE_URL = "https://shadow-test.supabase.co";
  process.env.FALANCE_SHADOW_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  assert.ok(createFamilyRepository() instanceof ShadowReadRepository);
});
