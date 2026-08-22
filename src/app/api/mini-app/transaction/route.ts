import { FamilyService, FamilyServiceError, TransactionError, UnauthorizedError } from "../../../../lib/family/service";
import { GoogleSheetsFamilyRepository } from "../../../../lib/family/google-sheets-repository";
import type { CreateTransactionInput } from "../../../../lib/family/service";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { parseAmountMinor, TransactionCommandError } from "../../../../lib/telegram/transaction-command";
import type { TransactionType } from "../../../../lib/family/types";

export const runtime = "nodejs";

type MiniAppTransactionPayload = Record<string, unknown>;

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppTransactionPayload;
  try {
    payload = await readPayload(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }

  const input = parseTransactionInput(payload);
  if (input instanceof Error) return Response.json({ error: input.message }, { status: 400 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const transaction = await service.createTransaction(validated.telegramUser, input);
    return Response.json({
      message: "Transaksi berhasil dicatat.",
      transaction: {
        transactionId: transaction.transactionId,
        transactionType: transaction.transactionType,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        status: transaction.status,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof TransactionError) {
      return Response.json({ error: "Transaksi tidak dapat dicatat." }, { status: 400 });
    }
    if (error instanceof UnauthorizedError || error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] transaction creation failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to create transaction." }, { status: 500 });
  }
}

async function readPayload(request: Request): Promise<MiniAppTransactionPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  const body = await request.json() as unknown;
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("Invalid payload.");
  return body as MiniAppTransactionPayload;
}

function parseTransactionInput(payload: MiniAppTransactionPayload): CreateTransactionInput | Error {
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
  if (currencyValue && !/^[A-Za-z]{3}$/.test(currencyValue)) {
    return new TransactionCommandError("Currency harus berupa kode tiga huruf, misalnya IDR.");
  }

  return {
    transactionType: transactionType as TransactionType,
    amountMinor,
    currency: currencyValue?.toUpperCase(),
    transactionDate,
    description,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
