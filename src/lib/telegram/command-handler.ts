import {
  AlreadyRegisteredError,
  FamilyService,
  type ConfirmationResult,
  ConfirmationError,
  FamilyLifecycleError,
  FamilyNameError,
  FamilyServiceError,
  InvitationError,
  TransactionError,
  MemberManagementError,
  OwnerInvariantError,
  UnauthorizedError,
} from "../family/service";
import { getBusinessDate } from "../time/business-date";
import type { FamilyMember, MemberRole, TelegramUser } from "../family/types";
import { ReportPeriodError } from "../family/report";
import {
  downloadTelegramPhoto,
  TelegramApiError,
  type TelegramPhotoSize,
  type TelegramReplyMarkup,
} from "./client";
import {
  createTransactionTextParser,
  TransactionTextParserUnavailableError,
  type TransactionTextParser,
} from "../ai/transaction-text-parser";
import { createReceiptParser, ReceiptParserUnavailableError, type ReceiptParser } from "../ai/receipt-parser";
import { formatMembersMessage } from "./member-message";
import { formatFinancialReportMessage } from "./report-message";
import { formatTransactionCreatedMessage, formatTransactionsMessage } from "./transaction-message";
import { parseEditDraftCommand, parseEditTransactionCommand, parseManualTransactionCommand, TransactionCommandError } from "./transaction-command";
import { telegramCode } from "./html";
import {
  formatDraftActionMarkup,
  formatDraftCancelledMessage,
  formatDraftEditInstructions,
  formatDraftSavedMessage,
  formatTransactionDraftMessage,
} from "./transaction-draft-message";

const UNREGISTERED_START = `👋 Halo! Selamat datang di Falancé.

Kamu belum terdaftar dalam keluarga.

Kamu bisa:
• membuat keluarga baru
• bergabung menggunakan invitation code.`;

export interface TelegramHandlerResponse {
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}

export async function handleTelegramTextMessage(
  service: FamilyService,
  user: TelegramUser,
  text: string,
  transactionTextParser: TransactionTextParser = createTransactionTextParser(),
): Promise<string> {
  const response = await handleTelegramTextMessageResponse(service, user, text, transactionTextParser);
  return typeof response === "string" ? response : response.text;
}

export async function handleTelegramPhotoMessageResponse(
  service: FamilyService,
  user: TelegramUser,
  photo: readonly TelegramPhotoSize[],
  caption: string | null = null,
  receiptParser: ReceiptParser = createReceiptParser(),
  photoDownloader: typeof downloadTelegramPhoto = downloadTelegramPhoto,
): Promise<TelegramHandlerResponse | string> {
  try {
    const membership = await service.getActiveMembership(user.telegramUserId);
    if (!membership) return startMessage(null);
    const visionClaim = await service.claimReceiptVision(user);
    if (!visionClaim) return { text: "⏳ Receipt sedang diproses atau batas penggunaan receipt sementara tercapai. Coba lagi nanti." };

    try {
      const image = await photoDownloader(photo);
      const parsed = await receiptParser.parse(image, caption, getBusinessDate());
      if (parsed.kind === "READY") {
        const draft = await service.createPendingTransactionDraft(
          user,
          parsed.draft,
          parsed.draft.confidence,
          {
            transactionDateInferred: parsed.draft.transactionDateInferred,
            categorySuggestion: parsed.draft.categorySuggestion,
            descriptionSuggestion: parsed.draft.descriptionSuggestion,
          },
        );
        return { text: formatTransactionDraftMessage(draft), replyMarkup: formatDraftActionMarkup(draft.draftId, draft.status) };
      }
      if (parsed.kind === "NEEDS_CLARIFICATION") return `🤔 ${parsed.question}`;
      return `🤔 ${parsed.reason}`;
    } finally {
      await service.completeReceiptVision(visionClaim).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof TelegramApiError) return { text: "Receipt tidak dapat diunduh atau format gambarnya tidak didukung. Pastikan foto jelas dan berukuran sesuai, lalu coba lagi." };
    return { text: messageForError(error) };
  }
}

export async function handleTelegramTextMessageResponse(
  service: FamilyService,
  user: TelegramUser,
  text: string,
  transactionTextParser: TransactionTextParser = createTransactionTextParser(),
): Promise<TelegramHandlerResponse | string> {
  const command = text.trim();
  try {
    if (command === "/start") return startMessage(await service.getActiveMembership(user.telegramUserId));
    if ((command.toUpperCase() === "Y" || command.toUpperCase() === "N") && await service.hasPendingConfirmation(user.telegramUserId)) {
      if (command.toUpperCase() === "Y") {
        return confirmationResultMessage(await service.confirmPendingAction(user));
      }
      await service.cancelPendingConfirmation(user);
      return "✅ Operasi dibatalkan.";
    }
    if (command === "/createfamily") {
      await service.beginFamilyCreation(user);
      return "🏠 Mari buat keluarga baru.\n\nSilakan kirim nama keluarga.";
    }
    if (command === "/invite") {
      const invitation = await service.createInvitation(user);
      return `✅ Invitation berhasil dibuat.\n\nKode: ${telegramCode(invitation.code)}\nBerlaku sampai: ${new Date(invitation.expiresAt).toLocaleString("id-ID")}`;
    }
    if (command === "/members") {
      const family = await service.getActiveFamily(user.telegramUserId);
      return formatMembersMessage(family.familyName, await service.listFamilyMembers(user.telegramUserId));
    }
    if (command.startsWith("/addincome")) {
      const transaction = await service.createTransaction(
        user,
        parseManualTransactionCommand(command, "/addincome"),
      );
      return formatTransactionCreatedMessage(transaction);
    }
    if (command.startsWith("/addexpense")) {
      const transaction = await service.createTransaction(
        user,
        parseManualTransactionCommand(command, "/addexpense"),
      );
      return formatTransactionCreatedMessage(transaction);
    }
    if (command === "/transactions") {
      const family = await service.getActiveFamily(user.telegramUserId);
      return formatTransactionsMessage(family, await service.listTransactions(user.telegramUserId));
    }
    if (command === "/report" || command.startsWith("/report ")) {
      const periodArgument = command.slice("/report".length).trim();
      if (periodArgument.split(/\s+/).filter(Boolean).length > 1) {
        return "Format tidak valid. Gunakan: /report atau /report YYYY-MM";
      }
      const family = await service.getActiveFamily(user.telegramUserId);
      return formatFinancialReportMessage(
        family,
        await service.getFinancialReport(user.telegramUserId, periodArgument || undefined),
      );
    }
    if (command.startsWith("/editdraft")) {
      const draft = await service.updatePendingTransactionDraft(user, parseEditDraftCommand(command));
      return { text: formatTransactionDraftMessage(draft), replyMarkup: formatDraftActionMarkup(draft.draftId, draft.status) };
    }
    if (command.startsWith("/edittransaction")) {
      const { transactionId, input } = parseEditTransactionCommand(command);
      const transaction = await service.updateTransaction(user, transactionId, input);
      return `✅ Transaksi ${telegramCode(transaction.transactionId)} berhasil diperbarui.`;
    }
    if (command.startsWith("/voidtransaction") || command.startsWith("/canceltransaction")) {
      const prefix = command.startsWith("/voidtransaction") ? "/voidtransaction" : "/canceltransaction";
      const transactionId = command.slice(prefix.length).trim();
      if (!transactionId) return `Format tidak valid. Gunakan: ${prefix} <transaction_id>`;
      await service.requestTransactionVoid(user, transactionId);
      return `⚠️ Apakah kamu ingin membatalkan transaksi ${telegramCode(transactionId)}?\n\nBalas Y untuk melanjutkan atau N untuk membatalkan. Konfirmasi berlaku 5 menit.`;
    }
    if (command.startsWith("/revokeinvite")) {
      const code = command.slice("/revokeinvite".length).trim();
      if (!code) return "Format tidak valid. Gunakan: /revokeinvite FAL-XXXXXX";
      await service.requestInvitationRevocation(user, code);
      return "⚠️ Apakah kamu ingin mencabut invitation ini?\n\nBalas Y untuk melanjutkan atau N untuk membatalkan. Konfirmasi berlaku 5 menit.";
    }
    if (command.startsWith("/changerole")) {
      const args = command.slice("/changerole".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 2) return "Format tidak valid. Gunakan: /changerole <member_id_atau_username> <ADMIN|MEMBER>";

      const target = await findRoleChangeTarget(service, user, args[0]);
      if (!target) return "Anggota tidak ditemukan dalam keluarga aktif kamu.";

      const newRole = args[1].toUpperCase();
      if (newRole !== "ADMIN" && newRole !== "MEMBER") {
        return "Role tidak valid. Gunakan ADMIN atau MEMBER.";
      }
      await service.changeMemberRole(user, target.memberId, newRole as MemberRole);
      return `✅ Role ${target.name} berhasil diubah menjadi ${newRole}.`;
    }
    if (command.startsWith("/deactivate")) {
      const args = command.slice("/deactivate".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 1) return "Format tidak valid. Gunakan: /deactivate <member_id_atau_username>";

      const target = await findRoleChangeTarget(service, user, args[0]);
      if (!target) return "Anggota tidak ditemukan dalam keluarga aktif kamu.";

      await service.requestMemberDeactivation(user, target.memberId);
      return `⚠️ Apakah kamu ingin menonaktifkan anggota ${target.name}?\n\nBalas Y untuk melanjutkan atau N untuk membatalkan. Konfirmasi berlaku 5 menit.`;
    }
    if (command.startsWith("/archivefamily")) {
      const args = command.slice("/archivefamily".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 0) return "Format tidak valid. Gunakan: /archivefamily";

      const family = await service.getActiveFamily(user.telegramUserId);
      await service.requestFamilyArchive(user);
      return `⚠️ Apakah kamu ingin mengarsipkan keluarga ${family.familyName}?\n\nBalas Y untuk melanjutkan atau N untuk membatalkan. Konfirmasi berlaku 5 menit.`;
    }
    if (command.startsWith("/reactivatefamily")) {
      const args = command.slice("/reactivatefamily".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 1) return "Format tidak valid. Gunakan: /reactivatefamily CONFIRM";

      const family = await service.reactivateFamily(user, args[0]);
      return `✅ Keluarga ${family.familyName} berhasil diaktifkan kembali.`;
    }
    if (command.startsWith("/reactivate")) {
      const args = command.slice("/reactivate".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 2) return "Format tidak valid. Gunakan: /reactivate <member_id_atau_username> CONFIRM";

      const member = await service.reactivateMember(user, args[0], args[1]);
      return `✅ Anggota ${member.name} berhasil diaktifkan kembali dengan Member ID yang sama: ${member.memberId}.`;
    }
    if (command.startsWith("/renamefamily")) {
      const familyName = command.slice("/renamefamily".length).trim();
      if (!familyName) return "Format tidak valid. Gunakan: /renamefamily <nama_baru>";

      const family = await service.updateFamilyName(user, familyName);
      return `✅ Nama keluarga berhasil diubah menjadi ${family.familyName}.`;
    }
    if (command.startsWith("/join")) {
      const code = command.slice("/join".length).trim();
      if (!code) return "Format tidak valid. Gunakan: /join FAL-XXXXXX";
      const family = await service.joinFamily(user, code);
      return `✅ Kamu berhasil bergabung dengan ${family.familyName}.`;
    }

    const membership = await service.getActiveMembership(user.telegramUserId);
    if (!membership) {
      const family = await service.createFamilyFromPending(user, command);
      return `✅ Keluarga ${family.familyName} berhasil dibuat. Kamu adalah OWNER keluarga ini.`;
    }
    if (!command.startsWith("/") && command !== "Y" && command !== "N") {
      const parsed = await transactionTextParser.parse(command, getBusinessDate());
      if (parsed.kind === "READY") {
        const draft = await service.createPendingTransactionDraft(
          user,
          parsed.draft,
          parsed.draft.confidence,
          {
            transactionDateInferred: parsed.draft.transactionDateInferred,
            categorySuggestion: parsed.draft.categorySuggestion,
            descriptionSuggestion: parsed.draft.descriptionSuggestion,
          },
        );
        return { text: formatTransactionDraftMessage(draft), replyMarkup: formatDraftActionMarkup(draft.draftId, draft.status) };
      }
      if (parsed.kind === "NEEDS_CLARIFICATION") return `🤔 ${parsed.question}`;
      return `🤔 ${parsed.reason}`;
    }
    return "Falancé sedang dalam pengembangan. Fitur pencatatan keuangan akan segera hadir.";
  } catch (error) {
    return messageForError(error);
  }
}

export async function handleTelegramCallbackQuery(
  service: FamilyService,
  user: TelegramUser,
  callbackData: string,
): Promise<TelegramHandlerResponse> {
  try {
    const [prefix, action, draftId] = callbackData.split(":");
    if (prefix !== "draft" || !draftId || !["yes", "submit", "edit", "cancel"].includes(action)) {
      return { text: "Tombol ini sudah tidak berlaku." };
    }
    const draft = await service.getPendingTransactionDraft(user.telegramUserId);
    if (!draft || draft.draftId !== draftId) return { text: "Draft transaksi sudah kedaluwarsa atau tidak tersedia." };

    if (action === "edit") {
      await service.markPendingTransactionDraftEditing(user);
      return { text: formatDraftEditInstructions() };
    }
    if (action === "cancel") {
      await service.cancelPendingTransactionDraft(user);
      return { text: formatDraftCancelledMessage() };
    }
    const transaction = await service.approvePendingTransactionDraft(user);
    return { text: formatDraftSavedMessage(transaction.transactionId) };
  } catch (error) {
    return { text: messageForError(error) };
  }
}

function startMessage(member: { role: string } | null): string {
  return member
    ? `👋 Halo! Kamu terdaftar sebagai ${member.role} di Falancé.`
    : UNREGISTERED_START;
}

async function findRoleChangeTarget(
  service: FamilyService,
  user: TelegramUser,
  identifier: string,
): Promise<FamilyMember | null> {
  const normalizedIdentifier = identifier.replace(/^@/, "").toLowerCase();
  const members = await service.listFamilyMembers(user.telegramUserId);
  return members.find(
    (member) =>
      member.memberId === identifier ||
      (member.username !== null && member.username.toLowerCase() === normalizedIdentifier),
  ) ?? null;
}

function confirmationResultMessage(result: ConfirmationResult): string {
  if (result.action === "REVOKE_INVITATION") return "✅ Invitation berhasil dicabut.";
  if (result.action === "DEACTIVATE_MEMBER") return `✅ Anggota ${result.targetName ?? "target"} berhasil dinonaktifkan.`;
  if (result.action === "ARCHIVE_FAMILY") return `✅ Keluarga ${result.familyName ?? "target"} berhasil diarsipkan sementara.`;
  return `✅ Transaksi ${result.transactionDescription ?? "target"} berhasil dibatalkan secara soft-state.`;
}

function messageForError(error: unknown): string {
  if (error instanceof TransactionCommandError) return error.message;
  if (error instanceof ReportPeriodError) return "Periode tidak valid. Gunakan format YYYY-MM, misalnya /report 2026-08.";
  if (error instanceof ReceiptParserUnavailableError) return "Parser receipt belum tersedia. Coba lagi nanti atau gunakan input transaksi melalui teks.";
  if (error instanceof TransactionTextParserUnavailableError) return "Parser AI belum tersedia. Gunakan command transaksi terstruktur seperti /addincome atau /addexpense.";
  if (error instanceof AlreadyRegisteredError) return "Kamu sudah terdaftar dalam keluarga aktif.";
  if (error instanceof UnauthorizedError) return "Kamu tidak memiliki izin untuk menjalankan perintah ini.";
  if (error instanceof InvitationError) return "Invitation tidak valid, sudah digunakan, dicabut, atau kedaluwarsa.";
  if (error instanceof FamilyNameError) return "Nama keluarga tidak valid. Gunakan nama 1–80 karakter.";
  if (error instanceof ConfirmationError) return "Tidak ada konfirmasi pending yang dapat diproses, atau konfirmasi sudah kedaluwarsa.";
  if (error instanceof FamilyLifecycleError) return "Status keluarga tidak memungkinkan operasi ini.";
  if (error instanceof OwnerInvariantError) return "Operasi ditolak karena keluarga harus selalu memiliki setidaknya satu OWNER aktif.";
  if (error instanceof MemberManagementError) return "Perubahan anggota tidak dapat diproses. Pastikan target memiliki status yang sesuai dan gunakan konfirmasi CONFIRM.";
  if (error instanceof TransactionError) return "Transaksi tidak dapat diproses. Pastikan ID, status, dan data transaksi berada pada keluarga aktif kamu.";
  if (error instanceof FamilyServiceError) return "Permintaan tidak dapat diproses. Gunakan /createfamily untuk memulai kembali.";
  return "Terjadi gangguan saat memproses permintaan. Silakan coba lagi.";
}
