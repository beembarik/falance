import { randomBytes } from "node:crypto";
import PDFDocument from "pdfkit";

import { FALANCE_SYMBOL_BASE64 } from "../falance-brand";
import { formatReportGeneratedAt, type FinancialReport } from "./report";

const PAGE_MARGIN = 42;
const BODY_COLOR = "#223029";
const MUTED_COLOR = "#68756e";
const BRAND_GREEN = "#267a5a";
const BRAND_GREEN_DARK = "#185a42";
const BRAND_GREEN_LIGHT = "#e3f3ed";
const BRAND_PURPLE = "#6650a7";
const BORDER_COLOR = "#b8dfd0";

export function validatePdfPassword(password: string | undefined): string | undefined {
  const normalized = password && password.length > 0 ? password : undefined;
  if (normalized && (normalized.length < 8 || Buffer.byteLength(normalized, "utf8") > 127)) {
    throw new Error("PDF password must be 8–127 UTF-8 bytes.");
  }
  return normalized;
}

export function buildFinancialPdf(
  familyName: string,
  report: FinancialReport,
  password?: string,
): Promise<Buffer> {
  const generatedAt = formatReportGeneratedAt();
  const document = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    pdfVersion: password ? "1.7ext3" : "1.7",
    info: {
      Title: `Falancé — ${familyName} — ${report.period.label}`,
      Author: "Falancé",
      Subject: `Laporan keuangan keluarga · Dicetak pada ${generatedAt}`,
    },
    ...(password ? {
      userPassword: password,
      ownerPassword: randomBytes(32).toString("base64url"),
      permissions: {
        printing: "highResolution",
        copying: true,
        contentAccessibility: true,
      },
    } : {}),
  });
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    renderReport(document, familyName, report, generatedAt);
    document.end();
  });
}

function renderReport(document: PDFKit.PDFDocument, familyName: string, report: FinancialReport, generatedAt: string): void {
  document.fillColor(BODY_COLOR).font("Helvetica");
  drawBrandHeader(document, familyName, report, generatedAt);
  drawCurrencySection(document, report);
  drawTransactionSection(document, report);
  drawFooterNotice(document);
  addPageNumbers(document);
}

function drawBrandHeader(document: PDFKit.PDFDocument, familyName: string, report: FinancialReport, generatedAt: string): void {
  const top = document.y;
  document.image(Buffer.from(FALANCE_SYMBOL_BASE64, "base64"), PAGE_MARGIN, top, {
    width: 34,
    height: 34,
  });
  document.fillColor(BRAND_GREEN_DARK).font("Helvetica-Bold").fontSize(19).text("Falancé", PAGE_MARGIN + 44, top + 5);
  document.fillColor(BRAND_PURPLE).font("Helvetica-Bold").fontSize(15).text("Laporan Keuangan Keluarga", PAGE_MARGIN, top + 48);
  document.fillColor(BODY_COLOR).font("Helvetica").fontSize(11).text(familyName, PAGE_MARGIN, top + 70);
  document.fillColor(MUTED_COLOR).fontSize(8.5)
    .text(`${report.period.label} · ${report.period.startDate} s/d ${report.period.endDate}`)
    .text(`${report.transactionCount} transaksi aktif · Dicetak pada ${generatedAt}`);
  document.moveDown(0.7);
  document.moveTo(PAGE_MARGIN, document.y).lineTo(document.page.width - PAGE_MARGIN, document.y)
    .strokeColor(BRAND_GREEN).lineWidth(2).stroke();
  document.moveDown(0.3);
  document.fillColor(BODY_COLOR).font("Helvetica");
}

function drawCurrencySection(document: PDFKit.PDFDocument, report: FinancialReport): void {
  sectionTitle(document, "Ringkasan per mata uang");
  const widths = [62, 112, 112, 112, 62];
  drawTableHeader(document, ["Mata uang", "Pemasukan", "Pengeluaran", "Surplus/Defisit", "Transaksi"], widths);
  if (report.currencies.length === 0) {
    drawTableRow(document, ["Belum ada transaksi aktif pada periode ini."], [460]);
    return;
  }
  for (const summary of report.currencies) {
    drawTableRow(document, [
      summary.currency,
      formatAmount(summary.incomeMinor, summary.currency),
      formatAmount(summary.expenseMinor, summary.currency),
      formatAmount(summary.netMinor, summary.currency),
      String(summary.transactionCount),
    ], widths, ["left", "right", "right", "right", "right"]);
  }
}

function drawTransactionSection(document: PDFKit.PDFDocument, report: FinancialReport): void {
  sectionTitle(document, "Detail transaksi");
  const widths = [64, 74, 54, 86, 158, 70];
  drawTableHeader(document, ["Tanggal", "Jenis", "Mata uang", "Jumlah", "Deskripsi", "ID"], widths);
  if (report.transactions.length === 0) {
    drawTableRow(document, ["Belum ada transaksi aktif pada periode ini."], [506]);
    return;
  }
  for (const transaction of report.transactions) {
    drawTableRow(document, [
      transaction.transactionDate,
      transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran",
      transaction.currency,
      formatAmount(transaction.amountMinor, transaction.currency),
      transaction.description,
      transaction.transactionId,
    ], widths, ["left", "left", "left", "right", "left", "left"]);
  }
}

function drawFooterNotice(document: PDFKit.PDFDocument): void {
  if (document.y > document.page.height - 100) document.addPage();
  document.moveDown(1);
  document.fontSize(7.5).fillColor(MUTED_COLOR)
    .text("Generated by Falancé · Nilai antar-mata uang tidak digabungkan.", PAGE_MARGIN, document.y, {
      width: document.page.width - PAGE_MARGIN * 2,
    });
}

function sectionTitle(document: PDFKit.PDFDocument, title: string): void {
  if (document.y > document.page.height - 120) document.addPage();
  document.moveDown(1.1);
  document.fontSize(12).fillColor(BRAND_PURPLE).font("Helvetica-Bold").text(title, PAGE_MARGIN, document.y);
  document.moveDown(0.45);
  document.font("Helvetica");
}

function drawTableHeader(document: PDFKit.PDFDocument, cells: string[], widths: number[]): void {
  drawTableRow(document, cells, widths, cells.map(() => "left"), true);
}

function drawTableRow(
  document: PDFKit.PDFDocument,
  cells: string[],
  widths: number[],
  alignments: Array<"left" | "right"> = cells.map(() => "left"),
  header = false,
): void {
  const safeWidths = widths.length === cells.length ? widths : [document.page.width - PAGE_MARGIN * 2];
  const safeCells = cells.length === safeWidths.length ? cells : [cells.join(" ")];
  const rowHeight = Math.max(22, ...safeCells.map((cell, index) => document.heightOfString(cell, {
    width: Math.max(safeWidths[index] - 10, 20),
    lineGap: 1,
  }) + 10));
  if (document.y + rowHeight > document.page.height - PAGE_MARGIN) {
    document.addPage();
    if (!header) document.y = PAGE_MARGIN;
  }
  const top = document.y;
  const totalWidth = safeWidths.reduce((sum, width) => sum + width, 0);
  document.save();
  document.rect(PAGE_MARGIN, top, totalWidth, rowHeight)
    .fillAndStroke(header ? BRAND_GREEN_LIGHT : "#ffffff", BORDER_COLOR);
  document.restore();
  let left = PAGE_MARGIN;
  document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 7.5 : 7.5);
  safeCells.forEach((cell, index) => {
    document.fillColor(header ? BRAND_GREEN_DARK : BODY_COLOR)
      .text(cell, left + 5, top + 5, {
        width: Math.max(safeWidths[index] - 10, 20),
        height: rowHeight - 8,
        align: alignments[index] ?? "left",
        lineGap: 1,
      });
    if (index < safeCells.length - 1) {
      document.moveTo(left + safeWidths[index], top).lineTo(left + safeWidths[index], top + rowHeight)
        .strokeColor(BORDER_COLOR).stroke();
    }
    left += safeWidths[index];
  });
  document.y = top + rowHeight;
  document.font("Helvetica").fillColor(BODY_COLOR);
}

function addPageNumbers(document: PDFKit.PDFDocument): void {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index);
    document.fontSize(7).fillColor(MUTED_COLOR)
      .text(`Falancé · Halaman ${index - range.start + 1} dari ${range.count}`, PAGE_MARGIN, document.page.height - 26, {
        width: document.page.width - PAGE_MARGIN * 2,
        align: "right",
      });
  }
}

function formatAmount(amount: bigint, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}
