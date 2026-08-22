import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUser } from "../family/types";

const DEFAULT_MAX_AUTH_AGE_SECONDS = 3_600;

export interface ValidatedMiniAppInitData {
  telegramUser: TelegramUser;
  authDate: number;
  queryId: string | null;
}

export class MiniAppAuthError extends Error {}

export function validateMiniAppInitData(
  rawInitData: string,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = getMiniAppAuthMaxAgeSeconds(),
): ValidatedMiniAppInitData {
  if (!rawInitData.trim()) throw new MiniAppAuthError("Mini App initData is required.");
  if (!botToken) throw new MiniAppAuthError("Telegram bot token is not configured.");

  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new MiniAppAuthError("Mini App initData hash is invalid.");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const receivedHashBuffer = Buffer.from(receivedHash, "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");
  if (
    receivedHashBuffer.length !== expectedHashBuffer.length ||
    !timingSafeEqual(receivedHashBuffer, expectedHashBuffer)
  ) {
    throw new MiniAppAuthError("Mini App initData signature is invalid.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 60) {
    throw new MiniAppAuthError("Mini App auth date is invalid.");
  }
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new MiniAppAuthError("Mini App initData has expired.");
  }

  const userJson = params.get("user");
  if (!userJson) throw new MiniAppAuthError("Mini App user data is missing.");
  let user: { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown; photo_url?: unknown };
  try {
    user = JSON.parse(userJson) as typeof user;
  } catch {
    throw new MiniAppAuthError("Mini App user data is invalid.");
  }
  if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0) {
    throw new MiniAppAuthError("Mini App user ID is invalid.");
  }

  const firstName = typeof user.first_name === "string" ? user.first_name : "";
  const lastName = typeof user.last_name === "string" ? user.last_name : "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "Telegram user";
  const username = typeof user.username === "string" && user.username.trim() ? user.username : null;
  const avatarUrl = normalizeTelegramAvatarUrl(user.photo_url);
  return {
    telegramUser: {
      telegramUserId: String(user.id),
      name,
      username,
      avatarUrl,
    },
    authDate,
    queryId: params.get("query_id"),
  };
}

function normalizeTelegramAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getMiniAppAuthMaxAgeSeconds(): number {
  const configured = Number(process.env.FALANCE_TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return DEFAULT_MAX_AUTH_AGE_SECONDS;
}
