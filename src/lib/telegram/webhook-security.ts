export type TelegramWebhookSecretResult = "AUTHORIZED" | "MISSING_CONFIGURATION" | "UNAUTHORIZED";

export function verifyTelegramWebhookSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined,
): TelegramWebhookSecretResult {
  if (!expectedSecret) return "MISSING_CONFIGURATION";
  return providedSecret === expectedSecret ? "AUTHORIZED" : "UNAUTHORIZED";
}

export function isTelegramUpdateId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
