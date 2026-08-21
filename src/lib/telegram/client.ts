const TELEGRAM_API_URL = "https://api.telegram.org";
const TELEGRAM_FILE_URL = "https://api.telegram.org";

interface TelegramApiResponse {
  ok: boolean;
}

export interface TelegramPhotoSize {
  fileId: string;
  width: number;
  height: number;
  fileSize?: number;
}

export interface TelegramDownloadedImage {
  data: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  filePath: string;
}

const TELEGRAM_FILE_MAX_BYTES = readPositiveLimit(process.env.FALANCE_RECEIPT_MAX_BYTES, 10 * 1024 * 1024);
const TELEGRAM_PHOTO_MAX_PIXELS = 20_000_000;
const TELEGRAM_FILE_TIMEOUT_MS = 10_000;

export interface TelegramInlineKeyboardButton {
  text: string;
  callbackData?: string;
  webApp?: { url: string };
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

export async function downloadTelegramPhoto(photo: readonly TelegramPhotoSize[]): Promise<TelegramDownloadedImage> {
  const selected = selectLargestPhoto(photo);
  if (!selected) throw new TelegramApiError("Telegram photo is missing or invalid.");
  if (selected.width * selected.height > TELEGRAM_PHOTO_MAX_PIXELS) {
    throw new TelegramApiError("Telegram photo dimensions exceed the supported limit.");
  }

  const file = await getTelegramFile(selected.fileId);
  if (file.fileSize !== undefined && file.fileSize > TELEGRAM_FILE_MAX_BYTES) {
    throw new TelegramApiError("Telegram photo exceeds the supported size limit.");
  }
  const mimeType = mimeTypeFromFilePath(file.filePath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_FILE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_FILE_URL}/file/bot${requireTelegramToken()}/${encodeTelegramFilePath(file.filePath)}`, {
      signal: controller.signal,
    });
  } catch {
    throw new TelegramApiError("Telegram photo download failed.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new TelegramApiError("Telegram photo download returned an error response.");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > TELEGRAM_FILE_MAX_BYTES) {
    throw new TelegramApiError("Telegram photo exceeds the supported size limit.");
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > TELEGRAM_FILE_MAX_BYTES) throw new TelegramApiError("Telegram photo exceeds the supported size limit.");
  if (!hasExpectedImageSignature(data, mimeType)) throw new TelegramApiError("Telegram photo content does not match its declared format.");
  return { data, mimeType, filePath: file.filePath };
}

export async function answerTelegramCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = requireTelegramToken();
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
  const token = requireTelegramToken();

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

function toTelegramReplyMarkup(markup: TelegramReplyMarkup): { inline_keyboard: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> } {
  return {
    inline_keyboard: markup.inline_keyboard.map((row) => row.map((button) => ({
      text: button.text,
      ...(button.callbackData ? { callback_data: button.callbackData } : {}),
      ...(button.webApp ? { web_app: button.webApp } : {}),
    }))),
  };
}

interface TelegramFileResult {
  file_path: string;
  file_size?: number;
}

async function getTelegramFile(fileId: string): Promise<{ filePath: string; fileSize?: number }> {
  const token = requireTelegramToken();
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_FILE_TIMEOUT_MS);
  try {
    response = await fetch(`${TELEGRAM_API_URL}/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: controller.signal,
    });
  } catch {
    throw new TelegramApiError("Telegram getFile request failed.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new TelegramApiError("Telegram getFile returned an error response.");
  const payload = await response.json().catch(() => null) as unknown;
  if (!isTelegramApiResponse(payload) || !payload.ok || !isTelegramFileResult(payload.result)) {
    throw new TelegramApiError("Telegram getFile returned an invalid response.");
  }
  return { filePath: payload.result.file_path, fileSize: payload.result.file_size };
}

function selectLargestPhoto(photo: readonly TelegramPhotoSize[]): TelegramPhotoSize | null {
  return [...photo]
    .filter((candidate) => candidate.fileId && Number.isInteger(candidate.width) && Number.isInteger(candidate.height))
    .sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? null;
}

function encodeTelegramFilePath(filePath: string): string {
  const segments = filePath.split("/");
  if (!filePath || filePath.startsWith("/") || segments.includes("..")) {
    throw new TelegramApiError("Telegram file path is invalid.");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function hasExpectedImageSignature(data: Uint8Array, mimeType: TelegramDownloadedImage["mimeType"]): boolean {
  if (mimeType === "image/jpeg") return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === "image/png") return data.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  return data.slice(0, 4).every((value, index) => value === [0x52, 0x49, 0x46, 0x46][index])
    && data.slice(8, 12).every((value, index) => value === [0x57, 0x45, 0x42, 0x50][index]);
}

function mimeTypeFromFilePath(filePath: string): TelegramDownloadedImage["mimeType"] {
  const extension = filePath.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  throw new TelegramApiError("Telegram photo format is not supported.");
}

function requireTelegramToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfigurationError("Telegram bot token is not configured.");
  return token;
}

function readPositiveLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isTelegramFileResult(value: unknown): value is TelegramFileResult {
  return typeof value === "object" && value !== null && "file_path" in value && typeof value.file_path === "string"
    && (!('file_size' in value) || typeof value.file_size === "number");
}

function isTelegramApiResponse(value: unknown): value is TelegramApiResponse & { result?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}
