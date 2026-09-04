"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountResponse, FamilyAction, FamilyActionFields, NavKey, ReportResponse, TransactionFilter } from "../components/mini-app/types";
import { AccountView, AddTransactionForm, AppHeader, BottomNavigation, HomeView, LoadingState, PlaceholderView, ReportsView, TransactionDetail, TransactionsView } from "../components/mini-app/views";
import { getPreviousPeriodInput, requestTelegramPrint, waitForTelegramWebApp } from "../components/mini-app/utils";




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
