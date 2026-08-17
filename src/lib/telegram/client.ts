const TELEGRAM_API_URL = "https://api.telegram.org";

interface TelegramApiResponse {
  ok: boolean;
}

interface SendTelegramMessageOptions {
  chatId: number;
  text: string;
}

export class TelegramConfigurationError extends Error {}

export class TelegramApiError extends Error {}

export async function sendTelegramMessage({
  chatId,
  text,
}: SendTelegramMessageOptions): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new TelegramConfigurationError("Telegram bot token is not configured.");
  }

  let response: Response;

  try {
    response = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    throw new TelegramApiError("Telegram API request failed.");
  }

  if (!response.ok) {
    throw new TelegramApiError("Telegram API returned an error response.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!isTelegramApiResponse(payload) || !payload.ok) {
    throw new TelegramApiError("Telegram API returned an invalid response.");
  }
}

function isTelegramApiResponse(value: unknown): value is TelegramApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}
