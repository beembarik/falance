import type { TransactionDraft } from "../ai/transaction-text-parser";
import type { TelegramReplyMarkup } from "./client";
import type { TransactionDraftStatus } from "../family/types";
import { telegramCode } from "./html";

export function formatTransactionDraftMessage(draft: TransactionDraft): string {
  const label = draft.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran";
  const command = draft.transactionType === "INCOME" ? "/addincome" : "/addexpense";
  const structuredCommand = [
    command,
    String(draft.amountMinor),
    draft.currency,
    draft.transactionDate,
    draft.description,
  ].join(" ");

  return [
    "🧠 DRAFT TRANSAKSI",
    "",
    `Tipe       : ${label}`,
    `Jumlah     : ${formatAmount(draft.amountMinor, draft.currency)}`,
    `Tanggal    : ${formatDate(draft.transactionDate)}`,
    `Deskripsi  : ${draft.description}`,
    `Keyakinan  : ${draft.confidence}`,
    "",
    "Draft belum disimpan. Jika sudah benar, kirim command berikut:",
    telegramCode(structuredCommand),
  ].join("\n");
}

export function formatDraftActionMarkup(draftId: string, status: TransactionDraftStatus): TelegramReplyMarkup {
  if (status === "EDITING") {
    return {
      inline_keyboard: [[
        { text: "📤 Kirim draft", callbackData: `draft:submit:${draftId}` },
        { text: "✏️ Edit lagi", callbackData: `draft:edit:${draftId}` },
      ], [
        { text: "❌ Batalkan", callbackData: `draft:cancel:${draftId}` },
      ]],
    };
  }
  return {
    inline_keyboard: [[
      { text: "✅ Ya, simpan", callbackData: `draft:yes:${draftId}` },
      { text: "✏️ Edit", callbackData: `draft:edit:${draftId}` },
    ], [
      { text: "❌ Batalkan", callbackData: `draft:cancel:${draftId}` },
    ]],
  };
}

export function formatDraftEditInstructions(): string {
  return [
    "✏️ EDIT DRAFT TRANSAKSI",
    "",
    "Kirim perubahan dengan format berikut:",
    telegramCode("/editdraft <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>"),
    "",
    "Contoh:",
    telegramCode("/editdraft EXPENSE 35000 IDR 2026-08-19 Beli susu"),
  ].join("\n");
}

export function formatDraftSavedMessage(transactionId: string): string {
  return `✅ Transaksi berhasil disimpan.\n\nTransaction ID: ${telegramCode(transactionId)}`;
}

export function formatDraftCancelledMessage(): string {
  return "✅ Draft transaksi dibatalkan dan tidak disimpan.";
}

function formatAmount(amountMinor: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amountMinor)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
