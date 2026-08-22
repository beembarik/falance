import assert from "node:assert/strict";
import test from "node:test";

import { RequestBodyLimitError, readTextWithLimit } from "../src/lib/http/request-body";

test("reads a request body within the configured byte limit", async () => {
  const request = new Request("https://falance.example.com/api/test", {
    method: "POST",
    body: JSON.stringify({ update_id: 123 }),
  });
  assert.equal(await readTextWithLimit(request, 1_000), '{"update_id":123}');
});

test("rejects a request body above the configured byte limit", async () => {
  const request = new Request("https://falance.example.com/api/test", {
    method: "POST",
    body: "x".repeat(128),
  });
  await assert.rejects(
    () => readTextWithLimit(request, 64),
    (error: unknown) => error instanceof RequestBodyLimitError && error.maxBytes === 64,
  );
});

test("rejects a declared oversized body before reading it", async () => {
  const request = new Request("https://falance.example.com/api/test", {
    method: "POST",
    headers: { "content-length": "1000" },
    body: "small",
  });
  await assert.rejects(() => readTextWithLimit(request, 64), RequestBodyLimitError);
});
