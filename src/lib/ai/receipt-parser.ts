import type { CreateTransactionInput } from "../family/service";
import { TransactionError, validateTransactionInput } from "../family/service";
import {
  TRANSACTION_CATEGORY_SUGGESTIONS,
  type TransactionCategorySuggestion,
  type TransactionDraft,
  type TransactionTextParseResult,
} from "./transaction-text-parser";
import type { TelegramDownloadedImage } from "../telegram/client";

export class ReceiptParserUnavailableError extends Error {}

export interface ReceiptParser {
  parse(
    image: TelegramDownloadedImage,
    caption: string | null,
    today: string,
  ): Promise<TransactionTextParseResult>;
}

interface ReceiptExtraction {
  transaction_type: "INCOME" | "EXPENSE" | null;
  amount_minor: number | null;
  currency: string | null;
  transaction_date: string | null;
  description: string | null;
  category_suggestion?: TransactionCategorySuggestion | null;
  description_suggestion?: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

const RECEIPT_EXTRACTION_SCHEMA = {
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

export function createReceiptParser(): ReceiptParser {
  return new OpenAICompatibleReceiptParser();
}

export class OpenAICompatibleReceiptParser implements ReceiptParser {
  async parse(
    image: TelegramDownloadedImage,
    caption: string | null,
    today: string,
  ): Promise<TransactionTextParseResult> {
    const baseUrl = process.env.FALANCE_AI_API_BASE?.trim().replace(/\/+$/, "");
    const apiKey = process.env.FALANCE_AI_API_KEY?.trim();
    const model = process.env.FALANCE_AI_VISION_MODEL?.trim();
    if (!baseUrl || !apiKey || !model) {
      throw new ReceiptParserUnavailableError("Receipt parser is not configured.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
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
          max_completion_tokens: 700,
          messages: [
            {
              role: "system",
              content: [
                "You extract one household finance transaction from a receipt image and optional Indonesian caption.",
                "Return only the requested JSON object.",
                "Never infer family_id, member identity, permissions, or transaction status.",
                `Today is ${today}. Resolve a clearly printed relative date against this date; if the receipt date is missing or unreadable, return null.`,
                "Read the final payable total, not a subtotal, tax-only value, discount-only value, or item quantity.",
                "If the receipt is unreadable, ambiguous, or missing a required transaction field, return null for that field.",
                `category_suggestion must be null or one of: ${TRANSACTION_CATEGORY_SUGGESTIONS.join(", ")}.`,
                "description_suggestion is an optional concise Indonesian description; return null when the extracted description is already clear.",
                "amount_minor is a positive integer in the smallest currency unit; for IDR, use whole rupiah.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                { type: "text", text: caption?.trim() || "Ekstrak transaksi dari receipt ini." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${image.mimeType};base64,${bytesToBase64(image.data)}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "receipt_transaction_extraction",
              strict: true,
              schema: RECEIPT_EXTRACTION_SCHEMA,
            },
          },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ReceiptParserUnavailableError("Receipt parser request failed.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new ReceiptParserUnavailableError("Receipt parser returned an error.");
    const payload = await response.json().catch(() => null) as unknown;
    const content = getMessageContent(payload);
    if (!content) throw new ReceiptParserUnavailableError("Receipt parser returned no content.");

    let extraction: ReceiptExtraction;
    try {
      extraction = JSON.parse(content) as ReceiptExtraction;
    } catch {
      throw new ReceiptParserUnavailableError("Receipt parser returned invalid JSON.");
    }

    return normalizeReceiptExtraction(extraction, today);
  }
}

function normalizeReceiptExtraction(extraction: ReceiptExtraction, today: string): TransactionTextParseResult {
  if (
    extraction.transaction_type === null ||
    extraction.amount_minor === null ||
    extraction.currency === null ||
    extraction.description === null
  ) {
    return {
      kind: "NEEDS_CLARIFICATION",
      question: "Receipt belum cukup jelas. Pastikan total, tanggal, dan keterangan transaksi terlihat, lalu coba lagi.",
    };
  }

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
      return { kind: "NEEDS_CLARIFICATION", question: `Data receipt belum valid: ${error.message}` };
    }
    throw error;
  }

  const draft: TransactionDraft = {
    transactionType: input.transactionType,
    amountMinor: input.amountMinor,
    currency: (input.currency ?? "IDR").toUpperCase(),
    transactionDate: input.transactionDate,
    description: input.description.replace(/\s+/g, " ").trim(),
    confidence: extraction.confidence,
    ...(extraction.transaction_date === null ? { transactionDateInferred: true } : {}),
    ...(normalizeCategorySuggestion(extraction.category_suggestion)
      ? { categorySuggestion: normalizeCategorySuggestion(extraction.category_suggestion) } : {}),
    ...(normalizeSuggestion(extraction.description_suggestion)
      ? { descriptionSuggestion: normalizeSuggestion(extraction.description_suggestion) } : {}),
  };

  return { kind: "READY", draft };
}

function normalizeCategorySuggestion(value: string | null | undefined): TransactionCategorySuggestion | undefined {
  return TRANSACTION_CATEGORY_SUGGESTIONS.includes(value as TransactionCategorySuggestion)
    ? value as TransactionCategorySuggestion
    : undefined;
}

function normalizeSuggestion(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= 200 ? normalized : undefined;
}

function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
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
