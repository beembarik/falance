import assert from "node:assert/strict";
import test from "node:test";

import { ShadowReadRepository } from "../src/lib/family/shadow-read-repository";
import type { FamilyRepository } from "../src/lib/family/repository";
import type { Family } from "../src/lib/family/types";

const primaryFamily: Family = {
  familyId: "primary-family-id",
  familyName: "Primary Family",
  status: "ACTIVE",
  createdAt: "2026-08-23T00:00:00.000Z",
  createdBy: "primary-user-id",
  plan: "FREE",
};
const secondaryFamily: Family = { ...primaryFamily, familyName: "Secondary Family" };

function repository(readFamily: () => Promise<Family | null>, write?: () => Promise<void>): FamilyRepository {
  return {
    findFamilyById: readFamily,
    createFamily: write ?? (async () => undefined),
  } as unknown as FamilyRepository;
}

test("returns the primary read result without waiting for the shadow read", async () => {
  let shadowReadStarted = false;
  let releaseShadowRead!: () => void;
  const shadowRead = new Promise<Family | null>((resolve) => { releaseShadowRead = () => resolve(secondaryFamily); });
  const primary = repository(async () => primaryFamily);
  const secondary = repository(async () => { shadowReadStarted = true; return shadowRead; });
  const shadow = new ShadowReadRepository(primary, secondary);

  const result = await shadow.findFamilyById(primaryFamily.familyId);
  assert.deepEqual(result, primaryFamily);
  assert.equal(shadowReadStarted, true);
  releaseShadowRead();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("does not fail the primary read when the secondary read fails", async () => {
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const primary = repository(async () => primaryFamily);
    const secondary = repository(async () => { throw new Error("secret secondary failure"); });
    const shadow = new ShadowReadRepository(primary, secondary);

    assert.deepEqual(await shadow.findFamilyById(primaryFamily.familyId), primaryFamily);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(JSON.stringify(warnings), /primary-family-id|secret secondary failure/);
  } finally {
    console.warn = originalWarn;
  }
});

test("delegates writes only to the primary repository", async () => {
  let primaryWrites = 0;
  let secondaryWrites = 0;
  const primary = repository(async () => primaryFamily, async () => { primaryWrites += 1; });
  const secondary = repository(async () => secondaryFamily, async () => { secondaryWrites += 1; });
  const shadow = new ShadowReadRepository(primary, secondary);

  await shadow.createFamily(primaryFamily);
  assert.equal(primaryWrites, 1);
  assert.equal(secondaryWrites, 0);
});
