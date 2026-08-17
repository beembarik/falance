import {
  TelegramApiError,
  TelegramConfigurationError,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { getTextMessageResponse } from "@/lib/telegram/message-response";

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: {
      id?: number;
    };
    text?: string;
  };
}

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" });
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isTelegramUpdate(payload)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const chatId = payload.message?.chat?.id;
  const text = payload.message?.text;

  if (typeof chatId !== "number" || typeof text !== "string") {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    await sendTelegramMessage({
      chatId,
      text: getTextMessageResponse(text),
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof TelegramConfigurationError) {
      return Response.json({ error: "Service unavailable." }, { status: 503 });
    }

    if (error instanceof TelegramApiError) {
      return Response.json({ error: "Unable to process update." }, { status: 502 });
    }

    return Response.json({ error: "Unable to process update." }, { status: 500 });
  }
}

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  return (
    typeof value === "object" &&
    value !== null &&
    "update_id" in value &&
    typeof value.update_id === "number"
  );
}
