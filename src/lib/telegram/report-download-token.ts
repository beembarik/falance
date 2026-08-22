import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const REPORT_DOWNLOAD_TOKEN_TTL_SECONDS = 5 * 60;

export type ReportDownloadFormat = "csv" | "pdf" | "print";

export type ReportDownloadTokenPayload = {
  uid: string;
  format: ReportDownloadFormat;
  month?: string;
  startDate?: string;
  endDate?: string;
  password?: string;
  exp: number;
  nonce: string;
};

export type ReportDownloadAction = {
  url: string;
  fileName: string;
};

export function createReportDownloadToken(
  payload: Omit<ReportDownloadTokenPayload, "exp" | "nonce">,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const completePayload: ReportDownloadTokenPayload = {
    ...payload,
    exp: nowSeconds + REPORT_DOWNLOAD_TOKEN_TTL_SECONDS,
    nonce: randomBytes(12).toString("hex"),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(completePayload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", encode(iv), encode(ciphertext), encode(authTag)].join(".");
}

export function verifyReportDownloadToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ReportDownloadTokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = decode(parts[1]);
    const ciphertext = decode(parts[2]);
    const authTag = decode(parts[3]);
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<ReportDownloadTokenPayload>;
    if (
      typeof payload.uid !== "string" ||
      !payload.uid ||
      (payload.format !== "csv" && payload.format !== "pdf" && payload.format !== "print") ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      typeof payload.nonce !== "string" ||
      !payload.nonce ||
      payload.exp < nowSeconds
    ) {
      return null;
    }
    if (payload.password !== undefined && typeof payload.password !== "string") return null;
    return payload as ReportDownloadTokenPayload;
  } catch {
    return null;
  }
}

export function getReportDownloadSecret(): string | null {
  const dedicatedSecret = process.env.FALANCE_REPORT_TOKEN_SECRET?.trim();
  if (dedicatedSecret) return dedicatedSecret;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return botToken || null;
}

export function buildReportDownloadUrl(request: Request, token: string): string {
  const configuredBase = process.env.FALANCE_MINI_APP_URL?.trim();
  const baseUrl = configuredBase || new URL(request.url).origin;
  return new URL(`/api/mini-app/report/download?token=${encodeURIComponent(token)}`, baseUrl).toString();
}

export function buildReportDownloadTokenPayload(input: {
  telegramUserId: string;
  format: ReportDownloadFormat;
  period: { month: string | null; startDate: string; endDate: string };
  password?: string;
}): Omit<ReportDownloadTokenPayload, "exp" | "nonce"> {
  return {
    uid: input.telegramUserId,
    format: input.format,
    ...(input.period.month
      ? { month: input.period.month }
      : { startDate: input.period.startDate, endDate: input.period.endDate }),
    ...(input.password ? { password: input.password } : {}),
  };
}

export function buildReportDownloadAction(request: Request, input: {
  telegramUserId: string;
  format: ReportDownloadFormat;
  period: { month: string | null; startDate: string; endDate: string };
  fileName: string;
  password?: string;
}): ReportDownloadAction {
  const secret = getReportDownloadSecret();
  if (!secret) throw new Error("Report download token secret is not configured.");
  const token = createReportDownloadToken(
    buildReportDownloadTokenPayload(input),
    secret,
  );
  return { url: buildReportDownloadUrl(request, token), fileName: input.fileName };
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding.");
  return Buffer.from(value, "base64url");
}

