import { timingSafeEqual } from "node:crypto";

export type TelegramWebhookSecretResult = "AUTHORIZED" | "MISSING_CONFIGURATION" | "UNAUTHORIZED";

export function verifyTelegramWebhookSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined,
): TelegramWebhookSecretResult {
  if (!expectedSecret) return "MISSING_CONFIGURATION";
  if (!providedSecret) return "UNAUTHORIZED";
  return secretsMatch(providedSecret, expectedSecret) ? "AUTHORIZED" : "UNAUTHORIZED";
}

function secretsMatch(providedSecret: string, expectedSecret: string): boolean {
  const expected = Buffer.from(expectedSecret, "utf8");
  const provided = Buffer.from(providedSecret, "utf8");
  const comparable = Buffer.alloc(expected.length);
  provided.copy(comparable, 0, 0, expected.length);
  return provided.length === expected.length && timingSafeEqual(comparable, expected);
}

export function isTelegramUpdateId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
