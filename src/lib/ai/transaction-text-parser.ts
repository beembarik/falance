import type { CreateTransactionInput } from "../family/service";
import type { TransactionType } from "../family/types";
import { TransactionError, validateTransactionInput } from "../family/service";

export type TransactionDraftConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface TransactionDraft {
  transactionType: TransactionType;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  description: string;
  confidence: TransactionDraftConfidence;
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
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
  },
  required: [
    "transaction_type",
    "amount_minor",
    "currency",
    "transaction_date",
    "description",
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
                "If a required field is absent or ambiguous, return null for that field.",
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
      throw new TransactionTextParserUnavailableError("AI transaction parser request failed.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new TransactionTextParserUnavailableError("AI transaction parser returned an error.");
    }

    const payload = await response.json().catch(() => null) as unknown;
    const content = getMessageContent(payload);
    if (!content) throw new TransactionTextParserUnavailableError("AI transaction parser returned no content.");

    let extraction: ProviderExtraction;
    try {
      extraction = JSON.parse(content) as ProviderExtraction;
    } catch {
      throw new TransactionTextParserUnavailableError("AI transaction parser returned invalid JSON.");
    }

    return normalizeExtraction(extraction);
  }
}

function normalizeExtraction(extraction: ProviderExtraction): TransactionTextParseResult {
  if (
    extraction.transaction_type === null ||
    extraction.amount_minor === null ||
    extraction.currency === null ||
    extraction.transaction_date === null ||
    extraction.description === null
  ) {
    return {
      kind: "NEEDS_CLARIFICATION",
      question: "Mohon lengkapi tipe transaksi, jumlah, mata uang, tanggal, dan deskripsi transaksi.",
    };
  }

  const input: CreateTransactionInput = {
    transactionType: extraction.transaction_type,
    amountMinor: extraction.amount_minor,
    currency: extraction.currency,
    transactionDate: extraction.transaction_date,
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
    },
  };
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
