import {
  answerTelegramCallbackQuery,
  TelegramApiError,
  TelegramConfigurationError,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { GoogleSheetsFamilyRepository } from "@/lib/family/google-sheets-repository";
import { FamilyService } from "@/lib/family/service";
import {
  handleTelegramCallbackQuery,
  handleTelegramPhotoMessageResponse,
  handleTelegramTextMessageResponse,
} from "@/lib/telegram/command-handler";
import { usesTelegramHtml } from "@/lib/telegram/html";
import type { TelegramPhotoSize } from "@/lib/telegram/client";
import { logDuration, measureDuration } from "@/lib/observability/timing";

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id?: string;
    data?: string;
    from?: TelegramFrom;
    message?: { chat?: { id?: number } };
  };
  message?: {
    chat?: {
      id?: number;
    };
    from?: TelegramFrom;
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id?: string;
      width?: number;
      height?: number;
      file_size?: number;
    }>;
  };
}

type TelegramFrom = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" });
}

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = performance.now();
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isTelegramUpdate(payload)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const service = new FamilyService(new GoogleSheetsFamilyRepository());

  try {
    const callback = payload.callback_query;
    const callbackChatId = callback?.message?.chat?.id;
    const callbackFrom = callback?.from;
    if (
      callback &&
      typeof callback.id === "string" &&
      typeof callback.data === "string" &&
      typeof callbackChatId === "number" &&
      callbackFrom &&
      typeof callbackFrom.id === "number"
    ) {
      const handlerStartedAt = performance.now();
      const response = await handleTelegramCallbackQuery(
        service,
        toTelegramUser(callbackFrom),
        callback.data,
      );
      const handlerDurationMs = measureDuration(handlerStartedAt);
      const deliveryStartedAt = performance.now();
      await answerTelegramCallbackQuery(callback.id);
      await sendTelegramMessage({
        chatId: callbackChatId,
        text: response.text,
        ...(usesTelegramHtml(response.text) ? { parseMode: "HTML" as const } : {}),
        ...(response.replyMarkup ? { replyMarkup: response.replyMarkup } : {}),
      });
      logDuration("telegram.update", measureDuration(requestStartedAt), {
        updateType: "callback_query",
        handlerMs: handlerDurationMs,
        deliveryMs: measureDuration(deliveryStartedAt),
      });
      return Response.json({ ok: true });
    }

    const chatId = payload.message?.chat?.id;
    const text = payload.message?.text;
    const caption = payload.message?.caption;
    const from = payload.message?.from;
    if (typeof chatId !== "number" || !from || typeof from.id !== "number") {
      return Response.json({ ok: true, ignored: true });
    }

    if (Array.isArray(payload.message?.photo)) {
      const photo = payload.message.photo.flatMap((item): TelegramPhotoSize[] => (
        typeof item.file_id === "string" && typeof item.width === "number" && typeof item.height === "number"
          ? [{ fileId: item.file_id, width: item.width, height: item.height, ...(typeof item.file_size === "number" ? { fileSize: item.file_size } : {}) }]
          : []
      ));
      const handlerStartedAt = performance.now();
      const response = await handleTelegramPhotoMessageResponse(
        service,
        toTelegramUser(from),
        photo,
        typeof caption === "string" ? caption : null,
      );
      const handlerDurationMs = measureDuration(handlerStartedAt);
      const responseText = typeof response === "string" ? response : response.text;
      const deliveryStartedAt = performance.now();
      await sendTelegramMessage({
        chatId,
        text: responseText,
        ...(usesTelegramHtml(responseText) ? { parseMode: "HTML" as const } : {}),
        ...(typeof response !== "string" && response.replyMarkup ? { replyMarkup: response.replyMarkup } : {}),
      });
      logDuration("telegram.update", measureDuration(requestStartedAt), {
        updateType: "photo",
        handlerMs: handlerDurationMs,
        deliveryMs: measureDuration(deliveryStartedAt),
      });
      return Response.json({ ok: true });
    }

    if (typeof text !== "string") return Response.json({ ok: true, ignored: true });

    const handlerStartedAt = performance.now();
    const response = await handleTelegramTextMessageResponse(
      service,
      toTelegramUser(from),
      text,
    );
    const handlerDurationMs = measureDuration(handlerStartedAt);
    const responseText = typeof response === "string" ? response : response.text;
    const deliveryStartedAt = performance.now();
    await sendTelegramMessage({
      chatId,
      text: responseText,
      ...(usesTelegramHtml(responseText) ? { parseMode: "HTML" as const } : {}),
      ...(typeof response !== "string" && response.replyMarkup ? { replyMarkup: response.replyMarkup } : {}),
    });
    logDuration("telegram.update", measureDuration(requestStartedAt), {
      updateType: "text",
      handlerMs: handlerDurationMs,
      deliveryMs: measureDuration(deliveryStartedAt),
    });

    return Response.json({ ok: true });
  } catch (error) {
    logDuration("telegram.update.error", measureDuration(requestStartedAt), {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    if (error instanceof TelegramConfigurationError) {
      return Response.json({ error: "Service unavailable." }, { status: 503 });
    }

    if (error instanceof TelegramApiError) {
      return Response.json({ error: "Unable to process update." }, { status: 502 });
    }

    return Response.json({ error: "Unable to process update." }, { status: 500 });
  }
}

function toTelegramUser(from: TelegramFrom) {
  return {
    telegramUserId: String(from.id),
    name: [from.first_name, from.last_name].filter(Boolean).join(" ") || "Pengguna Telegram",
    username: typeof from.username === "string" ? from.username : null,
  };
}

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  return (
    typeof value === "object" &&
    value !== null &&
    "update_id" in value &&
    typeof value.update_id === "number"
  );
}
