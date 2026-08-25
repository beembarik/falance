import { readFile } from "node:fs/promises";
import { applySupabaseImport } from "../src/lib/migration/supabase-import-executor.ts";

const inputPath = argument("--input");
const target = argument("--target");
const allowNetwork = process.argv.includes("--allow-network");

if (!inputPath || !allowNetwork || (target !== "preview" && target !== "production")) {
  console.error("Usage: npm run apply:supabase-import -- --input <local-import-plan.json> --target <preview|production> --allow-network");
  process.exitCode = 2;
} else if (target === "production" && process.env.FALANCE_SUPABASE_IMPORT_PRODUCTION_CONFIRM !== "I_CONFIRM_MAINTENANCE_WINDOW") {
  console.error("Production import requires FALANCE_SUPABASE_IMPORT_PRODUCTION_CONFIRM=I_CONFIRM_MAINTENANCE_WINDOW.");
  process.exitCode = 2;
} else {
  const url = process.env.FALANCE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.FALANCE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    console.error("Supabase import requires server-only URL and service-role configuration.");
    process.exitCode = 2;
  } else {
    try {
      new URL(url);
      const plan = JSON.parse(await readFile(inputPath, "utf8"));
      const report = await applySupabaseImport(plan, {
        upsert: (table, rows, onConflict) => upsert(url, serviceRoleKey, table, rows, onConflict),
      });
      console.log(JSON.stringify({ target, ...report }, null, 2));
    } catch {
      console.error("Supabase import failed; inspect the protected operator environment and migration report.");
      process.exitCode = 1;
    }
  }
}

async function upsert(baseUrl, apiKey, table, rows, onConflict) {
  const query = new URLSearchParams({ on_conflict: onConflict });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) await response.body?.cancel();
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 599 };
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
