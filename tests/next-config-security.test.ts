import assert from "node:assert/strict";
import test from "node:test";

import nextConfig, { SECURITY_HEADERS } from "../next.config";

test("defines baseline security headers for every response", () => {
  const headers = new Map(SECURITY_HEADERS.map((header) => [header.key, header.value]));
  assert.equal(headers.get("Content-Security-Policy")?.includes("frame-ancestors https://web.telegram.org"), true);
  assert.equal(headers.get("Content-Security-Policy")?.includes("https://webk.telegram.org"), true);
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.has("X-Frame-Options"), false);
  assert.equal(headers.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(headers.get("Strict-Transport-Security"), "max-age=63072000; includeSubDomains");
});

test("marks API responses as non-cacheable", async () => {
  assert.ok(nextConfig.headers);
  const rules = await nextConfig.headers();
  const apiRule = rules.find((rule) => rule.source === "/api/:path*");
  assert.deepEqual(apiRule?.headers, [{ key: "Cache-Control", value: "no-store, max-age=0" }]);
});
