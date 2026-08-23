import { readFile, writeFile } from "node:fs/promises";
import { createSupabaseImportPlan } from "../src/lib/migration/supabase-import-plan.ts";

const inputPath = argument("--input");
const outputPath = argument("--output");
const localOnly = process.argv.includes("--local-only");

if (!inputPath || !outputPath || !localOnly) {
  console.error("Usage: node --import ./tests/typescript-register.mjs --experimental-strip-types scripts/prepare-supabase-import.mjs --input <sanitized-snapshot.json> --output <local-import-plan.json> --local-only");
  process.exitCode = 2;
} else {
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  const plan = createSupabaseImportPlan(snapshot);
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ version: plan.version, sourceSheets: plan.sourceSheets, batchCounts: Object.fromEntries(plan.batches.map((batch) => [batch.table, batch.rows.length])) }, null, 2));
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
