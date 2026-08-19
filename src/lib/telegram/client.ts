const TELEGRAM_API_URL = "https://api.telegram.org";

interface TelegramApiResponse {
  ok: boolean;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callbackData: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

interface SendTelegramMessageOptions {
  chatId: number;
  text: string;
  parseMode?: "HTML";
  replyMarkup?: TelegramReplyMarkup;
}

export class TelegramConfigurationError extends Error {}

export class TelegramApiError extends Error {}

export async function answerTelegramCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfigurationError("Telegram bot token is not configured.");
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_URL}/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  } catch {
    throw new TelegramApiError("Telegram callback acknowledgement failed.");
  }
  if (!response.ok) throw new TelegramApiError("Telegram callback acknowledgement returned an error response.");
  const payload: unknown = await response.json().catch(() => null);
  if (!isTelegramApiResponse(payload) || !payload.ok) {
    throw new TelegramApiError("Telegram callback acknowledgement returned an invalid response.");
  }
}

export async function sendTelegramMessage({
  chatId,
  text,
  parseMode,
  replyMarkup,
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
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(replyMarkup ? { reply_markup: toTelegramReplyMarkup(replyMarkup) } : {}),
      }),
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

function toTelegramReplyMarkup(markup: TelegramReplyMarkup): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: markup.inline_keyboard.map((row) => row.map((button) => ({
      text: button.text,
      callback_data: button.callbackData,
    }))),
  };
}

function isTelegramApiResponse(value: unknown): value is TelegramApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}
