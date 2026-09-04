"use client";

import { CATEGORY_LABELS } from "../../lib/family/category-analytics";
import type { ReportResponse, TelegramWebApp } from "./types";

const TELEGRAM_BOOTSTRAP_TIMEOUT_MS = 5_000;

export function getCategoryLabel(category: string): string {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)
    ? CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]
    : CATEGORY_LABELS.UNCATEGORIZED;
}

export function formatAmount(value: string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(BigInt(value))}`;
}

export function formatSignedAmount(value: bigint, currency: string): string {
  const sign = value > BigInt(0) ? "+" : value < BigInt(0) ? "−" : "";
  const absoluteValue = value < BigInt(0) ? -value : value;
  return `${sign}${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(absoluteValue)}`;
}

export function getPreviousPeriodInput(period: ReportResponse["report"]["period"]): { month?: string; startDate?: string; endDate?: string } | null {
  if (period.month) {
    const [year, month] = period.month.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    return { month: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}` };
  }
  const start = new Date(`${period.startDate}T00:00:00.000Z`);
  const end = new Date(`${period.endDate}T00:00:00.000Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - ((days - 1) * 86_400_000));
  return { startDate: toIsoDate(previousStart), endDate: toIsoDate(previousEnd) };
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function formatLongDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function requestTelegramPrint(url: string): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false });
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("Popup diblokir browser. Izinkan popup untuk membuka tampilan cetak.");
}

export async function waitForTelegramWebApp(): Promise<TelegramWebApp | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TELEGRAM_BOOTSTRAP_TIMEOUT_MS) {
    const webApp = window.Telegram?.WebApp;
    if (webApp) return webApp;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return window.Telegram?.WebApp ?? null;
}
