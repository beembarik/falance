import { FamilyService, FamilyServiceError, TransactionError, UnauthorizedError } from "../../../../lib/family/service";
import { GoogleSheetsFamilyRepository } from "../../../../lib/family/google-sheets-repository";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../lib/telegram/mini-app-auth";
import { parseMiniAppTransactionInput, readMiniAppTransactionRequest, type MiniAppTransactionPayload } from "../../../../lib/telegram/mini-app-transaction-request";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let payload: MiniAppTransactionPayload;
  try {
    payload = await readMiniAppTransactionRequest(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }

  const input = parseMiniAppTransactionInput(payload);
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
        category: transaction.category,
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


export async function PATCH(request: Request): Promise<Response> {
  let payload: MiniAppTransactionPayload;
  try {
    payload = await readMiniAppTransactionRequest(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  const transactionId = typeof payload.transactionId === "string" ? payload.transactionId.trim() : "";
  if (!transactionId) return Response.json({ error: "Transaction ID wajib diisi." }, { status: 400 });

  const input = parseMiniAppTransactionInput(payload);
  if (input instanceof Error) return Response.json({ error: input.message }, { status: 400 });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    const transaction = await service.updateTransaction(validated.telegramUser, transactionId, input);
    return Response.json({
      message: "Transaksi berhasil diperbarui.",
      transaction: {
        transactionId: transaction.transactionId,
        transactionType: transaction.transactionType,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        category: transaction.category,
        status: transaction.status,
      },
    });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof TransactionError) {
      return Response.json({ error: "Transaksi tidak dapat diperbarui." }, { status: 400 });
    }
    if (error instanceof UnauthorizedError || error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] transaction update failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to update transaction." }, { status: 500 });
  }
}
