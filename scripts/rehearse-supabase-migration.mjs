import { readFile, writeFile } from "node:fs/promises";
import { rehearseSupabaseMigration } from "../src/lib/migration/supabase-rehearsal.ts";

const inputPath = argument("--input");
const outputPath = argument("--output");
if (!inputPath) {
  console.error("Usage: node --import ./tests/typescript-register.mjs --experimental-strip-types scripts/rehearse-supabase-migration.mjs --input <snapshot.json> [--output <report.json>]");
  process.exitCode = 2;
} else {
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  const report = rehearseSupabaseMigration(snapshot);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, serialized, "utf8");
  else console.log(serialized);
  if (!report.healthy) process.exitCode = 1;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
