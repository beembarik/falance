import {
  TelegramApiError,
  TelegramConfigurationError,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { GoogleSheetsFamilyRepository } from "@/lib/family/google-sheets-repository";
import { FamilyService } from "@/lib/family/service";
import { handleTelegramTextMessage } from "@/lib/telegram/command-handler";
import { usesTelegramHtml } from "@/lib/telegram/html";

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: {
      id?: number;
    };
    from?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
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
  const from = payload.message?.from;

  if (typeof chatId !== "number" || typeof text !== "string" || !from || typeof from.id !== "number") {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const responseText = await handleTelegramTextMessage(
      new FamilyService(new GoogleSheetsFamilyRepository()),
      {
        telegramUserId: String(from.id),
        name: [from.first_name, from.last_name].filter(Boolean).join(" ") || "Pengguna Telegram",
        username: typeof from.username === "string" ? from.username : null,
      },
      text,
    );
    await sendTelegramMessage({
      chatId,
      text: responseText,
      ...(usesTelegramHtml(responseText) ? { parseMode: "HTML" as const } : {}),
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
