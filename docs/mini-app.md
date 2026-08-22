# Falancé Telegram Mini App

## Tujuan

Falancé Mini App adalah **command center keuangan keluarga**, bukan versi kecil dari Google Sheets. Pengalaman utamanya adalah:

> Buka → pahami kondisi keuangan → catat transaksi → selesai.

Mini App dirancang untuk sesi singkat dari Telegram. Target utama adalah penggunaan mobile satu tangan, tetapi component system yang sama harus tetap nyaman pada tablet, desktop Telegram, dan browser biasa.

## Status implementasi

Milestone 9 telah menyediakan report read-only, autentikasi Telegram `initData`, filter periode, daftar transaksi terbatas, serta export CSV, print, dan PDF yang role-safe. Milestone 10 memperluas permukaan tersebut secara bertahap.

| Surface | Status |
| --- | --- |
| Beranda/Dashboard read-only | Tersedia melalui Milestone 10 Slice 1 |
| App shell dan bottom navigation | Direncanakan pada Milestone 10 Slice 2 |
| Transaksi read-only dan filter | Direncanakan pada Slice 3 |
| Laporan sebagai screen terpisah | Direncanakan pada Slice 4 |
| Akun & Keluarga read-only | Direncanakan pada Slice 5 |
| Tambah Transaksi dari Mini App | Direncanakan sebagai dedicated write slice |
| Edit dan void transaksi dari Mini App | Direncanakan setelah write path stabil |
| Kategori dan category summaries | Deferred sampai schema persisted diterima |
| Anggaran | Deferred sampai schema budget dan kategori tersedia |
| AI financial insight | Deferred; rule-based metrics didahulukan |
| Scan Struk AI dari Mini App | Deferred; alur Telegram tetap menjadi boundary saat ini |

## Design principles

### Simple first

Saldo, pemasukan, pengeluaran, periode, dan aksi utama harus terlihat tanpa melewati banyak submenu. Halaman pertama tidak boleh menjadi dashboard yang penuh chart.

### Family first

Informasi ditampilkan sebagai kondisi keuangan keluarga yang sedang diotorisasi. Mini App tidak boleh membuat pengguna merasa sedang melihat spreadsheet mentah.

### Action oriented

Aksi `+ Tambah Transaksi` adalah primary action. Tombol ini harus mudah dijangkau pada mobile dan tetap jelas pada desktop.

### Calm finance

Gunakan whitespace, card putih, shadow halus, dan warna semantic secara terbatas. Coral dipakai untuk expense/perhatian, bukan sebagai warna latar utama.

### Progressive disclosure

Export, administrasi keluarga, role management, dan pengaturan lanjutan tidak boleh mengganggu alur dashboard dan pencatatan transaksi.

### Multi-currency honesty

Falancé tidak boleh menjumlahkan nominal dengan mata uang berbeda. Saldo ditampilkan per currency atau dalam konteks currency yang dipilih. Contoh rupiah tunggal pada mock-up hanya valid jika periode tersebut memang mempunyai satu currency.

## Brand design tokens

Palet berikut mengikuti warna visual logo Falancé. **Warna hitam pekat pada background file logo bukan bagian dari palet aplikasi.** Nilai ini adalah starting tokens dan harus divalidasi melalui contrast check serta screenshot pada Telegram mobile dan browser desktop.

| Token | Value | Penggunaan |
| --- | --- | --- |
| `brand-green-700` | `#267A5A` | CTA utama, active navigation, status positif kuat |
| `brand-green-600` | `#31946F` | Tombol utama dan elemen interaktif |
| `brand-green-500` | `#61B89C` | Progress, highlight, dan aksen ringan |
| `brand-green-100` | `#E3F3ED` | Selected state dan surface aksen |
| `brand-purple-600` | `#8E72D6` | Aksen identitas, insight, dan variasi kategori |
| `brand-purple-100` | `#F1EDFA` | Surface ungu ringan |
| `brand-coral-500` | `#F28A7C` | Expense dan attention semantic |
| `brand-coral-100` | `#FDEBE8` | Surface expense/peringatan ringan |
| `app-background` | `#FAFBF8` | Background utama Mini App |
| `surface` | `#FFFFFF` | Card, form, bottom sheet |
| `text-primary` | `#223029` | Heading dan nominal utama |
| `text-secondary` | `#68756E` | Metadata dan supporting text |
| `border` | `#E2EAE5` | Divider dan border |

Warna tidak boleh menjadi satu-satunya penanda status. Pemasukan dan pengeluaran harus memiliki label, tanda `+`/`−`, atau teks semantic yang jelas. Target contrast minimal adalah WCAG AA untuk teks dan kontrol yang relevan.

## Typography, spacing, dan shape

Mini App menggunakan sans-serif yang mudah dibaca, dengan `Inter`, `Plus Jakarta Sans`, atau fallback system sans-serif. Nominal utama dapat menggunakan ukuran 24–28px dengan weight 700; body text sekitar 14px; caption sekitar 12px.

Gunakan spacing basis 4px. Padding screen default adalah 16px, padding card 16px, section gap 20px, dan component gap 12px. Card menggunakan radius sekitar 16px, button/input sekitar 12px, dan chip/avatar berbentuk pill atau circle. Shadow harus ringan, misalnya `0 2px 12px rgba(20, 40, 25, 0.05)`, bukan shadow gelap yang membuat UI terasa berat.

## App shell dan navigasi

Struktur komponen konseptual:

```text
AppShell
├── PageHeader
├── MainContent
└── BottomNavigation
```

Navigasi mobile yang disarankan adalah:

```text
Beranda · Transaksi · + · Laporan · Akun
```

`+` merupakan primary action dan tidak perlu label panjang. Pada viewport yang lebih lebar, bottom navigation dapat berubah menjadi navigation rail atau sidebar, tetapi komponen domain dan aturan otorisasi tetap sama.

Mini App harus memanggil `Telegram.WebApp.ready()` dan `expand()` jika API tersedia, tetapi tidak boleh gagal ketika `window.Telegram.WebApp` tidak tersedia. Browser biasa harus memperoleh fallback yang informatif, terutama pada kondisi `initData` tidak ada atau sudah kedaluwarsa.

## Screen specification

### Beranda

Beranda menjawab pertanyaan: **“Bagaimana kondisi keuangan keluarga pada periode ini?”** Hierarki yang disarankan adalah header, konteks keluarga, periode, ringkasan pemasukan/pengeluaran/saldo, transaksi terbaru, lalu navigasi.

Saldo tidak boleh digabung lintas currency. Jika terdapat beberapa currency, gunakan beberapa summary block atau grouping per currency. Card saldo dapat mengarahkan pengguna ke screen Laporan.

### Transaksi

Screen Transaksi menampilkan filter `Semua`, `Pemasukan`, dan `Pengeluaran`, filter periode, serta daftar transaksi yang dikelompokkan secara mudah dibaca. Detail row menampilkan deskripsi, tanggal, currency, nominal, dan tanda income/expense. Detail transaksi dapat menggunakan bottom sheet.

Pada fase read-only, screen menggunakan data family-scoped yang sudah tersedia. Pagination dan strategi dataset besar menjadi boundary lanjutan; UI tidak boleh mengasumsikan seluruh histori dapat dimuat sekaligus.

### Tambah Transaksi

Pada fase pertama write, form hanya menggunakan field yang sudah authoritative pada model transaksi: tipe, nominal, currency, tanggal, dan deskripsi. `category` dan `payment_method` tidak boleh dipresentasikan sebagai field yang akan disimpan sebelum schema tersedia.

Endpoint write harus memvalidasi raw Telegram `initData`, mencari membership aktif, menyelesaikan `family_id` di server, menerapkan validasi service, dan memanggil `FamilyService`. Setelah sukses, UI mengembalikan pengguna ke Beranda atau menampilkan konfirmasi yang jelas.

### Laporan

Screen Laporan memakai report read model yang deterministic. Ringkasan pemasukan, pengeluaran, saldo, transaction count, currency, filter bulan/rentang, dan export role-safe dapat ditampilkan dalam satu alur yang progressive.

`OWNER` dan `ADMIN` dapat meminta CSV, print, dan PDF sesuai endpoint yang ada. `MEMBER` dapat melihat laporan tetapi tidak dapat melakukan export, walaupun endpoint dipanggil langsung di luar UI.

### Akun & Keluarga

Fase awal bersifat read-only: identitas/konteks viewer, nama keluarga, role, jumlah anggota, daftar anggota aktif, dan permission summary. Avatar viewer mencoba optional Telegram `photo_url` dari raw `initData` yang telah divalidasi server-side bila tersedia. Jika URL tersebut tidak tersedia atau gagal dimuat, UI beralih ke signed short-lived same-origin proxy yang dibuat Account API; proxy mengotorisasi ulang viewer dan mengambil foto terbaru melalui Bot API secara server-side. Bot token tidak pernah dikirim ke browser, URL foto tidak disimpan ke Google Sheets, dan avatar tidak digunakan untuk authorization. Jika foto tidak tersedia, akses Telegram dibatasi, URL tidak valid, atau gambar gagal dimuat, UI menggunakan inisial sebagai fallback. Avatar anggota keluarga lain tidak diambil pada slice ini.

Kontrol invite, role, deactivation, archival, atau reactivation baru ditambahkan setelah endpoint dan interaction semantics-nya dipetakan ke service yang sudah ada.

### Tambah Transaksi

Slice 6 menyediakan form terotorisasi untuk transaksi aktual dengan `INCOME`/`EXPENSE`, amount minor integer, currency tiga huruf, tanggal, dan deskripsi. Client mengirim raw Telegram `initData` bersama field transaksi ke endpoint Mini App; client tidak mengirim `family_id`, `member_id`, atau `transaction_id`. Server memvalidasi `initData`, menyelesaikan membership dan keluarga melalui `FamilyService`, lalu melakukan persistence ke repository yang sama dengan alur Telegram. Kategori, metode pembayaran, receipt scan, recurring transaction, dan automatic retry belum termasuk dalam slice ini. Tombol submit dinonaktifkan selama request berlangsung untuk mengurangi duplicate submission, tetapi idempotency durable lintas instance tetap menjadi hardening lanjutan.

Slice 7 menambahkan edit transaksi aktif melalui `PATCH /api/mini-app/transaction` dan soft-void melalui `POST /api/mini-app/transaction/void`. Edit menggunakan input authoritative yang sama dan tetap memeriksa membership server-side. Void tidak langsung mengubah data: tahap `REQUEST` membuat `PendingConfirmation` berstatus `PENDING` dengan expiry lima menit, UI menampilkan pertanyaan konfirmasi `Ya, void` atau `Batal`, dan tahap `CONFIRM` hanya dapat mengeksekusi action `VOID_TRANSACTION` yang cocok. Status transaksi berubah menjadi `VOID`, tidak dihapus, tidak dihitung dalam saldo, dan dicatat dalam audit log. `transactionId` untuk CONFIRM diambil dari pending state server, bukan dari client.

### Anggaran dan insight

Screen Anggaran belum boleh menampilkan angka contoh sebagai data nyata. Budget memerlukan schema, periode, kategori, nominal limit, status, repository, service, dan perhitungan server-side. Insight juga harus berasal dari structured metrics; AI tidak boleh menghitung saldo atau menjadi sumber angka finansial.

## Data and security boundary

Alur data yang benar adalah:

```text
Central repository
    ↓
FamilyService
    ↓
Authenticated Mini App API
    ↓
Domain-shaped UI state
```

Komponen UI tidak boleh memanggil Google Sheets. Client tidak boleh mengirim `family_id`, spreadsheet ID, Telegram user ID, atau storage identifier sebagai authorization input. `family_id` selalu diperoleh server dari membership Telegram yang telah divalidasi. Avatar viewer harus berasal dari `photo_url` dalam `initData` yang sudah diverifikasi atau dari signed same-origin proxy yang dibuat server; bukan dari field URL terpisah yang dikirim browser.

Untuk beberapa keluarga di masa depan, pemilihan konteks keluarga harus memiliki desain server-side yang eksplisit. Dropdown yang hanya mengirim ID keluarga ke endpoint bukan implementasi yang aman.

Semua operasi destruktif harus mempertahankan soft-state, audit, role boundary, invariant last OWNER, dan konfirmasi yang berlaku. Tidak ada hard deletion melalui Mini App.

## State dan accessibility

Setiap screen wajib mempunyai loading state berbasis skeleton bila memungkinkan, empty state yang menjelaskan langkah berikutnya, error state dalam Bahasa Indonesia, dan retry action. Form tidak boleh kehilangan input tanpa alasan ketika terjadi network error.

Target interaksi minimal adalah 44px. Semua input memiliki label, semua icon button memiliki accessible label, focus state tetap terlihat pada desktop, dan informasi income/expense tidak hanya dibedakan melalui warna.

## Acceptance criteria untuk Milestone 10

Milestone 10 dapat dianggap selesai apabila:

1. Core screens Beranda, Transaksi, Laporan, dan Akun/Keluarga memiliki navigasi yang konsisten.
2. App shell menggunakan token branding Falancé dan tidak menggunakan background hitam pekat dari aset logo.
3. Layout berfungsi pada Telegram mobile, tablet, desktop, dan browser fallback.
4. Loading, empty, error, retry, dan session-expiry state diuji.
5. Semua data tetap family-scoped dan semua write path menggunakan `FamilyService`.
6. Saldo multi-currency tidak pernah dicampur.
7. Export tetap hanya tersedia untuk `OWNER` dan `ADMIN`.
8. Test mencakup authorization, family isolation, dan interaction-critical paths.
9. Category, budget, AI insight, payment method, dan Mini App receipt scanning tetap deferred sampai data contract masing-masing disetujui.

## Referensi internal

- [`docs/milestones.md`](milestones.md) — scope dan urutan Milestone 10.
- [`docs/architecture.md`](architecture.md) — family isolation, service boundary, dan report privacy.
- [`docs/decisions.md`](decisions.md) — ADR-010 untuk design system Mini App.
- [`docs/database.md`](database.md) — schema transaksi dan boundary data.
- [`docs/telegram.md`](telegram.md) — autentikasi Telegram, command, dan Mini App boundary.
- [`README.md`](../README.md) — status produk dan quality gate.
