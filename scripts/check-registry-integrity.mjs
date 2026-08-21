import { inspectRegistryIntegrity } from "../src/lib/google/registry-integrity.ts";

const report = await inspectRegistryIntegrity();
console.log(JSON.stringify(report, null, 2));
if (!report.healthy) process.exitCode = 2;
