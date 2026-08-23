import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAICompatibleReceiptParser,
  ReceiptParserUnavailableError,
  type ReceiptParser,
} from "../src/lib/ai/receipt-parser";
import type { TelegramDownloadedImage } from "../src/lib/telegram/client";

const originalFetch = globalThis.fetch;
const originalBase = process.env.FALANCE_AI_API_BASE;
const originalKey = process.env.FALANCE_AI_API_KEY;
const originalVisionModel = process.env.FALANCE_AI_VISION_MODEL;
const originalVisionBase = process.env.FALANCE_AI_VISION_API_BASE;
const originalVisionKey = process.env.FALANCE_AI_VISION_API_KEY;
const originalTimingLogs = process.env.FALANCE_TIMING_LOGS;

const image: TelegramDownloadedImage = {
  data: new Uint8Array([1, 2, 3]),
  mimeType: "image/jpeg",
  filePath: "photos/receipt.jpg",
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("FALANCE_AI_API_BASE", originalBase);
  restoreEnv("FALANCE_AI_API_KEY", originalKey);
  restoreEnv("FALANCE_AI_VISION_MODEL", originalVisionModel);
  restoreEnv("FALANCE_AI_VISION_API_BASE", originalVisionBase);
  restoreEnv("FALANCE_AI_VISION_API_KEY", originalVisionKey);
  restoreEnv("FALANCE_TIMING_LOGS", originalTimingLogs);
});

test("prefers dedicated vision provider configuration over shared legacy configuration", async () => {
  configureProvider();
  process.env.FALANCE_AI_VISION_API_BASE = "https://vision.example.test/v1";
  process.env.FALANCE_AI_VISION_API_KEY = "vision-key";
  let requestUrl = "";
  const captured = { requestBody: null as Record<string, unknown> | null };
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    captured.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        transaction_type: "EXPENSE",
        amount_minor: 45000,
        currency: "IDR",
        transaction_date: "2026-08-20",
        description: "Makan siang",
        category_suggestion: null,
        description_suggestion: null,
        confidence: "HIGH",
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20");

  assert.equal(result.kind, "READY");
  assert.equal(requestUrl, "https://vision.example.test/v1/chat/completions");
  assert.equal(captured.requestBody?.model, "vision-test-model");
});

test("extracts a receipt into the shared transaction draft shape", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 45000,
    currency: "IDR",
    transaction_date: "2026-08-20",
    description: "Makan siang",
    category_suggestion: "Makanan & Minuman",
    description_suggestion: "Makan siang bersama keluarga",
    confidence: "HIGH",
  });

  const parser: ReceiptParser = new OpenAICompatibleReceiptParser();
  const result = await parser.parse(image, "Makan siang", "2026-08-20");

  assert.deepEqual(result, {
    kind: "READY",
    draft: {
      transactionType: "EXPENSE",
      amountMinor: 45000,
      currency: "IDR",
      transactionDate: "2026-08-20",
      description: "Makan siang",
      categorySuggestion: "Makanan & Minuman",
      descriptionSuggestion: "Makan siang bersama keluarga",
      confidence: "HIGH",
    },
  });
});

test("asks for clarification when a receipt is missing required fields", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: null,
    currency: "IDR",
    transaction_date: null,
    description: null,
    category_suggestion: null,
    description_suggestion: null,
    confidence: "LOW",
  });

  const result = await new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20");

  assert.deepEqual(result, {
    kind: "NEEDS_CLARIFICATION",
    question: "Receipt belum cukup jelas. Pastikan total, tanggal, dan keterangan transaksi terlihat, lalu coba lagi.",
  });
});

test("rejects receipt provider content with an invalid extraction schema", async () => {
  configureProvider();
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      transaction_type: "EXPENSE",
      amount_minor: "45000",
      currency: "IDR",
      transaction_date: "2026-08-20",
      description: "Makan siang",
      confidence: "HIGH",
    }) } }],
  }), { status: 200 });

  await assert.rejects(
    () => new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20"),
    ReceiptParserUnavailableError,
  );
});

test("fails safely when the receipt vision model is not configured", async () => {
  delete process.env.FALANCE_AI_VISION_MODEL;
  await assert.rejects(
    () => new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20"),
    /Receipt parser is not configured/,
  );
});

function configureProvider(): void {
  process.env.FALANCE_AI_API_BASE = "https://ai.example.test/v1";
  process.env.FALANCE_AI_API_KEY = "test-key";
  process.env.FALANCE_AI_VISION_MODEL = "vision-test-model";
}

function mockProviderResponse(extraction: unknown): void {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages?: Array<{ role: string; content: unknown }>;
    };
    assert.equal(body.messages?.[1]?.role, "user");
    assert.ok(Array.isArray(body.messages?.[1]?.content));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(extraction) } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}


test("classifies receipt vision HTTP 429 as rate limited", async () => {
  configureProvider();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "sensitive vision response" }), { status: 429 });

  const error = await captureFailure(() => new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20"));

  assert.equal(error.details.kind, "rate_limited");
  assert.equal(error.details.status, 429);
});

test("classifies an aborted receipt vision request as timeout", async () => {
  configureProvider();
  globalThis.fetch = async () => {
    throw Object.assign(new Error("vision timeout"), { name: "AbortError" });
  };

  const error = await captureFailure(() => new OpenAICompatibleReceiptParser().parse(image, null, "2026-08-20"));

  assert.equal(error.details.kind, "timeout");
});

async function captureFailure(action: () => Promise<unknown>): Promise<ReceiptParserUnavailableError> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof ReceiptParserUnavailableError);
    return error;
  }
  throw new Error("Expected parser failure");
}
