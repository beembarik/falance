"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORY_CODES, CATEGORY_LABELS } from "../lib/family/category-analytics";

type ReportAction = { url: string; fileName: string };
type NavKey = "home" | "transactions" | "reports" | "account";
type TransactionFilter = "ALL" | "INCOME" | "EXPENSE";
type FamilyAction = "CREATE_INVITATION" | "RENAME_FAMILY" | "CHANGE_MEMBER_ROLE" | "REQUEST_DEACTIVATE_MEMBER" | "CONFIRM_DEACTIVATE_MEMBER" | "CANCEL_DEACTIVATE_MEMBER";
type FamilyActionFields = { familyName?: string; memberId?: string; role?: "ADMIN" | "MEMBER" };

type ReportResponse = {
  familyName: string;
  viewer: { name: string; role: string };
  actions?: { csv?: ReportAction; pdf?: ReportAction; print?: ReportAction };
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
    categorySummaries: Array<{
      category: string;
      label: string;
      currency: string;
      incomeMinor: string;
      expenseMinor: string;
      netMinor: string;
      transactionCount: number;
    }>;
    cashFlow: Array<{
      period: string;
      label: string;
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
      category: string;
      creatorName: string;
    }>;
  };
};

type AccountResponse = {
  beta?: { label: string; version: string; supportUrl: string | null; tester: boolean };
  viewer: { name: string; username: string | null; role: string; avatarUrl: string | null; avatarFallbackUrl: string | null };
  family: { familyName: string; status: string; plan: string; activeMemberCount: number };
  members: Array<{ memberId: string; name: string; username: string | null; role: string; joinedAt: string }>;
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

const TELEGRAM_BOOTSTRAP_TIMEOUT_MS = 5_000;

const navItems: Array<{ key: NavKey; label: string; color: "green" | "purple" | "coral" }> = [
  { key: "home", label: "Beranda", color: "coral" },
  { key: "transactions", label: "Transaksi", color: "coral" },
  { key: "reports", label: "Laporan", color: "coral" },
  { key: "account", label: "Akun", color: "coral" },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavKey>("home");
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("ALL");
  const [selectedTransaction, setSelectedTransaction] = useState<ReportResponse["report"]["transactions"][number] | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<ReportResponse["report"]["transactions"][number] | null>(null);
  const [voidConfirmation, setVoidConfirmation] = useState<{ transactionId: string; expiresAt: string } | null>(null);
  const [transactionAction, setTransactionAction] = useState<"request-void" | "confirm-void" | "cancel-void" | null>(null);
  const [transactionActionError, setTransactionActionError] = useState("");
  const [familyAction, setFamilyAction] = useState<FamilyAction | null>(null);
  const [familyActionError, setFamilyActionError] = useState("");
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string; shareMessage: string } | null>(null);
  const [deactivateConfirmation, setDeactivateConfirmation] = useState<{ memberId: string; expiresAt: string } | null>(null);
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
  const [categoryFilter, setCategoryFilter] = useState<{ category: string; currency: string } | null>(null);
  const [error, setError] = useState("");
  const [printError, setPrintError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [csvDownloadSupported, setCsvDownloadSupported] = useState<boolean | null>(null);
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
      setCategoryFilter(null);
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

  const handleFamilyAction = useCallback(async (action: FamilyAction, fields: FamilyActionFields = {}) => {
    const currentInitData = initDataRef.current || window.Telegram?.WebApp?.initData || "";
    if (!currentInitData) {
      setFamilyActionError("Buka halaman ini dari Telegram Mini App agar aksi keluarga dapat diproses.");
      return;
    }
    setFamilyAction(action);
    setFamilyActionError("");
    try {
      const response = await fetch("/api/mini-app/family", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: currentInitData, action, ...fields }),
      });
      const payload = await response.json() as { error?: string; invitation?: { code: string; expiresAt: string; shareMessage: string }; confirmation?: { expiresAt: string } };
      if (!response.ok) throw new Error(payload.error || "Aksi keluarga tidak dapat diproses.");
      if (action === "CREATE_INVITATION" && payload.invitation) {
        setInvitation(payload.invitation);
        setNotice("Undangan berhasil dibuat.");
      } else if (action === "REQUEST_DEACTIVATE_MEMBER" && payload.confirmation && fields.memberId) {
        setDeactivateConfirmation({ memberId: fields.memberId, expiresAt: payload.confirmation.expiresAt });
      } else if (action === "CONFIRM_DEACTIVATE_MEMBER") {
        setDeactivateConfirmation(null);
        setNotice("Member berhasil dinonaktifkan.");
      } else if (action === "CANCEL_DEACTIVATE_MEMBER") {
        setDeactivateConfirmation(null);
        setNotice("Penonaktifan member dibatalkan.");
      } else if (action === "RENAME_FAMILY") {
        setNotice("Nama keluarga berhasil diperbarui.");
      } else if (action === "CHANGE_MEMBER_ROLE") {
        setNotice("Role member berhasil diperbarui.");
      }
      await loadAccount();
    } catch (error) {
      setFamilyActionError(error instanceof Error ? error.message : "Aksi keluarga tidak dapat diproses.");
    } finally {
      setFamilyAction(null);
    }
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

  const downloadCsv = useCallback(() => {
    const action = data?.actions?.csv;
    const webApp = window.Telegram?.WebApp;
    if (!initDataRef.current || !action || data.viewer.role === "MEMBER") return;
    if (!webApp?.downloadFile) {
      setCsvDownloadSupported(false);
      setPrintError("Unduh CSV belum didukung oleh versi Telegram ini.");
      return;
    }
    setCsvDownloading(true);
    setPrintError("");
    try {
      webApp.downloadFile({
        url: action.url,
        file_name: `falance-report-${data.report.period.startDate}-${data.report.period.endDate}.csv`,
      }, (accepted) => {
        setCsvDownloading(false);
        if (!accepted) setPrintError("Unduhan CSV dibatalkan atau tidak didukung oleh Telegram.");
      });
    } catch (downloadError) {
      setCsvDownloading(false);
      setPrintError(downloadError instanceof Error ? downloadError.message : "CSV tidak dapat diunduh.");
    }
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const webApp = await waitForTelegramWebApp();
      if (cancelled) return;
      if (webApp) {
        initDataRef.current = webApp.initData;
        setCsvDownloadSupported(typeof webApp.downloadFile === "function");
        webApp.ready();
        webApp.expand();
        webApp.setHeaderColor?.("#267a5a");
        webApp.setBackgroundColor?.("#fafbf8");
      }
      await loadReport("", "", "");
    })();
    return () => {
      cancelled = true;
    };
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
              setCategoryFilter(null);
            }}
            onStartDateChange={(value) => {
              setStartDate(value);
              setMonth("");
              setCategoryFilter(null);
            }}
            onEndDateChange={(value) => {
              setEndDate(value);
              setMonth("");
              setCategoryFilter(null);
            }}
            onLoad={() => void loadReport(month, startDate, endDate)}
            printing={printing}
            printError={printError}
            onPrint={printReport}
            onCsv={() => void downloadCsv()}
            csvDownloading={csvDownloading}
            csvDownloadSupported={csvDownloadSupported}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
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

        {accountData && activeNav === "account" && <AccountView key={accountData.family.familyName} data={accountData} onRetry={() => void loadAccount()} onFamilyAction={(action, fields) => void handleFamilyAction(action, fields)} familyAction={familyAction} familyActionError={familyActionError} invitation={invitation} deactivateConfirmation={deactivateConfirmation} /> }

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
            <Image className="brand-mark object-contain" src="/icon.png" alt="" aria-hidden="true" width={32} height={32} priority />
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
                  <span className="text-sm font-semibold text-emerald-50">{BigInt(summary.netMinor) >= BigInt(0) ? "Surplus" : "Defisit"} periode {summary.currency}</span>
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

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
        <button type="button" onClick={onAddTransaction} className="primary-action flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-white shadow-[0_6px_18px_rgba(38,122,90,0.18)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2"><span className="text-xl leading-none">+</span> Tambah transaksi</button>
        <button type="button" onClick={onSelectTransactions} className="mt-3 min-h-10 w-full rounded-xl px-3 text-sm font-semibold text-[var(--brand-green-700)] transition hover:bg-[var(--brand-green-50)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]">Lihat semua transaksi →</button>
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

function BottomNavigation({ activeNav, onSelect, onAddTransaction }: { activeNav: NavKey; onSelect: (key: NavKey) => void; onAddTransaction: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="Navigasi Utama">
      <div className="bottom-nav-inner">
        {/* Home */}
        <button
          type="button"
          onClick={() => onSelect("home")}
          className={`nav-item ${activeNav === "home" ? "nav-item-active" : ""}`}
          aria-label="Beranda"
          aria-current={activeNav === "home" ? "page" : undefined}
        >
          <div className="nav-icon-wrapper">
            <div className="nav-indicator" />
            <div className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" />
              </svg>
            </div>
          </div>
          <span className="nav-label">Beranda</span>
        </button>

        {/* Transactions */}
        <button
          type="button"
          onClick={() => onSelect("transactions")}
          className={`nav-item ${activeNav === "transactions" ? "nav-item-active" : ""}`}
          aria-label="Transaksi"
          aria-current={activeNav === "transactions" ? "page" : undefined}
        >
          <div className="nav-icon-wrapper">
            <div className="nav-indicator" />
            <div className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h4m-4 4h4m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>
          <span className="nav-label">Transaksi</span>
        </button>

        {/* Center '+' FAB (Purple Accent) */}
        <div className="primary-fab-item">
          <button
            type="button"
            onClick={onAddTransaction}
            className="primary-fab"
            aria-label="Tambah Transaksi"
          >
            <div className="primary-fab-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="primary-fab-label">Tambah</span>
          </button>
        </div>

        {/* Reports */}
        <button
          type="button"
          onClick={() => onSelect("reports")}
          className={`nav-item ${activeNav === "reports" ? "nav-item-active" : ""}`}
          aria-label="Laporan"
          aria-current={activeNav === "reports" ? "page" : undefined}
        >
          <div className="nav-icon-wrapper">
            <div className="nav-indicator" />
            <div className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <span className="nav-label">Laporan</span>
        </button>

        {/* Account */}
        <button
          type="button"
          onClick={() => onSelect("account")}
          className={`nav-item ${activeNav === "account" ? "nav-item-active" : ""}`}
          aria-label="Akun"
          aria-current={activeNav === "account" ? "page" : undefined}
        >
          <div className="nav-icon-wrapper">
            <div className="nav-indicator" />
            <div className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
          <span className="nav-label">Akun</span>
        </button>
      </div>
    </nav>
  );
}

function CashFlowSection({ points }: { points: ReportResponse["report"]["cashFlow"] }) {
  const currencies = [...new Set(points.map((point) => point.currency))].sort();
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]" aria-labelledby="cash-flow-title">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Arus kas</p>
        <h2 id="cash-flow-title" className="mt-1 text-lg font-bold">Pemasukan dan pengeluaran</h2>
      </div>
      <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">Per currency</span>
    </div>
    {currencies.length === 0 ? (
      <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Belum ada arus kas pada periode ini.</p>
    ) : (
      <div className="mt-4 space-y-6">{currencies.map((currency) => <CashFlowChart key={currency} currency={currency} points={points.filter((point) => point.currency === currency)} />)}</div>
    )}
    <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">Nilai dihitung dari transaksi aktif pada periode ini. Setiap mata uang ditampilkan terpisah dan arus bersih bukan saldo rekening.</p>
  </section>;
}

function CashFlowChart({ currency, points }: { currency: string; points: ReportResponse["report"]["cashFlow"] }) {
  const maxAmount = points.reduce((max, point) => {
    const income = BigInt(point.incomeMinor);
    const expense = BigInt(point.expenseMinor);
    return income > max ? income : expense > max ? expense : max;
  }, BigInt(0));
  if (maxAmount === BigInt(0)) return <div className="rounded-xl bg-[var(--surface-soft)] p-4"><p className="text-sm font-semibold">{currency}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Belum ada pemasukan atau pengeluaran.</p></div>;
  return <div>
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{currency}</h3><span className="text-xs text-[var(--text-secondary)]">{points.length} periode</span></div>
    <div className="mt-3 space-y-4">{points.map((point) => <div key={`${point.currency}:${point.period}`} className="rounded-xl bg-[var(--surface-soft)] p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{point.label}</span><span className={`text-xs font-bold ${BigInt(point.netMinor) >= BigInt(0) ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]"}`}>{BigInt(point.netMinor) >= BigInt(0) ? "Surplus" : "Defisit"} {formatSignedAmount(BigInt(point.netMinor), currency)}</span></div><div className="mt-3 space-y-2"><CashFlowBar label="Pemasukan" value={point.incomeMinor} total={maxAmount} color="bg-[var(--brand-green-500)]" currency={currency} /><CashFlowBar label="Pengeluaran" value={point.expenseMinor} total={maxAmount} color="bg-[var(--brand-coral-500)]" currency={currency} /></div></div>)}</div>
  </div>;
}

function CashFlowBar({ label, value, total, color, currency }: { label: string; value: string; total: bigint; color: string; currency: string }) {
  const amount = BigInt(value);
  const width = total === BigInt(0) ? 0 : Math.max(amount > BigInt(0) ? 1 : 0, percentageOf(amount, total));
  return <div><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[var(--text-secondary)]">{label}</span><span className="text-[var(--text-secondary)]">{formatAmount(value, currency)}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface)]" role="img" aria-label={`${label}: ${formatAmount(value, currency)}`}><div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} /></div></div>;
}

function CategoryExpenseSection({ summaries, selected, onSelect }: { summaries: ReportResponse["report"]["categorySummaries"]; selected: { category: string; currency: string } | null; onSelect: (value: { category: string; currency: string } | null) => void }) {
  const currencies = [...new Set(summaries.map((summary) => summary.currency))].sort();
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]" aria-labelledby="category-expense-title">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Distribusi</p>
        <h2 id="category-expense-title" className="mt-1 text-lg font-bold">Pengeluaran per kategori</h2>
      </div>
      <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">Per periode</span>
    </div>
    {currencies.length === 0 ? (
      <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">Belum ada pengeluaran berkategori pada periode ini.</p>
    ) : (
      <div className="mt-4 space-y-5">{currencies.map((currency) => <CategoryExpenseChart key={currency} currency={currency} summaries={summaries.filter((summary) => summary.currency === currency)} selected={selected} onSelect={onSelect} />)}</div>
    )}
    <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">Ketuk kategori untuk melihat transaksi yang cocok pada periode dan currency tersebut. Setiap mata uang ditampilkan terpisah; grafik ini bukan anggaran atau rekomendasi.</p>
  </section>;
}

type CategoryExpenseRow = { label: string; category: string; expenseMinor: bigint; percentage: number; transactionCount: number };

function CategoryExpenseChart({ currency, summaries, selected, onSelect }: { currency: string; summaries: ReportResponse["report"]["categorySummaries"]; selected: { category: string; currency: string } | null; onSelect: (value: { category: string; currency: string } | null) => void }) {
  const expenseSummaries = summaries
    .filter((summary) => BigInt(summary.expenseMinor) > BigInt(0))
    .sort((left, right) => BigInt(right.expenseMinor) > BigInt(left.expenseMinor) ? 1 : -1);
  const totalExpense = expenseSummaries.reduce((total, summary) => total + BigInt(summary.expenseMinor), BigInt(0));
  if (totalExpense === BigInt(0)) return <div className="rounded-xl bg-[var(--surface-soft)] p-4"><p className="text-sm font-semibold">{currency}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">Belum ada pengeluaran pada periode ini.</p></div>;
  const topSummaries = expenseSummaries.slice(0, 4);
  const remainder = expenseSummaries.slice(4);
  const rows: CategoryExpenseRow[] = topSummaries.map((summary) => {
    const expenseMinor = BigInt(summary.expenseMinor);
    return { label: summary.label, category: summary.category, expenseMinor, percentage: percentageOf(expenseMinor, totalExpense), transactionCount: summary.transactionCount };
  });
  const remainderMinor = remainder.reduce((total, summary) => total + BigInt(summary.expenseMinor), BigInt(0));
  if (remainderMinor > BigInt(0)) rows.push({ label: "Lainnya", category: "", expenseMinor: remainderMinor, percentage: percentageOf(remainderMinor, totalExpense), transactionCount: remainder.reduce((total, summary) => total + summary.transactionCount, 0) });
  return <div>
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{currency}</h3><span className="text-xs text-[var(--text-secondary)]">Total {formatAmount(totalExpense.toString(), currency)}</span></div>
    <div className="mt-3 space-y-3">{rows.map((row) => {
      const isSelected = selected?.category === row.category && selected?.currency === currency;
      const content = <><div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold">{row.label}</span><span className="shrink-0 text-right text-xs text-[var(--text-secondary)]">{formatAmount(row.expenseMinor.toString(), currency)} · {formatPercentage(row.percentage)}</span></div><div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-soft)]" role="img" aria-label={`${row.label}: ${formatAmount(row.expenseMinor.toString(), currency)}, ${formatPercentage(row.percentage)}`}><div className="h-full rounded-full bg-[var(--brand-coral-500)] transition-[width] duration-200" style={{ width: `${Math.max(row.percentage, row.expenseMinor > BigInt(0) ? 1 : 0)}%` }} /> </div></>;
      return row.category ? <button key={row.label} type="button" onClick={() => onSelect(isSelected ? null : { category: row.category, currency })} aria-pressed={isSelected} className={`block w-full rounded-xl p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] ${isSelected ? "bg-[var(--brand-green-100)]" : "hover:bg-[var(--brand-green-50)]"}`}>{content}</button> : <div key={row.label} className="rounded-xl p-2">{content}</div>;
    })}</div>
  </div>;
}

function ReportsView({
  data,
  comparison,
  comparisonLoading,
  month,
  startDate,
  endDate,
  loading,
  onMonthChange,
  onStartDateChange,
  onEndDateChange,
  onLoad,
  printing,
  printError,
  onPrint,
  onCsv,
  csvDownloading,
  csvDownloadSupported,
  categoryFilter,
  onCategoryFilterChange,
}: {
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
  printing: boolean;
  printError: string;
  onPrint: () => void;
  onCsv: () => void;
  csvDownloading: boolean;
  csvDownloadSupported: boolean | null;
  categoryFilter: { category: string; currency: string } | null;
  onCategoryFilterChange: (value: { category: string; currency: string } | null) => void;
}) {
  const filteredCategoryLabel = categoryFilter ? (CATEGORY_LABELS[categoryFilter.category as keyof typeof CATEGORY_LABELS] || categoryFilter.category) : "";
  const filteredTransactions = categoryFilter
    ? data.report.transactions.filter((tx) => tx.category === categoryFilter.category && tx.currency === categoryFilter.currency && tx.transactionType === "EXPENSE")
    : data.report.transactions;

  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-700)]">Filter laporan</p>
            <h2 className="mt-1 text-lg font-bold">Pilih periode</h2>
          </div>
          <span className="rounded-full bg-[var(--brand-green-100)] px-3 py-1 text-xs font-semibold text-[var(--brand-green-700)]">{data.report.period.label}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="report-month-select" className="block text-xs font-semibold text-[var(--text-secondary)]">Bulan</label>
            <input id="report-month-select" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]" />
          </div>
          <div>
            <span className="block text-xs font-semibold text-[var(--text-secondary)]">Rentang tanggal kustom</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input type="date" aria-label="Tanggal mulai" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]" />
              <input type="date" aria-label="Tanggal selesai" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)]" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onLoad} disabled={loading} className="rounded-xl bg-[var(--brand-green-700)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--brand-green-800)] disabled:opacity-60">{loading ? "Memuat..." : "Terapkan filter"}</button>
          {data.viewer.role !== "MEMBER" && data.actions?.print && (
            <button type="button" onClick={onPrint} disabled={printing} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-2 text-sm font-semibold transition hover:bg-emerald-50 disabled:opacity-60">{printing ? "Membuka..." : "Cetak laporan"}</button>
          )}
          {data.viewer.role !== "MEMBER" && data.actions?.csv && csvDownloadSupported !== false && (
            <button type="button" onClick={onCsv} disabled={csvDownloading} className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3.5 py-2 text-sm font-semibold transition hover:bg-emerald-50 disabled:opacity-60">{csvDownloading ? "Mengunduh..." : "Unduh CSV"}</button>
          )}
        </div>
        {printError && <p className="mt-3 text-xs text-rose-600">{printError}</p>}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <h2 className="text-lg font-bold">Ringkasan keuangan</h2>
        {data.report.currencies.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">Belum ada transaksi aktif pada periode ini.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.report.currencies.map((summary) => (
              <div key={summary.currency} className="rounded-xl bg-[var(--surface-soft)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{summary.currency}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{summary.transactionCount} transaksi</span>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight">{formatAmount(summary.netMinor, summary.currency)}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-900"><span className="block text-[var(--text-secondary)]">Masuk</span><strong>{formatAmount(summary.incomeMinor, summary.currency)}</strong></div>
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-900"><span className="block text-[var(--text-secondary)]">Keluar</span><strong>{formatAmount(summary.expenseMinor, summary.currency)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {comparisonLoading && <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--text-secondary)]">Memuat perbandingan dengan periode sebelumnya...</div>}
      {comparison && <ComparisonSection current={data} previous={comparison} />}

      <CashFlowSection points={data.report.cashFlow} />
      <CategoryExpenseSection summaries={data.report.categorySummaries} selected={categoryFilter} onSelect={onCategoryFilterChange} />

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{categoryFilter ? `Transaksi ${filteredCategoryLabel}` : "Daftar transaksi"}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{categoryFilter ? `Menampilkan ${filteredTransactions.length} pengeluaran` : `${data.report.transactionCount} transaksi aktif`}</p>
          </div>
          {categoryFilter && <button type="button" onClick={() => onCategoryFilterChange(null)} className="rounded-lg bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--border)]">Hapus filter</button>}
        </div>
        {filteredTransactions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">Tidak ada transaksi yang cocok.</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--border)]">
            {filteredTransactions.map((tx) => <TransactionRow key={tx.transactionId} transaction={tx} />)}
          </div>
        )}
      </section>
    </>
  );
}

function ComparisonSection({ current, previous }: { current: ReportResponse; previous: ReportResponse }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Perbandingan</p>
          <h2 className="mt-1 text-lg font-bold">vs. {previous.report.period.label}</h2>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {current.report.currencies.map((curr) => {
          const prev = previous.report.currencies.find((c) => c.currency === curr.currency);
          const prevExpense = prev ? BigInt(prev.expenseMinor) : BigInt(0);
          const currExpense = BigInt(curr.expenseMinor);
          const diffExpense = currExpense - prevExpense;
          return (
            <div key={curr.currency} className="rounded-xl bg-[var(--surface-soft)] p-4 text-xs">
              <span className="font-bold text-sm">{curr.currency}</span>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Pengeluaran Lalu:</span>
                  <span>{formatAmount(prevExpense.toString(), curr.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Pengeluaran Sekarang:</span>
                  <span>{formatAmount(currExpense.toString(), curr.currency)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-[var(--border)] font-semibold">
                  <span>Selisih:</span>
                  <span className={diffExpense > BigInt(0) ? "text-rose-600" : "text-emerald-600"}>
                    {diffExpense > BigInt(0) ? "+" : ""}{formatAmount(diffExpense.toString(), curr.currency)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TransactionsView({
  data,
  filter,
  onFilterChange,
  onSelectTransaction,
}: {
  data: ReportResponse;
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  onSelectTransaction: (tx: ReportResponse["report"]["transactions"][number]) => void;
}) {
  const transactions = data.report.transactions.filter((tx) => {
    if (filter === "INCOME") return tx.transactionType === "INCOME";
    if (filter === "EXPENSE") return tx.transactionType === "EXPENSE";
    return true;
  });

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-purple-600)]">Transaksi</p>
          <h2 className="mt-1 text-lg font-bold">Semua aktivitas</h2>
        </div>
        <div className="flex rounded-xl bg-[var(--surface-soft)] p-1">
          {(["ALL", "INCOME", "EXPENSE"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onFilterChange(type)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${filter === type ? "bg-[var(--surface)] shadow-xs text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {type === "ALL" ? "Semua" : type === "INCOME" ? "Masuk" : "Keluar"}
            </button>
          ))}
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="mt-6 rounded-xl bg-[var(--surface-soft)] p-4 text-center text-sm text-[var(--text-secondary)]">Tidak ada transaksi dalam kategori ini.</p>
      ) : (
        <div className="mt-4 divide-y divide-[var(--border)]">
          {transactions.map((tx) => (
            <button key={tx.transactionId} type="button" onClick={() => onSelectTransaction(tx)} className="block w-full text-left transition hover:bg-[var(--surface-soft)] rounded-xl px-2">
              <TransactionRow transaction={tx} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TransactionRow({ transaction }: { transaction: ReportResponse["report"]["transactions"][number] }) {
  const isIncome = transaction.transactionType === "INCOME";
  const categoryLabel = CATEGORY_LABELS[transaction.category as keyof typeof CATEGORY_LABELS] || transaction.category;
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{transaction.description || categoryLabel}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{categoryLabel} · {transaction.creatorName} · {formatShortDate(transaction.transactionDate)}</p>
      </div>
      <div className="text-right">
        <span className={`text-sm font-bold ${isIncome ? "text-[var(--brand-green-700)]" : "text-[#C85A4D]"}`}>
          {isIncome ? "+" : "-"}{formatAmount(transaction.amountMinor, transaction.currency)}
        </span>
      </div>
    </div>
  );
}

function AccountView({
  data,
  onRetry,
  onFamilyAction,
  familyAction,
  familyActionError,
  invitation,
  deactivateConfirmation,
}: {
  data: AccountResponse;
  onRetry: () => void;
  onFamilyAction: (action: FamilyAction, fields?: FamilyActionFields) => void;
  familyAction: FamilyAction | null;
  familyActionError: string;
  invitation: { code: string; expiresAt: string; shareMessage: string } | null;
  deactivateConfirmation: { memberId: string; expiresAt: string } | null;
}) {
  const [renameValue, setRenameValue] = useState(data.family.familyName);

  return (
    <>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-[var(--brand-green-100)] text-[var(--brand-green-700)] flex items-center justify-center font-bold text-lg">
            {data.viewer.avatarUrl ? <Image src={data.viewer.avatarUrl} alt="" width={48} height={48} className="h-full w-full object-cover" /> : data.viewer.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold">{data.viewer.name}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{data.viewer.username ? `@${data.viewer.username}` : "Akun Telegram"}</p>
            <span className="mt-1 inline-block rounded-full bg-[var(--brand-green-100)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--brand-green-700)]">{data.viewer.role}</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-green-700)]">Keluarga</p>
            <h2 className="mt-1 text-lg font-bold">{data.family.familyName}</h2>
          </div>
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">{data.family.activeMemberCount} Anggota</span>
        </div>

        {data.viewer.role === "ADMIN" && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <label htmlFor="rename-family-input" className="block text-xs font-semibold text-[var(--text-secondary)]">Ubah nama keluarga</label>
            <div className="mt-1 flex gap-2">
              <input id="rename-family-input" type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm" />
              <button type="button" onClick={() => onFamilyAction("RENAME_FAMILY", { familyName: renameValue })} disabled={familyAction === "RENAME_FAMILY" || !renameValue} className="rounded-xl bg-[var(--brand-green-700)] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[var(--brand-green-800)] disabled:opacity-50">Simpan</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Anggota keluarga</h2>
          {data.viewer.role === "ADMIN" && (
            <button type="button" onClick={() => onFamilyAction("CREATE_INVITATION")} disabled={familyAction === "CREATE_INVITATION"} className="rounded-xl bg-[var(--brand-green-100)] px-3 py-1.5 text-xs font-bold text-[var(--brand-green-700)] hover:bg-[var(--brand-green-50)] transition">
              + Undang
            </button>
          )}
        </div>

        {invitation && (
          <div className="mt-3 rounded-xl bg-[var(--brand-purple-100)] p-3 text-xs text-[var(--brand-purple-800)]">
            <p className="font-bold">Kode Undangan: {invitation.code}</p>
            <p className="mt-1">{invitation.shareMessage}</p>
          </div>
        )}

        {familyActionError && <p className="mt-2 text-xs text-rose-600">{familyActionError}</p>}

        <div className="mt-4 divide-y divide-[var(--border)]">
          {data.members.map((member) => (
            <div key={member.memberId} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{member.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{member.role} · Bergabung {formatShortDate(member.joinedAt)}</p>
              </div>
              {data.viewer.role === "ADMIN" && member.memberId !== data.viewer.username && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onFamilyAction("CHANGE_MEMBER_ROLE", { memberId: member.memberId, role: member.role === "ADMIN" ? "MEMBER" : "ADMIN" })} className="text-xs text-[var(--brand-purple-600)] font-semibold hover:underline">
                    Ubah Role
                  </button>
                  <button type="button" onClick={() => onFamilyAction("REQUEST_DEACTIVATE_MEMBER", { memberId: member.memberId })} className="text-xs text-rose-600 font-semibold hover:underline">
                    Keluarkan
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {deactivateConfirmation && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <p className="font-bold">Konfirmasi Penonaktifan Anggota</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => onFamilyAction("CONFIRM_DEACTIVATE_MEMBER")} className="rounded-lg bg-rose-600 px-3 py-1 text-white font-bold">Ya, Keluarkan</button>
              <button type="button" onClick={() => onFamilyAction("CANCEL_DEACTIVATE_MEMBER")} className="rounded-lg bg-gray-200 px-3 py-1 font-semibold text-gray-800">Batal</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function TransactionDetail({
  transaction,
  onClose,
  onEdit,
  onRequestVoid,
  voidConfirmation,
  transactionAction,
  transactionActionError,
  onConfirmVoid,
  onCancelVoid,
}: {
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
  const isIncome = transaction.transactionType === "INCOME";
  const categoryLabel = CATEGORY_LABELS[transaction.category as keyof typeof CATEGORY_LABELS] || transaction.category;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${isIncome ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : "bg-rose-100 text-rose-700"}`}>
              {isIncome ? "Pemasukan" : "Pengeluaran"}
            </span>
            <h3 className="mt-2 text-xl font-bold">{transaction.description || categoryLabel}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-[var(--border)]">
            <span className="text-[var(--text-secondary)]">Jumlah</span>
            <span className="font-bold">{formatAmount(transaction.amountMinor, transaction.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border)]">
            <span className="text-[var(--text-secondary)]">Kategori</span>
            <span>{categoryLabel}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border)]">
            <span className="text-[var(--text-secondary)]">Dicatat Oleh</span>
            <span>{transaction.creatorName}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-[var(--border)]">
            <span className="text-[var(--text-secondary)]">Tanggal</span>
            <span>{formatShortDate(transaction.transactionDate)}</span>
          </div>
        </div>

        {transactionActionError && <p className="mt-3 text-xs text-rose-600">{transactionActionError}</p>}

        {voidConfirmation ? (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-900 border border-rose-200">
            <p className="font-bold">Apakah Anda yakin ingin melakukan Void pada transaksi ini?</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onConfirmVoid} disabled={transactionAction === "confirm-void"} className="w-full rounded-xl bg-rose-600 py-2 font-bold text-white hover:bg-rose-700">Ya, Void</button>
              <button type="button" onClick={onCancelVoid} disabled={transactionAction === "cancel-void"} className="w-full rounded-xl bg-gray-200 py-2 font-semibold text-gray-800 hover:bg-gray-300">Batal</button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={onEdit} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] py-2.5 text-sm font-semibold transition hover:bg-emerald-50">Edit</button>
            <button type="button" onClick={onRequestVoid} disabled={transactionAction === "request-void"} className="w-full rounded-xl bg-rose-50 text-rose-600 py-2.5 text-sm font-semibold transition hover:bg-rose-100">Void</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddTransactionForm({
  initData,
  transaction,
  onClose,
  onSaved,
}: {
  initData: string;
  transaction?: ReportResponse["report"]["transactions"][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"INCOME" | "EXPENSE">(transaction?.transactionType || "EXPENSE");
  const [amount, setAmount] = useState(transaction ? (Number(transaction.amountMinor) / 100).toString() : "");
  const [currency, setCurrency] = useState(transaction?.currency || "IDR");
  const [category, setCategory] = useState(transaction?.category || "OTHER");
  const [description, setDescription] = useState(transaction?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) {
      setError("Masukkan jumlah nominal yang valid.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const amountMinor = Math.round(Number(amount) * 100).toString();
      const endpoint = transaction ? "/api/mini-app/transaction/edit" : "/api/mini-app/transaction/create";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initData,
          transactionId: transaction?.transactionId,
          transactionType: type,
          amountMinor,
          currency,
          category,
          description,
        }),
      });

      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Gagal menyimpan transaksi.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan transaksi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{transaction ? "Edit Transaksi" : "Tambah Transaksi"}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-600">{error}</p>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-soft)] p-1">
            <button type="button" onClick={() => setType("EXPENSE")} className={`rounded-lg py-2 text-xs font-bold transition ${type === "EXPENSE" ? "bg-white text-rose-600 shadow-xs" : "text-[var(--text-secondary)]"}`}>Pengeluaran</button>
            <button type="button" onClick={() => setType("INCOME")} className={`rounded-lg py-2 text-xs font-bold transition ${type === "INCOME" ? "bg-white text-[var(--brand-green-700)] shadow-xs" : "text-[var(--text-secondary)]"}`}>Pemasukan</button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">Nominal</label>
            <div className="mt-1 flex rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] overflow-hidden">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="bg-transparent px-3 text-xs font-bold border-r border-[var(--border)] focus:outline-none">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <input type="number" step="any" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm focus:outline-none">
              {CATEGORY_CODES.map((code) => (
                <option key={code} value={code}>{CATEGORY_LABELS[code as keyof typeof CATEGORY_LABELS] || code}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">Catatan / Deskripsi</label>
            <input type="text" placeholder="Contoh: Belanja mingguan" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm focus:outline-none" />
          </div>

          <button type="submit" disabled={saving} className="w-full rounded-xl bg-[var(--brand-green-700)] py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-green-800)] disabled:opacity-50">
            {saving ? "Menyimpan..." : "Simpan Transaksi"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-28 rounded-2xl skeleton" />
      <div className="h-44 rounded-2xl skeleton" />
      <div className="h-32 rounded-2xl skeleton" />
    </div>
  );
}

function PlaceholderView({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--card-shadow)]">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
      <button type="button" onClick={onAction} className="mt-4 rounded-xl bg-[var(--brand-green-700)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-green-800)] transition">{actionLabel}</button>
    </section>
  );
}

function formatAmount(minorStr: string, currency: string): string {
  const minor = BigInt(minorStr || "0");
  const major = Number(minor) / 100;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(major);
}

function formatSignedAmount(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(major);
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
}

function percentageOf(value: bigint, total: bigint): number {
  return total === BigInt(0) ? 0 : Number((value * BigInt(10000)) / total) / 100;
}

function formatPercentage(value: number): string {
  return `${value.toLocaleString("id-ID", { minimumFractionDigits: value % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })}%`;
}

function getPreviousPeriodInput(period: { month: string | null; startDate: string; endDate: string }): { month?: string; startDate?: string; endDate?: string } | null {
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

function requestTelegramPrint(url: string) {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openLink) {
    webApp.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

async function waitForTelegramWebApp(): Promise<TelegramWebApp | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TELEGRAM_BOOTSTRAP_TIMEOUT_MS) {
    const webApp = window.Telegram?.WebApp;
    if (webApp) return webApp;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return null;
}
