import type { CreateTransactionInput } from "../family/service";
import { isSupportedCurrencyCode } from "../family/currency";
import { isTransactionCategory } from "../family/category-analytics";
import type { TransactionType } from "../family/types";
import { parseAmountMinor, TransactionCommandError } from "./transaction-command";

export type MiniAppTransactionPayload = Record<string, unknown>;

export async function readMiniAppTransactionRequest(request: Request): Promise<MiniAppTransactionPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  const body = await request.json() as unknown;
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("Invalid payload.");
  return body as MiniAppTransactionPayload;
}

export function parseMiniAppTransactionInput(payload: MiniAppTransactionPayload): CreateTransactionInput | Error {
  const transactionType = typeof payload.transactionType === "string" ? payload.transactionType.toUpperCase() : "";
  if (transactionType !== "INCOME" && transactionType !== "EXPENSE") {
    return new TransactionCommandError("Jenis transaksi harus INCOME atau EXPENSE.");
  }

  let amountMinor: number;
  try {
    if (typeof payload.amountMinor === "number") {
      if (!Number.isSafeInteger(payload.amountMinor)) throw new TransactionCommandError("Jumlah harus berupa bilangan bulat positif yang valid.");
      amountMinor = parseAmountMinor(String(payload.amountMinor));
    } else if (typeof payload.amountMinor === "string") {
      amountMinor = parseAmountMinor(payload.amountMinor);
    } else {
      throw new TransactionCommandError("Jumlah harus diisi.");
    }
  } catch (error) {
    return error instanceof Error ? error : new TransactionCommandError("Jumlah tidak valid.");
  }

  const transactionDate = stringValue(payload.transactionDate);
  const description = stringValue(payload.description);
  if (!transactionDate || !description) return new TransactionCommandError("Tanggal dan deskripsi wajib diisi.");

  const currencyValue = stringValue(payload.currency);
  if (currencyValue && !isSupportedCurrencyCode(currencyValue.toUpperCase())) {
    return new TransactionCommandError("Currency harus berupa kode ISO 4217 yang didukung, misalnya IDR.");
  }

  const hasCategoryField = Object.prototype.hasOwnProperty.call(payload, "category");
  const categoryValue = stringValue(payload.category);
  if (categoryValue && !isTransactionCategory(categoryValue.toUpperCase())) {
    return new TransactionCommandError("Kategori transaksi tidak didukung.");
  }

  return {
    transactionType: transactionType as TransactionType,
    amountMinor,
    currency: currencyValue?.toUpperCase(),
    transactionDate,
    description,
    ...(hasCategoryField ? { category: categoryValue?.toUpperCase() ?? "UNCATEGORIZED" } : {}),
  };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
