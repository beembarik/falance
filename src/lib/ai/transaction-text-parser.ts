import type { CreateTransactionInput } from "../family/service";
import type { TransactionType } from "../family/types";
import { TransactionError, validateTransactionInput } from "../family/service";
import { logDuration } from "../observability/timing";

export type TransactionDraftConfidence = "HIGH" | "MEDIUM" | "LOW";

export const TRANSACTION_CATEGORY_SUGGESTIONS = [
  "Makanan & Minuman",
  "Belanja",
  "Rumah Tangga",
  "Tagihan & Utilitas",
  "Transportasi",
  "Kesehatan",
  "Pendidikan",
  "Hiburan",
  "Gaji & Pendapatan",
  "Lainnya",
] as const;

export type TransactionCategorySuggestion = (typeof TRANSACTION_CATEGORY_SUGGESTIONS)[number];

export interface TransactionDraft {
  transactionType: TransactionType;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  description: string;
  confidence: TransactionDraftConfidence;
  transactionDateInferred?: boolean;
  categorySuggestion?: TransactionCategorySuggestion;
  descriptionSuggestion?: string;
}

export type TransactionTextParseResult =
  | { kind: "READY"; draft: TransactionDraft }
  | { kind: "NEEDS_CLARIFICATION"; question: string }
  | { kind: "UNSUPPORTED"; reason: string };

export interface TransactionTextParser {
  parse(text: string, today: string): Promise<TransactionTextParseResult>;
}

export class TransactionTextParserUnavailableError extends Error {}

interface ProviderExtraction {
  transaction_type: TransactionType | null;
  amount_minor: number | null;
  currency: string | null;
  transaction_date: string | null;
  description: string | null;
  category_suggestion?: TransactionCategorySuggestion | null;
  description_suggestion?: string | null;
  confidence: TransactionDraftConfidence;
}

const TRANSACTION_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    transaction_type: { anyOf: [{ type: "string", enum: ["INCOME", "EXPENSE"] }, { type: "null" }] },
    amount_minor: { anyOf: [{ type: "integer" }, { type: "null" }] },
    currency: { anyOf: [{ type: "string" }, { type: "null" }] },
    transaction_date: { anyOf: [{ type: "string" }, { type: "null" }] },
    description: { anyOf: [{ type: "string" }, { type: "null" }] },
    category_suggestion: { anyOf: [{ type: "string", enum: TRANSACTION_CATEGORY_SUGGESTIONS }, { type: "null" }] },
    description_suggestion: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  },
  required: [
    "transaction_type",
    "amount_minor",
    "currency",
    "transaction_date",
    "description",
    "category_suggestion",
    "description_suggestion",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export function createTransactionTextParser(): TransactionTextParser {
  return new OpenAICompatibleTransactionTextParser();
}

export class OpenAICompatibleTransactionTextParser implements TransactionTextParser {
  async parse(text: string, today: string): Promise<TransactionTextParseResult> {
    const baseUrl = process.env.FALANCE_AI_API_BASE?.trim().replace(/\/+$/, "");
    const apiKey = process.env.FALANCE_AI_API_KEY?.trim();
    const model = process.env.FALANCE_AI_MODEL?.trim() || "gpt-5-mini";
    if (!baseUrl || !apiKey) {
      throw new TransactionTextParserUnavailableError("AI transaction parser is not configured.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const providerStartedAt = performance.now();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_completion_tokens: 500,
          messages: [
            {
              role: "system",
              content: [
                "You extract one household finance transaction from Indonesian text.",
                "Return only the requested JSON object.",
                "Never infer family_id, member identity, permissions, or transaction status.",
                `Today is ${today}. Resolve relative dates against this date.`,
                "amount_minor is a positive integer in the smallest currency unit; for IDR, use whole rupiah.",
                `category_suggestion must be null or one of: ${TRANSACTION_CATEGORY_SUGGESTIONS.join(", ")}.`,
                "description_suggestion is an optional concise Indonesian description; return null when the original description is already clear.",
                "If a required field is absent or ambiguous, return null for that field; the server may use today only when the message is not a planned transaction.",
              ].join(" "),
            },
            { role: "user", content: text },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "transaction_extraction",
              strict: true,
              schema: TRANSACTION_EXTRACTION_SCHEMA,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      logDuration("ai.text.request", performance.now() - providerStartedAt, {
        provider: providerHost(baseUrl),
        outcome: "error",
      });
      throw new TransactionTextParserUnavailableError("AI transaction parser request failed.");
    } finally {
      clearTimeout(timeout);
    }

    logDuration("ai.text.request", performance.now() - providerStartedAt, {
      provider: providerHost(baseUrl),
      status: response.status,
      outcome: response.ok ? "success" : "error",
    });
    if (!response.ok) {
      throw new TransactionTextParserUnavailableError("AI transaction parser returned an error.");
    }

    const responseParsingStartedAt = performance.now();
    const payload = await response.json().catch(() => null) as unknown;
    const content = getMessageContent(payload);
    if (!content) {
      logDuration("ai.text.response", performance.now() - responseParsingStartedAt, {
        provider: providerHost(baseUrl),
        outcome: "no_content",
      });
      throw new TransactionTextParserUnavailableError("AI transaction parser returned no content.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      logDuration("ai.text.response", performance.now() - responseParsingStartedAt, {
        provider: providerHost(baseUrl),
        outcome: "invalid_json",
      });
      throw new TransactionTextParserUnavailableError("AI transaction parser returned invalid JSON.");
    }
    if (!isProviderExtraction(parsed)) {
      logDuration("ai.text.response", performance.now() - responseParsingStartedAt, {
        provider: providerHost(baseUrl),
        outcome: "schema_invalid",
      });
      throw new TransactionTextParserUnavailableError("AI transaction parser returned an invalid schema.");
    }

    const result = normalizeExtraction(parsed, text, today);
    logDuration("ai.text.response", performance.now() - responseParsingStartedAt, {
      provider: providerHost(baseUrl),
      outcome: result.kind.toLowerCase(),
    });
    return result;
  }
}

function normalizeExtraction(extraction: ProviderExtraction, sourceText: string, today: string): TransactionTextParseResult {
  if (looksLikePlannedTransaction(sourceText)) {
    return {
      kind: "NEEDS_CLARIFICATION",
      question: "Pesan ini terlihat seperti rencana atau transaksi yang akan datang. Transaksi terencana belum dapat disimpan sebagai transaksi aktual.",
    };
  }

  if (
    extraction.transaction_type === null ||
    extraction.amount_minor === null ||
    extraction.currency === null ||
    extraction.description === null
  ) {
    return {
      kind: "NEEDS_CLARIFICATION",
      question: "Mohon lengkapi tipe transaksi, jumlah, mata uang, tanggal, dan deskripsi transaksi.",
    };
  }

  const transactionDateInferred = extraction.transaction_date === null;
  const categorySuggestion = normalizeCategorySuggestion(extraction.category_suggestion);
  const descriptionSuggestion = normalizeSuggestion(extraction.description_suggestion, 200);
  const input: CreateTransactionInput = {
    transactionType: extraction.transaction_type,
    amountMinor: extraction.amount_minor,
    currency: extraction.currency,
    transactionDate: extraction.transaction_date ?? today,
    description: extraction.description,
  };

  try {
    validateTransactionInput(input);
  } catch (error) {
    if (error instanceof TransactionError) {
      return { kind: "NEEDS_CLARIFICATION", question: `Data transaksi belum valid: ${error.message}` };
    }
    throw error;
  }

  return {
    kind: "READY",
    draft: {
      transactionType: input.transactionType,
      amountMinor: input.amountMinor,
      currency: extraction.currency.toUpperCase(),
      transactionDate: input.transactionDate,
      description: input.description.replace(/\s+/g, " ").trim(),
      confidence: extraction.confidence,
      ...(transactionDateInferred ? { transactionDateInferred: true } : {}),
      ...(categorySuggestion ? { categorySuggestion } : {}),
      ...(descriptionSuggestion ? { descriptionSuggestion } : {}),
    },
  };
}

function normalizeCategorySuggestion(value: string | null | undefined): TransactionCategorySuggestion | undefined {
  return TRANSACTION_CATEGORY_SUGGESTIONS.includes(value as TransactionCategorySuggestion)
    ? value as TransactionCategorySuggestion
    : undefined;
}

function normalizeSuggestion(value: string | null | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function looksLikePlannedTransaction(sourceText: string): boolean {
  return /\b(rencana|akan|nanti|terjadwal|rutin|recurring)\b/i.test(sourceText);
}

function isProviderExtraction(value: unknown): value is ProviderExtraction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const transactionType = candidate.transaction_type;
  const amountMinor = candidate.amount_minor;
  const currency = candidate.currency;
  const transactionDate = candidate.transaction_date;
  const description = candidate.description;
  const confidence = candidate.confidence;
  const category = candidate.category_suggestion;
  const descriptionSuggestion = candidate.description_suggestion;
  return (transactionType === "INCOME" || transactionType === "EXPENSE" || transactionType === null)
    && (amountMinor === null || Number.isSafeInteger(amountMinor))
    && (currency === null || typeof currency === "string")
    && (transactionDate === null || typeof transactionDate === "string")
    && (description === null || typeof description === "string")
    && (confidence === "HIGH" || confidence === "MEDIUM" || confidence === "LOW")
    && (category === null || typeof category === "string" || category === undefined)
    && (descriptionSuggestion === null || typeof descriptionSuggestion === "string" || descriptionSuggestion === undefined);
}

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || "unknown";
  } catch {
    return "invalid";
  }
}

function getMessageContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("choices" in payload)) return null;
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) return null;
  const message = first.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;
  return typeof message.content === "string" ? message.content : null;
}
