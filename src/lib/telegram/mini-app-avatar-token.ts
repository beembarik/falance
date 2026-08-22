import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const AVATAR_TOKEN_TTL_SECONDS = 5 * 60;

type AvatarTokenPayload = {
  uid: string;
  exp: number;
  nonce: string;
};

export function buildMiniAppAvatarUrl(request: Request, telegramUserId: string): string {
  const secret = getAvatarTokenSecret();
  if (!secret) throw new Error("Avatar token secret is not configured.");
  const payload: AvatarTokenPayload = {
    uid: telegramUserId,
    exp: Math.floor(Date.now() / 1000) + AVATAR_TOKEN_TTL_SECONDS,
    nonce: randomBytes(12).toString("hex"),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const token = ["v1", encode(iv), encode(ciphertext), encode(authTag)].join(".");
  const configuredBase = process.env.FALANCE_MINI_APP_URL?.trim();
  const baseUrl = configuredBase || new URL(request.url).origin;
  return new URL(`/api/mini-app/avatar?token=${encodeURIComponent(token)}`, baseUrl).toString();
}

export function verifyMiniAppAvatarToken(token: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const secret = getAvatarTokenSecret();
  if (!secret || !token) return null;
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
    const payload = JSON.parse(plaintext) as Partial<AvatarTokenPayload>;
    if (typeof payload.uid !== "string" || !payload.uid || !/^\d+$/.test(payload.uid)) return null;
    if (typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp) || payload.exp < nowSeconds) return null;
    if (typeof payload.nonce !== "string" || !payload.nonce) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

function getAvatarTokenSecret(): string | null {
  const dedicatedSecret = process.env.FALANCE_REPORT_TOKEN_SECRET?.trim();
  if (dedicatedSecret) return dedicatedSecret;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return botToken || null;
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
