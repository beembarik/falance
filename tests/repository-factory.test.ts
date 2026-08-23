import assert from "node:assert/strict";
import test from "node:test";

import { GoogleConfigurationError } from "../src/lib/google/sheets-client";
import { createFamilyRepository } from "../src/lib/family/repository-factory";
import { GoogleSheetsFamilyRepository } from "../src/lib/family/google-sheets-repository";

const originalBackend = process.env.FALANCE_PERSISTENCE_BACKEND;

test.afterEach(() => {
  if (originalBackend === undefined) delete process.env.FALANCE_PERSISTENCE_BACKEND;
  else process.env.FALANCE_PERSISTENCE_BACKEND = originalBackend;
});

test("repository factory keeps Google Sheets as the default backend", () => {
  delete process.env.FALANCE_PERSISTENCE_BACKEND;
  assert.ok(createFamilyRepository() instanceof GoogleSheetsFamilyRepository);
});

test("repository factory fails closed for an unsupported backend", () => {
  process.env.FALANCE_PERSISTENCE_BACKEND = "supabase";
  assert.throws(() => createFamilyRepository(), GoogleConfigurationError);
});
