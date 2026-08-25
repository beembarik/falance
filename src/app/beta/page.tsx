import Image from "next/image";

const botUsername = process.env.FALANCE_TELEGRAM_BOT_USERNAME || "Falance_bot";
const botUrl = `https://t.me/${botUsername}`;

export default function BetaLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--app-background)] text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3" aria-label="Falancé beranda">
            <Image src="/icon.png" alt="" aria-hidden="true" width={42} height={42} className="h-10 w-10 rounded-xl object-contain" priority />
            <span className="text-lg font-extrabold tracking-tight text-[var(--brand-green-700)]">Falancé</span>
          </a>
          <span className="rounded-full border border-[var(--brand-purple-100)] bg-[var(--brand-purple-100)] px-3 py-1.5 text-xs font-bold text-[var(--brand-purple-800)]">Public Beta</span>
        </header>

        <section id="top" className="relative grid gap-10 pb-16 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-24">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--brand-purple-600)]">Keuangan keluarga, lebih sederhana</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-[var(--brand-green-800)] sm:text-6xl">Catat bersama. Pahami bersama. Rencanakan dengan tenang.</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">Falancé membantu keluarga Indonesia mencatat pemasukan dan pengeluaran melalui Telegram, lalu melihat ringkasan keuangan keluarga dalam satu ruang bersama.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={botUrl} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--brand-green-700)] px-5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(38,122,90,0.2)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-green-800)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2">Mulai di Telegram</a>
              <a href="#scope" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[var(--brand-green-500)] bg-white px-5 text-sm font-bold text-[var(--brand-green-700)] transition hover:bg-[var(--brand-green-100)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-green-500)] focus:ring-offset-2">Lihat cakupan beta</a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Gratis selama Public Beta · Akses terbatas · Tidak ada pembayaran yang diminta saat ini</p>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 rounded-[3rem] bg-[var(--brand-purple-100)]/65 blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white p-5 shadow-[0_20px_60px_rgba(38,122,90,0.16)]">
              <div className="rounded-[1.5rem] bg-[var(--brand-green-700)] p-5 text-white">
                <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Keluarga aktif</p><p className="mt-1 text-xl font-extrabold">Rumah Kita</p></div><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">OWNER</span></div>
                <div className="mt-6 rounded-2xl bg-white/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Ringkasan periode</p><div className="mt-3 flex items-end justify-between gap-3"><span className="text-sm text-emerald-50">Surplus IDR</span><strong className="text-2xl">1.250.000</strong></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white/10 p-3"><span className="block text-emerald-100">Pemasukan</span><strong className="mt-1 block text-sm">8.000.000</strong></div><div className="rounded-xl bg-[var(--brand-coral-500)]/80 p-3"><span className="block text-white/80">Pengeluaran</span><strong className="mt-1 block text-sm">6.750.000</strong></div></div></div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-[var(--brand-green-100)] p-3 font-bold text-[var(--brand-green-700)]">Catat</div><div className="rounded-xl bg-[var(--brand-purple-100)] p-3 font-bold text-[var(--brand-purple-800)]">Lihat</div><div className="rounded-xl bg-[var(--brand-coral-100)] p-3 font-bold text-[#9F3D34]">Pahami</div></div>
              <p className="mt-4 text-center text-xs leading-5 text-[var(--text-secondary)]">Contoh tampilan ilustratif · Data pada gambar bukan data pengguna</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-y border-[var(--border)] py-10 sm:grid-cols-3">
          <Feature title="Satu ruang keluarga" text="Owner, admin, dan member dapat bekerja dalam konteks family yang sama sesuai izin masing-masing." tone="green" />
          <Feature title="Ringkasan yang mudah dibaca" text="Lihat arus kas dan pengeluaran per kategori tanpa mencampur mata uang." tone="purple" />
          <Feature title="AI tetap draft-only" text="Bantuan AI tidak langsung menyimpan transaksi. Kamu tetap meninjau sebelum menyetujui." tone="coral" />
        </section>

        <section id="scope" className="grid gap-6 py-16 lg:grid-cols-2 lg:py-20">
          <div className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)] sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-green-700)]">Yang tersedia di beta</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">Fokus pada fondasi yang bermanfaat</h2><ul className="mt-6 space-y-3 text-sm leading-6 text-[var(--text-secondary)]"><li>✓ Pencatatan pemasukan dan pengeluaran melalui command Telegram</li><li>✓ Mini App dashboard, transaksi, laporan, dan Akun untuk tester yang disetujui</li><li>✓ Kategori transaksi dan ringkasan pengeluaran per kategori</li><li>✓ AI text dengan quota terbatas dan alur persetujuan draft</li><li>✓ Export CSV untuk OWNER dan ADMIN</li></ul></div>
          <div className="rounded-3xl border border-[var(--brand-purple-100)] bg-[var(--brand-purple-100)]/55 p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-purple-600)]">Yang disiapkan bertahap</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight">Beta berkembang bersama feedback</h2><ul className="mt-6 space-y-3 text-sm leading-6 text-[var(--brand-purple-800)]"><li>• Receipt Vision disimpan sementara untuk tahap berikutnya</li><li>• Print Preview dan PDF belum dibuka pada beta awal</li><li>• Budget planner dan recurring liability belum menjadi bagian beta</li><li>• Akses beta dibatasi dan dapat dihentikan sementara saat kapasitas penuh</li><li>• Harga berbayar belum ditetapkan dan tidak ada pembayaran saat ini</li></ul></div>
        </section>

        <section className="rounded-3xl bg-[var(--brand-green-800)] px-6 py-10 text-white shadow-[0_12px_36px_rgba(24,90,66,0.2)] sm:px-10 sm:py-12"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Akses terbatas</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight">Bantu kami membuat Falancé lebih relevan untuk keluarga Indonesia.</h2><p className="mt-4 text-sm leading-7 text-emerald-50">Public Beta dibuka secara bertahap. Selama beta, kami mengutamakan keamanan data, stabilitas layanan, dan masukan yang jujur dari keluarga pengguna.</p><a href={botUrl} className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-white px-5 text-sm font-bold text-[var(--brand-green-800)] transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[var(--brand-green-800)]">Kunjungi @{botUsername}</a></div></section>

        <footer className="flex flex-col gap-3 py-8 text-xs leading-5 text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Falancé · Public Beta</span><span>Family finance, made simple.</span></footer>
      </div>
    </main>
  );
}

function Feature({ title, text, tone }: { title: string; text: string; tone: "green" | "purple" | "coral" }) {
  const styles = tone === "green" ? "bg-[var(--brand-green-100)] text-[var(--brand-green-700)]" : tone === "purple" ? "bg-[var(--brand-purple-100)] text-[var(--brand-purple-800)]" : "bg-[var(--brand-coral-100)] text-[#9F3D34]";
  return <article className="rounded-2xl bg-white p-5 shadow-[var(--card-shadow)]"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${styles}`}>Falancé</span><h2 className="mt-4 text-lg font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p></article>;
}
