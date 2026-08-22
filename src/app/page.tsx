"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReportAction = { url: string; fileName: string };
type NavKey = "home" | "transactions" | "reports" | "account";
type TransactionFilter = "ALL" | "INCOME" | "EXPENSE";

type ReportResponse = {
  familyName: string;
  viewer: { name: string; role: string };
  actions?: { csv: ReportAction; pdf: ReportAction; print: ReportAction };
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

type AccountResponse = {
  viewer: { name: string; username: string | null; role: string; avatarUrl: string | null; avatarFallbackUrl: string | null };
  family: { familyName: string; status: string; plan: string; activeMemberCount: number };
  members: Array<{ name: string; username: string | null; role: string; joinedAt: string }>;
};

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const navItems: Array<{ key: NavKey; label: string; icon: string }> = [
  { key: "home", label: "Beranda", icon: "⌂" },
  { key: "transactions", label: "Transaksi", icon: "▤" },
  { key: "reports", label: "Laporan", icon: "▥" },
  { key: "account", label: "Akun", icon: "♙" },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavKey>("home");
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("ALL");
  const [selectedTransaction, setSelectedTransaction] = useState<ReportResponse["report"]["transactions"][number] | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<ReportResponse["report"]["transactions"][number] | null>(null);
  const [voidConfirmation, setVoidConfirmation] = useState<{ transactionId: string; expiresAt: string } | null>(null);
  const [transactionAction, setTransactionAction] = useState<"request-void" | "confirm-void" | "cancel-void" | null>(null);
  const [transactionActionError, setTransactionActionError] = useState("");
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [accountData, setAccountData] = useState<AccountResponse | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [comparison, setComparison] = useState<ReportResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [printError, setPrintError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [formInitData, setFormInitData] = useState("");
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
      setComparison(null);
      const previousPeriod = getPreviousPeriodInput(payload.report.period);
      if (previousPeriod) {
        setComparisonLoading(true);
        void fetch("/api/mini-app/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: initDataRef.current, ...previousPeriod }),
        }).then(async (comparisonResponse) => {
          if (!comparisonResponse.ok) return null;
          return await comparisonResponse.json() as ReportResponse;
        }).then((comparisonPayload) => {
          if (comparisonPayload) setComparison(comparisonPayload);
        }).catch(() => {
          setComparison(null);
        }).finally(() => setComparisonLoading(false));
      }
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Laporan tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccount = useCallback(async () => {
    if (!initDataRef.current) {
      setAccountError("Buka halaman ini dari Telegram Mini App agar akun dapat diverifikasi.");
      return;
    }
    setAccountLoading(true);
    setAccountError("");
    try {
      const response = await fetch("/api/mini-app/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initDataRef.current }),
      });
      const payload = await response.json() as AccountResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Akun tidak dapat dimuat.");
      setAccountData(payload);
    } catch (accountLoadError) {
      setAccountData(null);
      setAccountError(accountLoadError instanceof Error ? accountLoadError.message : "Akun tidak dapat dimuat.");
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const selectNav = useCallback((key: NavKey) => {
    setActiveNav(key);
    setNotice("");
    if (key === "account") void loadAccount();
  }, [loadAccount]);

  const openAddTransaction = useCallback(() => {
    const currentInitData = initDataRef.current || window.Telegram?.WebApp?.initData || "";
    if (!currentInitData) {
      setNotice("Buka halaman ini dari Telegram Mini App agar transaksi dapat disimpan.");
      return;
    }
    setFormInitData(currentInitData);
    setNotice("");
    setAddTransactionOpen(true);
  }, []);

  const handleTransactionSaved = useCallback((message: string) => {
    setAddTransactionOpen(false);
    setEditingTransaction(null);
    setSelectedTransaction(null);
    setActiveNav("transactions");
    setNotice(message);
    void loadReport(month, startDate, endDate);
  }, [endDate, loadReport, month, startDate]);

  const openEditTransaction = useCallback((transaction: ReportResponse["report"]["transactions"][number]) => {
    const currentInitData = initDataRef.current || window.Telegram?.WebApp?.initData || "";
    if (!currentInitData) {
      setNotice("Buka halaman ini dari Telegram Mini App agar transaksi dapat diperbarui.");
      return;
    }
    setFormInitData(currentInitData);
    setSelectedTransaction(null);
    setTransactionActionError("");
    setEditingTransaction(transaction);
  }, []);

  const requestTransactionVoid = useCallback(async (transactionId: string) => {
    setTransactionAction("request-void");
    setTransactionActionError("");
    try {
      const response = await fetch("/api/mini-app/transaction/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initDataRef.current, action: "REQUEST", transactionId }),
      });
      const payload = await response.json() as { error?: string; confirmation?: { expiresAt?: string } };
      if (!response.ok) throw new Error(payload.error || "Konfirmasi void tidak dapat dibuat.");
      setVoidConfirmation({ transactionId, expiresAt: payload.confirmation?.expiresAt ?? "" });
    } catch (error) {
      setTransactionActionError(error instanceof Error ? error.message : "Konfirmasi void tidak dapat dibuat.");
    } finally {
      setTransactionAction(null);
    }
  }, []);

  const confirmTransactionVoid = useCallback(async () => {
    if (!voidConfirmation) return;
    setTransactionAction("confirm-void");
    setTransactionActionError("");
    try {
      const response = await fetch("/api/mini-app/transaction/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initDataRef.current, action: "CONFIRM" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Transaksi tidak dapat di-void.");
      setVoidConfirmation(null);
      setSelectedTransaction(null);
      setNotice("Transaksi berhasil di-void dan daftar transaksi sedang diperbarui.");
      void loadReport(month, startDate, endDate);
    } catch (error) {
      setTransactionActionError(error instanceof Error ? error.message : "Transaksi tidak dapat di-void.");
    } finally {
      setTransactionAction(null);
    }
  }, [endDate, loadReport, month, startDate, voidConfirmation]);

  const cancelTransactionVoid = useCallback(async () => {
    if (!voidConfirmation) return;
    setTransactionAction("cancel-void");
    setTransactionActionError("");
    try {
      const response = await fetch("/api/mini-app/transaction/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: initDataRef.current, action: "CANCEL" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Konfirmasi void tidak dapat dibatalkan.");
      setVoidConfirmation(null);
    } catch (error) {
      setTransactionActionError(error instanceof Error ? error.message : "Konfirmasi void tidak dapat dibatalkan.");
    } finally {
      setTransactionAction(null);
    }
  }, [voidConfirmation]);

  const exportCsv = useCallback(() => {
    const action = data?.actions?.csv;
    if (!initDataRef.current || !action || data.viewer.role === "MEMBER") return;
    setExporting(true);
    setExportError("");
    try {
      requestTelegramDownload(action, (message) => {
        setExporting(false);
        if (message) setExportError(message);
      });
      window.setTimeout(() => setExporting(false), 10_000);
    } catch (exportLoadError) {
      setExporting(false);
      setExportError(exportLoadError instanceof Error ? exportLoadError.message : "Export tidak dapat dibuat.");
    }
  }, [data]);

  const printReport = useCallback(() => {
    const action = data?.actions?.print;
    if (!initDataRef.current || !action || data.viewer.role === "MEMBER") return;
    setPrinting(true);
    setPrintError("");
    try {
      requestTelegramPrint(action.url);
      setPrinting(false);
    } catch (printLoadError) {
      setPrinting(false);
      setPrintError(printLoadError instanceof Error ? printLoadError.message : "Tampilan cetak tidak dapat dibuat.");
    }
  }, [data]);

  const exportPdf = useCallback(async () => {
    const action = data?.actions?.pdf;
    if (!initDataRef.current || !action || data.viewer.role === "MEMBER") return;
    setPdfExporting(true);
    setPdfError("");
    try {
      let downloadAction = action;
      if (pdfPassword) {
        const response = await fetch("/api/mini-app/report/pdf/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            initData: initDataRef.current,
            month: data.report.period.month || undefined,
            startDate: data.report.period.month ? undefined : data.report.period.startDate,
            endDate: data.report.period.month ? undefined : data.report.period.endDate,
            password: pdfPassword,
          }),
        });
        const payload = await response.json() as { action?: ReportAction; error?: string };
        if (!response.ok || !payload.action) throw new Error(payload.error || "PDF tidak dapat dibuat.");
        downloadAction = payload.action;
      }
      requestTelegramDownload(downloadAction, (message) => {
        setPdfExporting(false);
        if (message) setPdfError(message);
      });
      setPdfPassword("");
      window.setTimeout(() => setPdfExporting(false), 10_000);
    } catch (pdfLoadError) {
      setPdfExporting(false);
      setPdfError(pdfLoadError instanceof Error ? pdfLoadError.message : "PDF tidak dapat dibuat.");
    }
  }, [data, pdfPassword]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp) {
      initDataRef.current = webApp.initData;
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor?.("#267a5a");
      webApp.setBackgroundColor?.("#fafbf8");
    }
    void loadReport("", "", "");
  }, [loadReport]);

  return (
    <main className="min-h-screen bg-[var(--app-background)] px-4 pb-28 pt-4 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 lg:max-w-5xl">
        <AppHeader data={data} activeNav={activeNav} onSelectNav={selectNav} />

        {notice && (
          <section role="status" className="rounded-2xl border border-[var(--brand-purple-100)] bg-[var(--brand-purple-100)] px-4 py-3 text-sm leading-5 text-[var(--brand-purple-800)]">
            {notice}
          </section>
        )}

        {error && activeNav !== "account" && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            {error}
          </section>
        )}

        {loading && !data && !error && <LoadingState />}

        {data && activeNav === "home" && (
          <HomeView data={data} onAddTransaction={openAddTransaction} onSelectReports={() => selectNav("reports")} onSelectTransactions={() => selectNav("transactions")} />
        )}

        {data && activeNav === "reports" && (
          <ReportsView
            data={data}
            comparison={comparison}
            comparisonLoading={comparisonLoading}
            month={month}
            startDate={startDate}
            endDate={endDate}
            loading={loading}
            onMonthChange={(value) => {
              setMonth(value);
              setStartDate("");
              setEndDate("");
            }}
            onStartDateChange={(value) => {
              setStartDate(value);
              setMonth("");
            }}
            onEndDateChange={(value) => {
              setEndDate(value);
              setMonth("");
            }}
            onLoad={() => void loadReport(month, startDate, endDate)}
            exporting={exporting}
            printing={printing}
            pdfExporting={pdfExporting}
            pdfPassword={pdfPassword}
            setPdfPassword={setPdfPassword}
            exportError={exportError}
            printError={printError}
            pdfError={pdfError}
            onExportCsv={exportCsv}
            onPrint={printReport}
            onExportPdf={() => void exportPdf()}
          />
        )}

        {data && activeNav === "transactions" && (
          <TransactionsView
            data={data}
            filter={transactionFilter}
            onFilterChange={setTransactionFilter}
            onSelectTransaction={setSelectedTransaction}
          />
        )}

        {activeNav === "account" && accountLoading && !accountData && <LoadingState />}

        {activeNav === "account" && accountError && <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{accountError}</section>}

        {accountData && activeNav === "account" && <AccountView data={accountData} onRetry={() => void loadAccount()} /> }

        {!data && !loading && !error && <PlaceholderView title="Belum ada data" description="Belum ada ringkasan yang dapat ditampilkan untuk periode ini." actionLabel="Coba lagi" onAction={() => void loadReport(month, startDate, endDate)} />}

        {selectedTransaction && <TransactionDetail transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} onEdit={() => openEditTransaction(selectedTransaction)} onRequestVoid={() => void requestTransactionVoid(selectedTransaction.transactionId)} voidConfirmation={voidConfirmation} transactionAction={transactionAction} transactionActionError={transactionActionError} onConfirmVoid={() => void confirmTransactionVoid()} onCancelVoid={() => void cancelTransactionVoid()} />}
        {addTransactionOpen && <AddTransactionForm initData={formInitData} onClose={() => setAddTransactionOpen(false)} onSaved={() => handleTransactionSaved("Transaksi berhasil dicatat dan daftar transaksi sedang diperbarui.")} />}
        {editingTransaction && <AddTransactionForm key={editingTransaction.transactionId} initData={formInitData} transaction={editingTransaction} onClose={() => setEditingTransaction(null)} onSaved={() => handleTransactionSaved("Transaksi berhasil diperbarui dan daftar transaksi sedang diperbarui.")} />}
      </div>

      <BottomNavigation activeNav={activeNav} onSelect={selectNav} onAddTransaction={openAddTransaction} />
    </main>
  );
}

function AppHeader({ data, activeNav, onSelectNav }: { data: ReportResponse | null; activeNav: NavKey; onSelectNav: (key: NavKey) => void }) {
  return (
    <header className="app-header rounded-[24px] p-5 text-white shadow-[0_8px_28px_rgba(38,122,90,0.18)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={() => onSelectNav("home")} className="group text-left" aria-label="Buka Beranda Falancé">
          <div className="flex items-center gap-2">
            <span className="brand-mark" aria-hidden="true">F</span>
            <span className="text-base font-bold tracking-tight">Falancé</span>
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Family finance, made simple</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{activeNav === "home" ? "Beranda keluarga" : navItems.find((item) => item.key === activeNav)?.label}</h1>
        </button>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-50">{data?.viewer.role || "Mini App"}</span>
      </div>
      <p className="mt-3 max-w-md text-sm leading-6 text-emerald-50">Ringkasan keuangan keluarga yang sedang aktif pada akun Telegram kamu.</p>
    </header>
  );
}

function HomeView({ data, onAddTransaction, onSelectReports, onSelectTransactions }: { data: ReportResponse; onAddTransaction: () => void; onSelectReports: () => void; onSelectTransactions: () => void }) {
  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-700)]">Keluarga aktif</p>
            <h2 className="mt-1 text-xl font-bold">{data.familyName}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{data.report.period.label}</p>
          </div>
          <span className="rounded-full bg-[var(--brand-green-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-green-700)]">{data.viewer.role}</span>
        </div>
      </section>

      <section className="rounded-2xl bg-[var(--brand-green-700)] p-5 text-white shadow-[0_8px_24px_rgba(38,122,90,0.16)]" aria-labelledby="home-summary-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Ringkasan periode</p>
            <h2 id="home-summary-title" className="mt-1 text-lg font-bold">Kondisi keuangan</h2>
          </div>
          <button type="button" onClick={onSelectReports} className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70">Lihat laporan</button>
        </div>
        {data.report.currencies.length === 0 ? (
          <p className="mt-6 rounded-xl bg-white/10 p-4 text-sm leading-6 text-emerald-50">Belum ada transaksi aktif pada periode ini.</p>
        ) : (
          <div className="mt-5 grid gap-3">
            {data.report.currencies.map((summary) => (
              <div key={summary.currency} className="rounded-xl bg-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-emerald-50">Saldo {summary.currency}</span>
                  <span className="text-xl font-bold tracking-tight">{formatAmount(summary.netMinor, summary.currency)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white/10 p-2"><span className="block text-emerald-100">Pemasukan</span><strong className="mt-1 block text-sm">{formatAmount(summary.incomeMinor, summary.currency)}</strong></div>
                  <div className="rounded-lg bg-[var(--brand-coral-500)]/80 p-2"><span className="block text-white/80">Pengeluaran</span><strong className="mt-1 block text-sm">{formatAmount(summary.expenseMinor, summary.currency)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onAddTransaction} className="primary-action flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-white shadow-[0_6px_18px_rgba(38,122,90,0.18)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2"><span className="text-xl leading-none">+</span> Tambah transaksi</button>
        <button type="button" onClick={onSelectTransactions} className="min-h-14 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--brand-green-700)] shadow-[var(--card-shadow)] transition hover:border-[var(--brand-green-500)] hover:bg-[var(--brand-green-50)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2">Daftar transaksi</button>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Aktivitas</p>
            <h2 className="mt-1 text-lg font-bold">Transaksi terbaru</h2>
          </div>
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-secondary)]">{data.report.transactionCount} aktif</span>
        </div>
        {data.report.transactions.length === 0 ? (
          <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Belum ada transaksi aktif. Mulai dengan mencatat pemasukan atau pengeluaran keluarga.</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border)]">
            {data.report.transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} />)}
          </div>
        )}
      </section>
    </>
  );
}

function AddTransactionForm({ initData, transaction, onClose, onSaved }: { initData: string; transaction?: ReportResponse["report"]["transactions"][number]; onClose: () => void; onSaved: () => void }) {
  const isEditing = Boolean(transaction);
  const [transactionType, setTransactionType] = useState<TransactionFilter>(transaction?.transactionType ?? "EXPENSE");
  const [amountMinor, setAmountMinor] = useState(transaction?.amountMinor ?? "");
  const [currency, setCurrency] = useState(transaction?.currency ?? "IDR");
  const [transactionDate, setTransactionDate] = useState(transaction?.transactionDate ?? "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/mini-app/transaction", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData, ...(transaction ? { transactionId: transaction.transactionId } : {}), transactionType, amountMinor, currency, transactionDate, description }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || (isEditing ? "Transaksi tidak dapat diperbarui." : "Transaksi tidak dapat dicatat."));
      onSaved();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Transaksi tidak dapat dicatat.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(19,35,27,0.46)] p-0 sm:items-center sm:p-4" role="presentation">
      <section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-labelledby="add-transaction-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-700)]">{isEditing ? "Edit transaksi" : "Input transaksi"}</p>
            <h2 id="add-transaction-title" className="mt-1 text-2xl font-bold">{isEditing ? "Perbarui transaksi" : "Tambah transaksi"}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Catat transaksi aktual keluarga. Kategori dan metode pembayaran belum tersedia pada schema saat ini.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-xl text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]" aria-label="Tutup form">×</button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[var(--surface-soft)] p-1">
            <button type="button" onClick={() => setTransactionType("EXPENSE")} className={`min-h-11 rounded-xl text-sm font-bold transition ${transactionType === "EXPENSE" ? "bg-[var(--brand-coral-500)] text-white shadow-sm" : "text-[var(--text-secondary)]"}`}>Pengeluaran</button>
            <button type="button" onClick={() => setTransactionType("INCOME")} className={`min-h-11 rounded-xl text-sm font-bold transition ${transactionType === "INCOME" ? "bg-[var(--brand-green-600)] text-white shadow-sm" : "text-[var(--text-secondary)]"}`}>Pemasukan</button>
          </div>

          <label className="block text-sm font-semibold">Jumlah
            <input required value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} inputMode="numeric" pattern="[0-9.,]+" placeholder="Contoh: 150000" className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 text-lg font-semibold outline-none transition focus:border-[var(--brand-green-500)] focus:ring-2 focus:ring-[var(--brand-green-100)]" />
            <span className="mt-1 block text-xs font-normal text-[var(--text-secondary)]">Masukkan angka bulat dalam unit terkecil currency.</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Currency
              <input required maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="IDR" className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 font-semibold uppercase outline-none transition focus:border-[var(--brand-green-500)] focus:ring-2 focus:ring-[var(--brand-green-100)]" />
            </label>
            <label className="block text-sm font-semibold">Tanggal
              <input required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border)] bg-white px-3 font-semibold outline-none transition focus:border-[var(--brand-green-500)] focus:ring-2 focus:ring-[var(--brand-green-100)]" />
            </label>
          </div>

          <label className="block text-sm font-semibold">Deskripsi
            <textarea required maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contoh: Belanja kebutuhan rumah" rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--brand-green-500)] focus:ring-2 focus:ring-[var(--brand-green-100)]" />
          </label>

          {submitError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">{submitError}</p>}
            <button type="submit" disabled={submitting} className="primary-action min-h-12 w-full rounded-xl border-2 border-[var(--brand-green-700)] bg-[var(--brand-green-700)] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(38,122,90,0.28)] transition hover:bg-[var(--brand-green-800)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60">{submitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Simpan transaksi"}</button>
        </form>
      </section>
    </div>
  );
}

function AccountView({ data, onRetry }: { data: AccountResponse; onRetry: () => void }) {
  const roleLabel = data.viewer.role === "OWNER" ? "Owner keluarga" : data.viewer.role === "ADMIN" ? "Admin keluarga" : "Member keluarga";
  const permissionText = data.viewer.role === "OWNER"
    ? "Kamu dapat mengelola anggota, undangan, role, dan pengaturan keluarga melalui alur yang tervalidasi."
    : data.viewer.role === "ADMIN"
      ? "Kamu dapat membantu mengelola undangan dan melihat kondisi keluarga sesuai role yang diberikan."
      : "Kamu dapat melihat data keluarga dan membuat transaksi melalui fitur yang tersedia.";

  return <>
    <section className="overflow-hidden rounded-2xl bg-[var(--brand-green-700)] text-white shadow-[0_8px_24px_rgba(38,122,90,0.16)]"><div className="p-5"><div className="flex items-center gap-4"><UserAvatar key={`${data.viewer.avatarUrl ?? ""}:${data.viewer.avatarFallbackUrl ?? ""}`} name={data.viewer.name} avatarUrl={data.viewer.avatarUrl} avatarFallbackUrl={data.viewer.avatarFallbackUrl} size="large" /><div className="min-w-0"><p className="truncate text-xl font-bold">{data.viewer.name}</p><p className="mt-1 text-sm text-emerald-100">{roleLabel}{data.viewer.username ? ` · @${data.viewer.username}` : ""}</p></div></div></div><div className="border-t border-white/15 bg-white/10 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Konteks akses</p><p className="mt-1 text-sm leading-6 text-white/90">{permissionText}</p></div></section>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Keluarga aktif</p><h2 className="mt-1 text-xl font-bold">{data.family.familyName}</h2></div><span className="rounded-full bg-[var(--brand-green-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-green-700)]">{data.family.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-xs text-[var(--text-secondary)]">Anggota aktif</p><p className="mt-1 text-2xl font-bold text-[var(--brand-green-700)]">{data.family.activeMemberCount}</p></div><div className="rounded-xl bg-[var(--surface-soft)] p-3"><p className="text-xs text-[var(--text-secondary)]">Plan</p><p className="mt-1 text-lg font-bold">{data.family.plan}</p></div></div></section>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Family workspace</p><h2 className="mt-1 text-lg font-bold">Anggota keluarga</h2></div><span className="text-xs text-[var(--text-secondary)]">{data.members.length} aktif</span></div><div className="mt-4 divide-y divide-[var(--border)]">{data.members.map((member) => <div key={`${member.name}-${member.joinedAt}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><UserAvatar name={member.name} size="small" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{member.username ? `@${member.username}` : "Tanpa username"}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${member.role === "OWNER" ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : member.role === "ADMIN" ? "bg-[var(--brand-purple-100)] text-[var(--brand-purple-800)]" : "bg-[var(--surface-soft)] text-[var(--text-secondary)]"}`}>{member.role}</span></div>)}</div></section>

    <section className="rounded-2xl border border-dashed border-[var(--brand-green-500)] bg-[var(--brand-green-50)] p-4"><p className="text-sm font-semibold text-[var(--brand-green-700)]">Pengaturan keluarga</p><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Undangan, perubahan role, dan lifecycle anggota akan ditambahkan melalui endpoint terotorisasi pada slice lanjutan.</p><button type="button" onClick={onRetry} className="mt-3 min-h-10 rounded-xl border border-[var(--brand-green-500)] bg-white px-3 text-xs font-semibold text-[var(--brand-green-700)] transition hover:bg-[var(--brand-green-100)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]">Muat ulang data</button></section>
  </>;
}

function getInitials(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return initials || "F";
}

function UserAvatar({ name, avatarUrl, avatarFallbackUrl, size = "small" }: { name: string; avatarUrl?: string | null; avatarFallbackUrl?: string | null; size?: "small" | "large" }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const sizeClass = size === "large" ? "h-14 w-14 text-xl" : "h-9 w-9 text-xs";
  const fallbackClass = size === "large" ? "bg-white/90 text-[var(--brand-green-700)]" : "bg-[var(--brand-purple-100)] text-[var(--brand-purple-800)]";
  const imageSource = avatarUrl && !primaryFailed ? avatarUrl : avatarFallbackUrl && !fallbackFailed ? avatarFallbackUrl : null;
  if (imageSource) {
    // Telegram profile URLs are dynamic and may be direct CDN URLs or our signed proxy.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageSource} alt={`Avatar ${name}`} referrerPolicy="no-referrer" onError={() => {
      if (imageSource === avatarUrl) setPrimaryFailed(true);
      else setFallbackFailed(true);
    }} className={`${sizeClass} shrink-0 rounded-full object-cover`} />;
  }
  return <div aria-hidden="true" className={`grid ${sizeClass} shrink-0 place-items-center rounded-full font-bold ${fallbackClass}`}>{getInitials(name)}</div>;
}

function TransactionsView({ data, filter, onFilterChange, onSelectTransaction }: { data: ReportResponse; filter: TransactionFilter; onFilterChange: (value: TransactionFilter) => void; onSelectTransaction: (transaction: ReportResponse["report"]["transactions"][number]) => void }) {
  const transactions = filter === "ALL" ? data.report.transactions : data.report.transactions.filter((transaction) => transaction.transactionType === filter);
  const grouped = transactions.reduce<Record<string, ReportResponse["report"]["transactions"]>>((groups, transaction) => {
    groups[transaction.transactionDate] ??= [];
    groups[transaction.transactionDate].push(transaction);
    return groups;
  }, {});

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Workspace</p><h2 className="mt-1 text-xl font-bold">Transaksi</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{data.report.period.label}</p></div>
        <span className="rounded-full bg-[var(--brand-green-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-green-700)]">Read-only</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-soft)] p-1" role="group" aria-label="Filter tipe transaksi">
        {(["ALL", "INCOME", "EXPENSE"] as const).map((value) => {
          const label = value === "ALL" ? "Semua" : value === "INCOME" ? "Pemasukan" : "Pengeluaran";
          return <button key={value} type="button" onClick={() => onFilterChange(value)} aria-pressed={filter === value} className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] ${filter === value ? "bg-[var(--brand-green-700)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--surface)]"}`}>{label}</button>;
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--text-secondary)]">Menampilkan maksimal 50 transaksi aktif dari periode yang dipilih.</p>
      {transactions.length === 0 ? (
        <div className="mt-5 rounded-xl bg-[var(--surface-soft)] p-5 text-center"><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand-purple-100)] font-bold text-[var(--brand-purple-600)]">F</div><p className="mt-3 text-sm font-semibold">Belum ada transaksi</p><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Tidak ada transaksi yang cocok dengan filter ini.</p></div>
      ) : (
        <div className="mt-5 space-y-5">{Object.entries(grouped).map(([date, dateTransactions]) => <div key={date}><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{formatLongDate(date)}</h3><div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-3">{dateTransactions.map((transaction) => <button key={transaction.transactionId} type="button" onClick={() => onSelectTransaction(transaction)} className="flex w-full items-start justify-between gap-3 py-3 text-left transition first:pt-3 last:pb-3 hover:bg-[var(--brand-green-50)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-green-500)]"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${transaction.transactionType === "INCOME" ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : "bg-[var(--brand-coral-100)] text-[#C85A4D]"}`} aria-hidden="true">{transaction.transactionType === "INCOME" ? "↑" : "↓"}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{transaction.description}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran"} · {transaction.currency}</p></div></div><p className={`shrink-0 text-sm font-bold ${transaction.transactionType === "INCOME" ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]"}`}>{transaction.transactionType === "INCOME" ? "+" : "−"}{formatAmount(transaction.amountMinor, transaction.currency)}</p></button>)}</div></div>)}</div>
      )}
      {data.report.transactions.length === 50 && <p className="mt-4 rounded-xl bg-[var(--brand-purple-100)] p-3 text-xs leading-5 text-[var(--brand-purple-800)]">Daftar ini dibatasi 50 transaksi. Pagination untuk histori yang lebih besar akan ditambahkan pada slice lanjutan.</p>}
    </section>
  );
}

function TransactionDetail({ transaction, onClose, onEdit, onRequestVoid, voidConfirmation, transactionAction, transactionActionError, onConfirmVoid, onCancelVoid }: {
  transaction: ReportResponse["report"]["transactions"][number];
  onClose: () => void;
  onEdit: () => void;
  onRequestVoid: () => void;
  voidConfirmation: { transactionId: string; expiresAt: string } | null;
  transactionAction: "request-void" | "confirm-void" | "cancel-void" | null;
  transactionActionError: string;
  onConfirmVoid: () => void;
  onCancelVoid: () => void;
}) {
  const confirmingThisTransaction = voidConfirmation?.transactionId === transaction.transactionId;
  const actionInProgress = transactionAction !== null;
  return <div className="fixed inset-0 z-30 flex items-end justify-center bg-[rgba(34,48,41,0.38)] p-0 sm:items-center sm:p-4" role="presentation" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title" className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5 shadow-[0_12px_40px_rgba(20,40,25,0.18)] sm:rounded-3xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Detail transaksi</p><h2 id="transaction-detail-title" className="mt-1 text-xl font-bold">{transaction.description}</h2></div><button type="button" onClick={onClose} aria-label="Tutup detail transaksi" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-soft)] text-xl text-[var(--text-secondary)] transition hover:bg-[var(--brand-green-100)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]">×</button></div><div className="mt-5 rounded-2xl bg-[var(--surface-soft)] p-4"><p className={`text-2xl font-bold ${transaction.transactionType === "INCOME" ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]"}`}>{transaction.transactionType === "INCOME" ? "+" : "−"}{formatAmount(transaction.amountMinor, transaction.currency)}</p><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--text-secondary)]">Jenis</dt><dd className="font-semibold">{transaction.transactionType === "INCOME" ? "Pemasukan" : "Pengeluaran"}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--text-secondary)]">Tanggal</dt><dd className="font-semibold">{formatLongDate(transaction.transactionDate)}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--text-secondary)]">Transaction ID</dt><dd className="max-w-[55%] break-all text-right font-mono text-xs font-semibold">{transaction.transactionId}</dd></div></dl></div><p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">Edit memperbarui transaksi aktif. Void mengubah status menjadi VOID dan memerlukan konfirmasi eksplisit yang tersimpan di server.</p>{transactionActionError && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">{transactionActionError}</p>}{confirmingThisTransaction ? <div className="mt-4 rounded-2xl border border-[var(--brand-coral-500)] bg-[var(--brand-coral-100)] p-4"><p className="text-sm font-bold text-[#9F3D34]">Void transaksi ini?</p><p className="mt-1 text-xs leading-5 text-[#9F3D34]">Status transaksi akan berubah menjadi VOID dan tidak lagi dihitung dalam saldo. Konfirmasi berlaku selama 5 menit.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={onCancelVoid} disabled={actionInProgress} className="min-h-11 rounded-xl border border-[#C85A4D] bg-white px-3 text-sm font-semibold text-[#9F3D34] disabled:opacity-60">Batal</button><button type="button" onClick={onConfirmVoid} disabled={actionInProgress} className="min-h-11 rounded-xl bg-[#B94B40] px-3 text-sm font-bold text-white shadow-sm disabled:cursor-wait disabled:opacity-60">{transactionAction === "confirm-void" ? "Memproses..." : "Ya, void"}</button></div></div> : <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={onEdit} className="min-h-11 rounded-xl border border-[var(--brand-green-700)] bg-[var(--brand-green-100)] px-3 text-sm font-bold text-[var(--brand-green-700)] transition hover:bg-[var(--brand-green-500)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]">Edit transaksi</button><button type="button" onClick={onRequestVoid} disabled={actionInProgress} className="min-h-11 rounded-xl border border-[#B94B40] bg-[var(--brand-coral-100)] px-3 text-sm font-bold text-[#9F3D34] transition hover:bg-[#F9D6D1] focus:outline-none focus:ring-2 focus:ring-[var(--brand-coral-500)] disabled:cursor-wait disabled:opacity-60">{transactionAction === "request-void" ? "Menyiapkan..." : "Void transaksi"}</button></div>}<button type="button" onClick={onClose} className="mt-3 min-h-11 w-full rounded-xl bg-[var(--brand-green-700)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-green-800)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2">Tutup</button></section></div>;
}

function ComparisonSummary({ current, previous }: { current: ReportResponse; previous: ReportResponse }) {
  const previousByCurrency = new Map(previous.report.currencies.map((summary) => [summary.currency, summary]));
  const currencies = current.report.currencies.filter((summary) => previousByCurrency.has(summary.currency));
  if (currencies.length === 0) return <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Belum ada mata uang yang dapat dibandingkan dengan periode sebelumnya.</p>;
  return <div className="mt-4 space-y-3"><p className="text-xs text-[var(--text-secondary)]">Perubahan dihitung per mata uang dari laporan server-side. Tidak ada konversi antar mata uang.</p>{currencies.map((summary) => { const prior = previousByCurrency.get(summary.currency); if (!prior) return null; return <article key={summary.currency} className="rounded-xl bg-[var(--surface-soft)] p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{summary.currency}</h3><span className="text-xs text-[var(--text-secondary)]">{previous.report.period.label}</span></div><div className="mt-3 grid grid-cols-2 gap-3"><ComparisonMetric label="Pemasukan" current={summary.incomeMinor} previous={prior.incomeMinor} currency={summary.currency} positiveIsGood /><ComparisonMetric label="Pengeluaran" current={summary.expenseMinor} previous={prior.expenseMinor} currency={summary.currency} positiveIsGood={false} /></div></article>; })}</div>;
}

function ComparisonMetric({ label, current, previous, currency, positiveIsGood }: { label: string; current: string; previous: string; currency: string; positiveIsGood: boolean }) {
  const currentValue = BigInt(current);
  const previousValue = BigInt(previous);
  const delta = currentValue - previousValue;
  const direction = delta === BigInt(0) ? "Sama" : delta > BigInt(0) ? "Naik" : "Turun";
  const tone = delta === BigInt(0) ? "text-[var(--text-secondary)]" : (delta > BigInt(0)) === positiveIsGood ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]";
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"><p className="text-xs text-[var(--text-secondary)]">{label}</p><p className="mt-1 text-sm font-bold">{formatAmount(current, currency)}</p><p className={`mt-1 text-xs font-semibold ${tone}`}>{direction} {formatSignedAmount(delta, currency)} dari periode lalu</p></div>;
}

function ReportsView({ data, comparison, comparisonLoading, month, startDate, endDate, loading, onMonthChange, onStartDateChange, onEndDateChange, onLoad, exporting, printing, pdfExporting, pdfPassword, setPdfPassword, exportError, printError, pdfError, onExportCsv, onPrint, onExportPdf }: {
  data: ReportResponse;
  comparison: ReportResponse | null;
  comparisonLoading: boolean;
  month: string;
  startDate: string;
  endDate: string;
  loading: boolean;
  onMonthChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onLoad: () => void;
  exporting: boolean;
  printing: boolean;
  pdfExporting: boolean;
  pdfPassword: string;
  setPdfPassword: (value: string) => void;
  exportError: string;
  printError: string;
  pdfError: string;
  onExportCsv: () => void;
  onPrint: () => void;
  onExportPdf: () => void;
}) {
  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-700)]">Laporan</p><h2 className="mt-1 text-xl font-bold">Pilih periode</h2></div><span className="rounded-full bg-[var(--brand-green-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-green-700)]">Read-only</span></div>
        <div className="mt-4 flex gap-2"><input aria-label="Pilih bulan laporan" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm outline-none transition focus:border-[var(--brand-green-600)] focus:ring-2 focus:ring-[var(--brand-green-100)]" /><button type="button" onClick={onLoad} disabled={loading} className="min-h-11 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-green-700)] disabled:cursor-wait disabled:opacity-60">{loading ? "Memuat…" : "Tampilkan"}</button></div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">Kosongkan bulan untuk menggunakan bulan berjalan.</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-[var(--text-secondary)]">Dari tanggal<input aria-label="Tanggal awal laporan" type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-normal outline-none transition focus:border-[var(--brand-green-600)] focus:ring-2 focus:ring-[var(--brand-green-100)]" /></label><label className="text-xs font-semibold text-[var(--text-secondary)]">Sampai tanggal<input aria-label="Tanggal akhir laporan" type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm font-normal outline-none transition focus:border-[var(--brand-green-600)] focus:ring-2 focus:ring-[var(--brand-green-100)]" /></label></div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">Pilih bulan atau rentang tanggal maksimal satu tahun.</p>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Ringkasan {data.report.period.label}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{data.report.currencies.map((summary) => <MetricCard key={summary.currency} summary={summary} />)}</div>
        {data.report.currencies.length === 0 && <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">Belum ada transaksi aktif pada periode ini.</p>}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Perbandingan</p><h2 className="mt-1 text-lg font-bold">Dibanding periode sebelumnya</h2></div><span className="rounded-full bg-[var(--brand-purple-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-purple-800)]">Insight dasar</span></div>
        {comparisonLoading ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /></div> : comparison ? <ComparisonSummary current={data} previous={comparison} /> : <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Perbandingan belum tersedia untuk periode ini.</p>}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Export laporan</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Tersedia untuk OWNER dan ADMIN. Member tetap dapat melihat laporan tanpa export.</p></div><span className="rounded-full bg-[var(--brand-coral-100)] px-3 py-1 text-xs font-semibold text-[#B94B40]">Role-safe</span></div>
        {(data.viewer.role === "OWNER" || data.viewer.role === "ADMIN") ? <><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onExportCsv} disabled={exporting || printing || pdfExporting} className="min-h-10 rounded-xl bg-[var(--brand-green-100)] px-3 text-xs font-semibold text-[var(--brand-green-700)] transition hover:bg-[var(--brand-green-500)]/30 disabled:cursor-wait disabled:opacity-60">{exporting ? "Menyiapkan CSV…" : "Unduh CSV"}</button><button type="button" onClick={onPrint} disabled={exporting || printing || pdfExporting} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand-green-500)] disabled:cursor-wait disabled:opacity-60">{printing ? "Menyiapkan cetak…" : "Tampilan cetak"}</button></div><details className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--text-primary)]">Unduh PDF (opsional password)</summary><div className="mt-3 space-y-3"><label className="block text-xs font-semibold text-[var(--text-secondary)]">Password PDF<input type="password" autoComplete="new-password" value={pdfPassword} maxLength={127} onChange={(event) => setPdfPassword(event.target.value)} placeholder="Kosongkan jika tanpa password" className="mt-1 min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-normal outline-none transition focus:border-[var(--brand-green-600)] focus:ring-2 focus:ring-[var(--brand-green-100)]" /></label><p className="text-xs leading-5 text-[var(--text-secondary)]">Jika diisi, gunakan minimal 8 karakter. Password hanya digunakan saat pembuatan PDF dan tidak disimpan.</p><button type="button" onClick={onExportPdf} disabled={exporting || printing || pdfExporting} className="min-h-10 rounded-xl bg-[var(--text-primary)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--brand-green-700)] disabled:cursor-wait disabled:opacity-60">{pdfExporting ? "Menyiapkan PDF…" : "Unduh PDF"}</button></div></details></> : <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Akun MEMBER hanya memiliki akses baca laporan.</p>}
        {(exportError || printError || pdfError) && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">{exportError || printError || pdfError}</p>}
      </section>

      {data.report.transactions.length > 0 && <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Detail transaksi</h2><span className="text-xs text-[var(--text-secondary)]">Maksimal 50</span></div><div className="mt-3 divide-y divide-[var(--border)]">{data.report.transactions.map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} />)}</div></section>}
    </>
  );
}

function MetricCard({ summary }: { summary: ReportResponse["report"]["currencies"][number] }) {
  return <article className="rounded-xl bg-[var(--surface-soft)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--text-secondary)]">{summary.currency}</span><span className="text-xs text-[var(--text-muted)]">{summary.transactionCount} transaksi</span></div><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">Masuk</dt><dd className="font-semibold text-[var(--brand-green-700)]">{formatAmount(summary.incomeMinor, summary.currency)}</dd></div><div className="flex justify-between gap-2"><dt className="text-[var(--text-secondary)]">Keluar</dt><dd className="font-semibold text-[#C85A4D]">{formatAmount(summary.expenseMinor, summary.currency)}</dd></div><div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2"><dt className="font-semibold">Saldo</dt><dd className="font-bold">{formatAmount(summary.netMinor, summary.currency)}</dd></div></dl></article>;
}

function TransactionRow({ transaction }: { transaction: ReportResponse["report"]["transactions"][number] }) {
  const isIncome = transaction.transactionType === "INCOME";
  return <article className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${isIncome ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : "bg-[var(--brand-coral-100)] text-[#C85A4D]"}`} aria-hidden="true">{isIncome ? "↑" : "↓"}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{transaction.description}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDisplayDate(transaction.transactionDate)} · {transaction.currency}</p></div></div><p className={`shrink-0 text-sm font-bold ${isIncome ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]"}`}>{isIncome ? "+" : "−"}{formatAmount(transaction.amountMinor, transaction.currency)}</p></article>;
}

function PlaceholderView({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return <section className="rounded-2xl border border-dashed border-[var(--brand-green-500)] bg-[var(--surface)] p-7 text-center shadow-[var(--card-shadow)]"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-green-100)] text-xl font-bold text-[var(--brand-green-700)]">F</div><h2 className="mt-4 text-xl font-bold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">{description}</p><button type="button" onClick={onAction} className="mt-5 min-h-11 rounded-xl bg-[var(--brand-green-700)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-green-600)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2">{actionLabel}</button></section>;
}

function LoadingState() {
  return <section aria-label="Memuat dashboard" className="space-y-3"><div className="skeleton h-32 rounded-2xl" /><div className="grid grid-cols-2 gap-3"><div className="skeleton h-14 rounded-2xl" /><div className="skeleton h-14 rounded-2xl" /></div><div className="skeleton h-52 rounded-2xl" /></section>;
}

function BottomNavigation({ activeNav, onSelect, onAddTransaction }: { activeNav: NavKey; onSelect: (key: NavKey) => void; onAddTransaction: () => void }) {
  return <nav aria-label="Navigasi Mini App" className="bottom-nav fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[color:var(--surface)]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 backdrop-blur sm:px-6"><div className="mx-auto grid max-w-[480px] grid-cols-5 items-end gap-1 lg:max-w-5xl"><NavButton item={navItems[0]} active={activeNav === "home"} onClick={() => onSelect("home")} /><NavButton item={navItems[1]} active={activeNav === "transactions"} onClick={() => onSelect("transactions")} /><button type="button" onClick={onAddTransaction} aria-label="Tambah transaksi" className="primary-fab mx-auto -mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-[var(--app-background)] bg-[var(--brand-green-700)] text-3xl font-light leading-none text-white shadow-[0_6px_20px_rgba(38,122,90,0.28)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-green-600)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]">+</button><NavButton item={navItems[2]} active={activeNav === "reports"} onClick={() => onSelect("reports")} /><NavButton item={navItems[3]} active={activeNav === "account"} onClick={() => onSelect("account")} /></div></nav>;
}

function NavButton({ item, active, onClick }: { item: { key: NavKey; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] ${active ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"}`}><span className="text-xl leading-5" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>;
}

function formatAmount(value: string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(BigInt(value))}`;
}

function formatSignedAmount(value: bigint, currency: string): string {
  const sign = value > BigInt(0) ? "+" : value < BigInt(0) ? "−" : "";
  const absoluteValue = value < BigInt(0) ? -value : value;
  return `${sign}${currency} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(absoluteValue)}`;
}

function getPreviousPeriodInput(period: ReportResponse["report"]["period"]): { month?: string; startDate?: string; endDate?: string } | null {
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

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatLongDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function requestTelegramDownload(action: ReportAction, onResult: (message?: string) => void): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.downloadFile) {
    webApp.downloadFile({ url: action.url, file_name: action.fileName }, (accepted) => {
      if (!accepted) onResult("Telegram membatalkan permintaan download.");
    });
    return;
  }
  if (webApp?.openLink) {
    webApp.openLink(action.url);
    return;
  }
  const opened = window.open(action.url, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("Telegram tidak menyediakan fitur download dan popup diblokir browser.");
}

function requestTelegramPrint(url: string): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false });
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("Popup diblokir browser. Izinkan popup untuk membuka tampilan cetak.");
}
