"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReportResponse = {
  familyName: string;
  viewer: { name: string; role: string };
  report: {
    period: { month: string | null; startDate: string; endDate: string; label: string };
    transactionCount: number;
    currencies: Array<{
      currency: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    transactions: Array<{
      transactionId: string;
      transactionType: "INCOME" | "EXPENSE";
      amountMinor: string;
      currency: string;
      transactionDate: string;
      description: string;
    }>;
  };
};

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export default function Home() {
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [printError, setPrintError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const initDataRef = useRef("");

  const loadReport = useCallback(async (selectedMonth: string, selectedStartDate: string, selectedEndDate: string) => {
    if (!initDataRef.current) {
      setError("Buka halaman ini dari Telegram Mini App agar akun dapat diverifikasi.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mini-app/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: initDataRef.current,
          month: selectedMonth || undefined,
          startDate: selectedStartDate || undefined,
          endDate: selectedEndDate || undefined,
        }),
      });
      const payload = await response.json() as ReportResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Laporan tidak dapat dimuat.");
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Laporan tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  const exportCsv = useCallback(async () => {
    if (!initDataRef.current || !data || (data.viewer.role !== "OWNER" && data.viewer.role !== "ADMIN")) return;
    setExporting(true);
    setExportError("");
    try {
      const response = await fetch("/api/mini-app/report/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: initDataRef.current,
          month: month || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Export tidak dapat dibuat.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "falance-report.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportLoadError) {
      setExportError(exportLoadError instanceof Error ? exportLoadError.message : "Export tidak dapat dibuat.");
    } finally {
      setExporting(false);
    }
  }, [data, endDate, month, startDate]);

  const printReport = useCallback(async () => {
    if (!initDataRef.current || !data || (data.viewer.role !== "OWNER" && data.viewer.role !== "ADMIN")) return;
    setPrinting(true);
    setPrintError("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setPrinting(false);
      setPrintError("Popup diblokir browser. Izinkan popup untuk membuka tampilan cetak.");
      return;
    }
    try {
      const response = await fetch("/api/mini-app/report/print", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData: initDataRef.current,
          month: month || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Tampilan cetak tidak dapat dibuat.");
      }
      const html = await response.text();
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    } catch (printLoadError) {
      printWindow.close();
      setPrintError(printLoadError instanceof Error ? printLoadError.message : "Tampilan cetak tidak dapat dibuat.");
    } finally {
      setPrinting(false);
    }
  }, [data, endDate, month, startDate]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      initDataRef.current = webApp.initData;
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor?.("#0f766e");
      webApp.setBackgroundColor?.("#f4fbfa");
    }
    void loadReport("", "", "");
  }, [loadReport]);

  return (
    <main className="min-h-screen bg-[#f4fbfa] px-4 pb-8 pt-5 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="rounded-3xl bg-[#0f766e] p-5 text-white shadow-lg shadow-teal-900/10">
          <p className="text-sm font-medium text-teal-100">Falancé Mini App</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Laporan keuangan</h1>
          <p className="mt-2 text-sm leading-6 text-teal-50">Ringkasan keluarga yang sedang aktif pada akun Telegram kamu.</p>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-sm font-semibold text-slate-700" htmlFor="report-month">Periode laporan</label>
          <div className="mt-2 flex gap-2">
            <input
              id="report-month"
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setStartDate("");
                setEndDate("");
              }}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <button
              type="button"
              onClick={() => void loadReport(month, startDate, endDate)}
              disabled={loading}
              className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Memuat…" : "Tampilkan"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Kosongkan periode untuk menggunakan bulan berjalan.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Dari tanggal
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setMonth("");
                }}
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Sampai tanggal
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setMonth("");
                }}
                className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Pilih bulan atau rentang tanggal maksimal satu tahun.</p>
        </section>

        {error && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            {error}
          </section>
        )}

        {loading && !data && !error && (
          <section className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            Memuat laporan…
          </section>
        )}

        {data && (
          <>
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Keluarga</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{data.familyName}</h2>
                </div>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{data.viewer.role}</span>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700">{data.report.period.label}</p>
                <p className="mt-1 text-xs text-slate-500">{data.report.period.startDate} s/d {data.report.period.endDate}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-slate-600">{data.report.transactionCount} transaksi aktif</p>
                  {(data.viewer.role === "OWNER" || data.viewer.role === "ADMIN") && (
                    <>
                      <button
                        type="button"
                        onClick={() => void exportCsv()}
                        disabled={exporting || printing}
                        className="min-h-10 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {exporting ? "Menyiapkan CSV…" : "Unduh CSV"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void printReport()}
                        disabled={exporting || printing}
                        className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {printing ? "Menyiapkan cetak…" : "Tampilan cetak"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {(exportError || printError) && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                {exportError || printError}
              </section>
            )}

            {data.report.currencies.length === 0 ? (
              <section className="rounded-2xl bg-white p-6 text-center text-sm leading-6 text-slate-500 shadow-sm ring-1 ring-slate-200">
                Belum ada transaksi aktif pada periode ini.
              </section>
            ) : (
              <section className="grid gap-4">
                {data.report.currencies.map((summary) => (
                  <article key={summary.currency} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900">{summary.currency}</h3>
                      <span className="text-xs text-slate-500">{summary.transactionCount} transaksi</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                      <Metric label="Pemasukan" value={formatAmount(summary.incomeMinor, summary.currency)} tone="positive" />
                      <Metric label="Pengeluaran" value={formatAmount(summary.expenseMinor, summary.currency)} tone="negative" />
                      <Metric label="Saldo" value={formatAmount(summary.netMinor, summary.currency)} tone="neutral" />
                    </dl>
                  </article>
                ))}
              </section>
            )}

            {data.report.transactions.length > 0 && (
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Transaksi terbaru</h2>
                  <span className="text-xs text-slate-500">Maksimal 50</span>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {data.report.transactions.map((transaction) => (
                    <article key={transaction.transactionId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{transaction.description}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDisplayDate(transaction.transactionDate)} · {transaction.currency}</p>
                        </div>
                        <p className={`shrink-0 text-sm font-bold ${transaction.transactionType === "INCOME" ? "text-emerald-700" : "text-rose-700"}`}>
                          {transaction.transactionType === "INCOME" ? "+" : "−"}{formatAmount(transaction.amountMinor, transaction.currency)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" | "neutral" }) {
  const color = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function formatAmount(value: string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(BigInt(value))}`;
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
