import { ConfirmationError, FamilyService, FamilyServiceError, TransactionError, UnauthorizedError } from "../../../../../lib/family/service";
import { GoogleSheetsFamilyRepository } from "../../../../../lib/family/google-sheets-repository";
import { MiniAppAuthError, validateMiniAppInitData } from "../../../../../lib/telegram/mini-app-auth";
import { readMiniAppTransactionRequest, stringValue } from "../../../../../lib/telegram/mini-app-transaction-request";

export const runtime = "nodejs";

type VoidAction = "REQUEST" | "CONFIRM" | "CANCEL";

export async function POST(request: Request): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = await readMiniAppTransactionRequest(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.initData !== "string" || !payload.initData.trim()) {
    return Response.json({ error: "Mini App authorization is required." }, { status: 400 });
  }
  const action = stringValue(payload.action)?.toUpperCase() as VoidAction | undefined;
  if (action !== "REQUEST" && action !== "CONFIRM" && action !== "CANCEL") {
    return Response.json({ error: "Void action tidak valid." }, { status: 400 });
  }
  const transactionId = stringValue(payload.transactionId);
  if (action === "REQUEST" && !transactionId) {
    return Response.json({ error: "Transaction ID wajib diisi." }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[MiniApp] Telegram bot token is not configured");
    return Response.json({ error: "Service unavailable." }, { status: 503 });
  }

  try {
    const validated = validateMiniAppInitData(payload.initData, botToken);
    const service = new FamilyService(new GoogleSheetsFamilyRepository());
    if (action === "REQUEST") {
      const pending = await service.requestTransactionVoid(validated.telegramUser, transactionId!);
      return Response.json({
        message: "Konfirmasi void transaksi diperlukan.",
        confirmation: { action: pending.action, expiresAt: pending.expiresAt },
      });
    }
    if (action === "CANCEL") {
      await service.cancelPendingConfirmation(validated.telegramUser, "VOID_TRANSACTION");
      return Response.json({ message: "Void transaksi dibatalkan." });
    }

    const result = await service.confirmPendingAction(validated.telegramUser, "VOID_TRANSACTION");
    if (result.action !== "VOID_TRANSACTION") {
      return Response.json({ error: "Konfirmasi yang aktif bukan untuk void transaksi." }, { status: 409 });
    }
    return Response.json({ message: "Transaksi berhasil di-void.", action: result.action });
  } catch (error) {
    if (error instanceof MiniAppAuthError) {
      return Response.json({ error: "Mini App authorization is invalid or expired." }, { status: 401 });
    }
    if (error instanceof ConfirmationError) {
      return Response.json({ error: "Konfirmasi void tidak tersedia atau sudah kedaluwarsa." }, { status: 409 });
    }
    if (error instanceof TransactionError) {
      return Response.json({ error: "Transaksi tidak dapat di-void." }, { status: 400 });
    }
    if (error instanceof UnauthorizedError || error instanceof FamilyServiceError) {
      return Response.json({ error: "Mini App access denied." }, { status: 403 });
    }
    console.error("[MiniApp] transaction void failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Unable to void transaction." }, { status: 500 });
  }
}
