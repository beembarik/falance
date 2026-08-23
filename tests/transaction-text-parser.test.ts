import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAICompatibleTransactionTextParser,
  TransactionTextParserUnavailableError,
} from "../src/lib/ai/transaction-text-parser";
import { getBusinessDate } from "../src/lib/time/business-date";

const originalFetch = globalThis.fetch;
const originalBase = process.env.FALANCE_AI_API_BASE;
const originalKey = process.env.FALANCE_AI_API_KEY;
const originalModel = process.env.FALANCE_AI_MODEL;
const originalTextBase = process.env.FALANCE_AI_TEXT_API_BASE;
const originalTextKey = process.env.FALANCE_AI_TEXT_API_KEY;
const originalTextModel = process.env.FALANCE_AI_TEXT_MODEL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("FALANCE_AI_API_BASE", originalBase);
  restoreEnv("FALANCE_AI_API_KEY", originalKey);
  restoreEnv("FALANCE_AI_MODEL", originalModel);
  restoreEnv("FALANCE_AI_TEXT_API_BASE", originalTextBase);
  restoreEnv("FALANCE_AI_TEXT_API_KEY", originalTextKey);
  restoreEnv("FALANCE_AI_TEXT_MODEL", originalTextModel);
});

test("uses JSON Object Mode for Groq Compound models", async () => {
  process.env.FALANCE_AI_API_BASE = "https://api.groq.com/openai/v1";
  process.env.FALANCE_AI_API_KEY = "test-key";
  process.env.FALANCE_AI_MODEL = "groq/compound-mini";
  const captured = { requestBody: null as Record<string, unknown> | null };
  globalThis.fetch = async (_input, init) => {
    captured.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        transaction_type: "EXPENSE",
        amount_minor: 35000,
        currency: "IDR",
        transaction_date: "2026-08-19",
        description: "Beli susu",
        category_suggestion: null,
        description_suggestion: null,
        confidence: "HIGH",
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu 35 ribu", "2026-08-20");

  assert.equal(result.kind, "READY");
  assert.deepEqual(captured.requestBody?.response_format, { type: "json_object" });
});

test("prefers dedicated text provider configuration over shared legacy configuration", async () => {
  configureProvider();
  process.env.FALANCE_AI_TEXT_API_BASE = "https://text.example.test/v1";
  process.env.FALANCE_AI_TEXT_API_KEY = "text-key";
  process.env.FALANCE_AI_TEXT_MODEL = "text-model";
  let requestUrl = "";
  const captured = { requestBody: null as Record<string, unknown> | null };
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    captured.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        transaction_type: "EXPENSE",
        amount_minor: 35000,
        currency: "IDR",
        transaction_date: "2026-08-19",
        description: "Beli susu",
        category_suggestion: null,
        description_suggestion: null,
        confidence: "HIGH",
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu 35 ribu", "2026-08-20");

  assert.equal(result.kind, "READY");
  assert.equal(requestUrl, "https://text.example.test/v1/chat/completions");
  assert.equal(captured.requestBody?.model, "text-model");
});

test("normalizes a structured provider extraction into a ready transaction draft", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 35000,
    currency: "idr",
    transaction_date: "2026-08-19",
    description: "  Beli   susu  ",
    confidence: "HIGH",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu 35 ribu kemarin", "2026-08-20");

  assert.deepEqual(result, {
    kind: "READY",
    draft: {
      transactionType: "EXPENSE",
      amountMinor: 35000,
      currency: "IDR",
      transactionDate: "2026-08-19",
      description: "Beli susu",
      confidence: "HIGH",
    },
  });
});

test("defaults a missing date to the business date and marks it as inferred", async () => {
  configureProvider();
  const today = getBusinessDate();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 35000,
    currency: "IDR",
    transaction_date: null,
    description: "Beli susu",
    confidence: "HIGH",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu 35 ribu", today);

  assert.deepEqual(result, {
    kind: "READY",
    draft: {
      transactionType: "EXPENSE",
      amountMinor: 35000,
      currency: "IDR",
      transactionDate: today,
      description: "Beli susu",
      confidence: "HIGH",
      transactionDateInferred: true,
    },
  });
});

test("clarifies planned language instead of creating an actual transaction", async () => {
  configureProvider();
  const today = getBusinessDate();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 210000,
    currency: "IDR",
    transaction_date: null,
    description: "Bayar tagihan",
    confidence: "HIGH",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("rencana bayar tagihan 210 ribu", today);

  assert.equal(result.kind, "NEEDS_CLARIFICATION");
  assert.match(result.question, /Transaksi terencana belum dapat disimpan/);
});

test("normalizes category and description suggestions for draft review", async () => {
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

  const result = await new OpenAICompatibleTransactionTextParser().parse("makan siang 45 ribu", "2026-08-20");

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

test("ignores an unsupported category suggestion", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 45000,
    currency: "IDR",
    transaction_date: "2026-08-20",
    description: "Makan siang",
    category_suggestion: "Kategori Rahasia",
    description_suggestion: null,
    confidence: "HIGH",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("makan siang 45 ribu", "2026-08-20");

  assert.equal(result.kind, "READY");
  assert.equal(result.draft.categorySuggestion, undefined);
});

test("asks for clarification when the provider cannot extract all required fields", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: null,
    currency: "IDR",
    transaction_date: "2026-08-19",
    description: "Beli susu",
    confidence: "LOW",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu", "2026-08-20");

  assert.deepEqual(result, {
    kind: "NEEDS_CLARIFICATION",
    question: "Mohon lengkapi tipe transaksi, jumlah, mata uang, tanggal, dan deskripsi transaksi.",
  });
});

test("turns deterministic validation failures into clarification instead of persistence", async () => {
  configureProvider();
  mockProviderResponse({
    transaction_type: "INCOME",
    amount_minor: -1,
    currency: "IDR",
    transaction_date: "2026-08-19",
    description: "Gaji",
    confidence: "MEDIUM",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("gaji", "2026-08-20");

  assert.equal(result.kind, "NEEDS_CLARIFICATION");
  assert.match(result.question, /belum valid/);
});

test("rejects a future AI transaction date as clarification", async () => {
  configureProvider();
  const today = getBusinessDate();
  mockProviderResponse({
    transaction_type: "EXPENSE",
    amount_minor: 35000,
    currency: "IDR",
    transaction_date: nextDate(today),
    description: "Beli susu besok",
    confidence: "HIGH",
  });

  const result = await new OpenAICompatibleTransactionTextParser().parse("beli susu besok", today);

  assert.equal(result.kind, "NEEDS_CLARIFICATION");
  assert.match(result.question, /Tanggal transaksi tidak boleh lebih dari hari ini/);
});

test("rejects text provider content that is not JSON", async () => {
  configureProvider();
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "```json {\\\"transaction_type\\\":\\\"EXPENSE\\\"} ```" } }],
  }), { status: 200 });

  await assert.rejects(
    () => new OpenAICompatibleTransactionTextParser().parse("beli susu", "2026-08-20"),
    TransactionTextParserUnavailableError,
  );
});

test("rejects text provider content with an invalid extraction schema", async () => {
  configureProvider();
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      transaction_type: "EXPENSE",
      amount_minor: "35000",
      currency: "IDR",
      transaction_date: "2026-08-20",
      description: "Beli susu",
      confidence: "HIGH",
    }) } }],
  }), { status: 200 });

  await assert.rejects(
    () => new OpenAICompatibleTransactionTextParser().parse("beli susu", "2026-08-20"),
    TransactionTextParserUnavailableError,
  );
});

test("fails safely when the AI provider is not configured", async () => {
  delete process.env.FALANCE_AI_API_BASE;
  delete process.env.FALANCE_AI_API_KEY;

  await assert.rejects(
    () => new OpenAICompatibleTransactionTextParser().parse("beli susu", "2026-08-20"),
    TransactionTextParserUnavailableError,
  );
});

function configureProvider(): void {
  process.env.FALANCE_AI_API_BASE = "https://ai.example.test/v1";
  process.env.FALANCE_AI_API_KEY = "test-key";
  process.env.FALANCE_AI_MODEL = "test-model";
}

function mockProviderResponse(extraction: unknown): void {
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(extraction) } }],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
