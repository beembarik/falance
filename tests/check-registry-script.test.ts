import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

test("check:registry uses the TypeScript loader for local ESM imports", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const command = packageJson.scripts?.["check:registry"] ?? "";

  assert.match(command, /--import \.\/tests\/typescript-register\.mjs/);
  assert.match(command, /--experimental-strip-types/);
  assert.match(command, /scripts\/check-registry-integrity\.mjs/);
});

export {};

