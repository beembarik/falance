# Falancé

Falancé adalah bot Telegram untuk pencatatan dan pengelolaan keuangan keluarga. Repository ini berisi fondasi aplikasi yang berjalan di Next.js, menerima update Telegram melalui webhook, dan menggunakan **satu Google Spreadsheet pusat untuk seluruh keluarga dalam satu deployment**.

> **Status saat ini:** Milestone 2 selesai dan Milestone 3 sedang berjalan. Fitur transaksi keuangan, laporan, Mini App, dan export belum diimplementasikan.

## Kemampuan yang Sudah Tersedia

Implementasi saat ini berfokus pada identitas Telegram, pembuatan keluarga, undangan, keanggotaan, isolasi data antarkeluarga, serta administrasi dasar anggota.

| Kemampuan | Keterangan | Status |
| --- | --- | --- |
| Webhook Telegram | Menerima update melalui `POST /api/telegram/webhook` dan menyediakan health check melalui `GET /api/telegram/webhook`. | Tersedia |
| Pembuatan keluarga | Pengguna tanpa membership aktif dapat membuat keluarga melalui alur `/createfamily` dan menjadi `OWNER`. | Tersedia |
| Invitation | `OWNER` dan `ADMIN` dapat membuat invitation code yang terikat ke keluarga actor dan memiliki masa berlaku. | Tersedia |
| Join keluarga | Pengguna dapat bergabung menggunakan invitation code yang valid, belum digunakan, belum dicabut, dan belum kedaluwarsa. | Tersedia |
| Daftar anggota | Pengguna aktif dapat melihat anggota aktif dari keluarganya sendiri melalui `/members`. Output menampilkan `Member ID` opaque, bukan Telegram user ID. | Tersedia |
| Revokasi invitation | `OWNER` dan `ADMIN` dapat mencabut invitation berstatus `PENDING` dari keluarganya melalui `/revokeinvite`. | Tersedia |
| Manajemen role | `OWNER` dapat mempromosikan atau menurunkan anggota aktif antara `MEMBER` dan `ADMIN` melalui `/changerole`. | Tersedia |
| Deactivation anggota | `OWNER` dapat menonaktifkan anggota non-OWNER secara soft-state menjadi `SUSPENDED` melalui `/deactivate` dengan konfirmasi eksplisit. | Tersedia |
| Reactivation anggota | `OWNER` dapat mengaktifkan kembali membership `SUSPENDED` melalui `/reactivate` dengan `member_id` lama dan konfirmasi eksplisit. | Tersedia |
| Isolasi keluarga | `family_id` selalu ditentukan server dari membership aktif atau invitation yang telah divalidasi. | Tersedia |
| Registry Google Sheets | Satu registry pusat menggunakan worksheet `Settings`, `Families`, `Members`, `Invitations`, dan `Pending Family Creations`. | Tersedia |
| Diagnostik aman | Error Google Sheets dicatat menggunakan operation label dan path yang telah direduksi; token, credential, spreadsheet ID, Telegram ID, dan data baris tidak dicatat. | Tersedia |

## Telegram Commands

Pesan dan error yang dikirim bot kepada pengguna menggunakan Bahasa Indonesia.

| Command | Akses | Perilaku |
| --- | --- | --- |
| `/start` | Semua pengguna | Menampilkan status registrasi dan role pengguna. Pengguna tanpa membership diarahkan untuk membuat keluarga atau bergabung menggunakan invitation code. |
| `/createfamily` | Pengguna tanpa membership aktif | Memulai pending request selama 15 menit. Pesan teks berikutnya digunakan sebagai nama keluarga. Pembuat keluarga otomatis menjadi `OWNER`. |
| `/invite` | `OWNER`, `ADMIN` | Membuat invitation code baru untuk keluarga actor. Masa berlaku default adalah 24 jam dan dapat dikonfigurasi melalui environment variable. |
| `/join <code>` | Pengguna tanpa membership aktif | Memvalidasi invitation code, membuat membership sebagai `MEMBER`, lalu menandai invitation sebagai `USED`. |
| `/members` | `OWNER`, `ADMIN`, `MEMBER` aktif | Menampilkan anggota aktif dari keluarga actor, termasuk `Member ID`, role, status, username jika ada, dan tanggal bergabung. |
| `/revokeinvite <code>` | `OWNER`, `ADMIN` | Mengubah invitation `PENDING` milik keluarga actor menjadi `REVOKED`. Invitation yang sudah digunakan, kedaluwarsa, atau berasal dari keluarga lain ditolak. |
| `/changerole <member_id_atau_username> <ADMIN\|MEMBER>` | `OWNER` | Mengubah role anggota aktif antara `MEMBER` dan `ADMIN`. Target dapat dipilih menggunakan `Member ID` dari `/members` atau username Telegram. Role `OWNER` tidak dapat diubah. |
| `/deactivate <member_id_atau_username> CONFIRM` | `OWNER` | Mengubah status anggota aktif non-OWNER menjadi `SUSPENDED` tanpa hard deletion. Target dipilih dari keluarga actor dan token `CONFIRM` wajib diberikan. |
| `/reactivate <member_id_atau_username> CONFIRM` | `OWNER` | Mengubah membership `SUSPENDED` menjadi `ACTIVE` menggunakan row dan `Member ID` yang sama. Target dapat dipilih melalui `Member ID` atau username Telegram, harus berasal dari keluarga actor, dan token `CONFIRM` wajib diberikan. |

Contoh penggunaan role management dan member lifecycle:

```text
/members
/changerole mem_abc123 ADMIN
/changerole @nama_pengguna MEMBER
/deactivate mem_abc123 CONFIRM
/reactivate @nama_pengguna CONFIRM
```

`Member ID` adalah identifier internal opaque yang digunakan untuk memilih anggota tanpa menampilkan Telegram user ID. Untuk anggota yang tidak memiliki username Telegram, gunakan `Member ID` yang ditampilkan oleh `/members`.

## Role dan Batas Akses

Role disimpan pada worksheet `Members` dan divalidasi pada service layer. Pembatasan akses tidak bergantung pada teks command atau tampilan client.

| Operasi | `OWNER` | `ADMIN` | `MEMBER` |
| --- | :---: | :---: | :---: |
| Melihat anggota keluarga sendiri | Ya | Ya | Ya |
| Membuat invitation | Ya | Ya | Tidak |
| Mencabut invitation `PENDING` | Ya | Ya | Tidak |
| Mengubah role anggota | Ya | Tidak | Tidak |
| Menjadi target perubahan role | Tidak untuk perubahan role langsung | Ya, dapat diubah menjadi `MEMBER` | Ya, dapat diubah menjadi `ADMIN` |
| Mengubah role `OWNER` | Tidak | Tidak | Tidak |
| Menonaktifkan anggota non-OWNER | Ya | Tidak | Tidak |
| Mengaktifkan kembali anggota `SUSPENDED` | Ya | Tidak | Tidak |

Pada tahap laporan yang direncanakan, `OWNER` dan `ADMIN` akan memiliki akses export CSV, print, dan PDF. `MEMBER` hanya akan dapat melihat laporan melalui Telegram atau Mini App; fitur tersebut belum tersedia pada versi saat ini.

## Arsitektur

### Satu Deployment, Satu Spreadsheet

Falancé menggunakan model berikut:

> **Satu deployment Falancé = satu Google Spreadsheet pusat = seluruh keluarga pada deployment tersebut.**

Google Spreadsheet pusat dikonfigurasi melalui `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`. Ketika keluarga baru dibuat, aplikasi hanya menambahkan row ke spreadsheet yang sudah ada. Aplikasi tidak membuat spreadsheet baru, tidak membuat file Google Drive, dan tidak menggunakan satu spreadsheet per keluarga.

Lapisan domain bergantung pada kontrak `FamilyRepository`. Implementasi saat ini adalah `GoogleSheetsFamilyRepository`, sehingga business logic tidak bergantung langsung pada URL, row number, atau format response Google Sheets.

### Worksheet Registry

| Worksheet | Isi |
| --- | --- |
| `Settings` | Pengaturan deployment tingkat aplikasi. |
| `Families` | Satu row untuk setiap keluarga, termasuk `family_id`, nama, status, pembuat, dan plan. |
| `Members` | Membership aktif maupun historis, termasuk `member_id`, `family_id`, Telegram identity, role, status, dan waktu bergabung. |
| `Invitations` | Invitation code yang terikat ke `family_id`, status, masa berlaku, serta informasi penggunaan. |
| `Pending Family Creations` | Pending request sementara untuk alur pembuatan keluarga. |

`Transactions`, `Categories`, `Accounts`, dan `Audit Log` belum dibuat pada milestone saat ini.

### Isolasi Keluarga

Server menggunakan Telegram user ID dari update yang telah diterima sebagai identity key. Aplikasi mencari membership aktif pengguna tersebut dan mengambil `family_id` dari row membership. Semua operasi keluarga kemudian dibatasi pada family yang telah di-resolve tersebut.

Client Telegram tidak pernah dipercaya untuk menentukan `family_id`, spreadsheet ID, atau storage identifier lainnya. Pada alur join, family ditentukan dari invitation row setelah code, status, dan expiry divalidasi.

### Alur Webhook

1. Telegram mengirim update ke `POST /api/telegram/webhook`.
2. Route memvalidasi bentuk dasar update dan mengambil chat ID, teks, serta identitas pengirim.
3. Route membuat `FamilyService` dengan `GoogleSheetsFamilyRepository` yang menunjuk ke registry pusat.
4. Service menyelesaikan identity dan authorization dari data server-side.
5. Command handler menghasilkan response Bahasa Indonesia.
6. Telegram client mengirim response ke chat asal.

`GET /api/telegram/webhook` mengembalikan health response sederhana dengan status `ok`.

### Google API dan Quota

Aplikasi menggunakan service account dengan OAuth scope Google Sheets berikut:

```text
https://www.googleapis.com/auth/spreadsheets
```

Drive API dan Drive scope tidak diperlukan. `GoogleSheetsClient` melakukan inisialisasi registry secara idempotent dan melakukan caching terhadap promise inisialisasi per spreadsheet ID selama lifetime client instance untuk mengurangi pembacaan header berulang dan risiko quota error `429 RESOURCE_EXHAUSTED`.

## Keamanan dan Privasi

Falancé menerapkan batas keamanan berikut:

- Google Spreadsheet pusat tidak dibagikan langsung kepada pengguna keluarga.
- `family_id` selalu di-resolve di server dan tidak boleh berasal dari input client.
- Invitation selalu family-bound, memiliki expiry, dan hanya dapat digunakan satu kali.
- Role check dilakukan di `FamilyService`, bukan hanya pada command handler.
- `OWNER` tidak dapat diubah melalui role-management flow.
- Target perubahan role atau deactivation harus merupakan anggota aktif dari keluarga actor.
- Deactivation menggunakan soft-state `SUSPENDED`, bukan hard deletion, dan membutuhkan `CONFIRM`.
- Reactivation hanya dapat dilakukan OWNER terhadap row `SUSPENDED`, menggunakan `member_id` lama, dan membutuhkan `CONFIRM`.
- Error log tidak boleh memuat spreadsheet ID, bearer token, private key, Telegram user ID, family name, row value, atau request body.
- Password PDF yang direncanakan pada milestone laporan harus digunakan secara ephemeral di server dan tidak disimpan atau dicatat.

## Konfigurasi Environment

Salin `.env.example` ke konfigurasi environment deployment dan isi nilai server-only secara aman.

| Variable | Kegunaan | Wajib |
| --- | --- | :---: |
| `TELEGRAM_BOT_TOKEN` | Credential Telegram Bot API. | Ya |
| `NEXT_PUBLIC_APP_URL` | URL publik deployment untuk kebutuhan link server-generated di masa depan. | Tidak untuk command saat ini |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account Google. | Ya |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | PKCS#8 private key service account. | Ya |
| `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID` | ID spreadsheet pusat registry Falancé. | Ya |
| `FALANCE_INVITATION_EXPIRY_HOURS` | Masa berlaku invitation dalam jam; default `24`. | Tidak |

Service account harus diberikan akses **Editor** pada Google Spreadsheet pusat. Spreadsheet tersebut tidak perlu dan tidak boleh dibagikan langsung kepada pengguna bot.

## Menjalankan Secara Lokal

Prasyarat utama adalah Node.js yang kompatibel dengan project dan credential environment yang valid. Setelah repository di-clone, install dependency dan jalankan development server:

```bash
npm install
npm run dev
```

Webhook production diarahkan ke:

```text
https://<deployment-domain>/api/telegram/webhook
```

Health check dapat dilakukan dengan request `GET` ke endpoint yang sama.

## Verifikasi dan Quality Gate

Sebelum perubahan di-commit, jalankan seluruh quality gate berikut:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Test saat ini mencakup pembuatan keluarga, membership, invitation, server-side family isolation, revokasi invitation, role management, soft member deactivation, member reactivation with identity preservation, perlindungan role `OWNER`, explicit confirmation, redacted Google diagnostics, registry initialization caching, dan perlindungan agar Telegram user ID tidak muncul pada output `/members`.

## Roadmap Saat Ini

Milestone 3 — **Family Management and Administration** — masih berjalan. Fitur yang masih direncanakan meliputi:

- penggantian nama keluarga oleh OWNER;
- archival atau deactivation keluarga tanpa hard deletion;
- konfirmasi eksplisit untuk operasi destruktif atau perubahan privilege;
- invariants lengkap untuk lifecycle anggota dan OWNER terakhir;
- audit fields atau audit-log boundary.

Milestone berikutnya mencakup fondasi transaksi, input transaksi manual, parser AI, receipt processing, reports, Telegram Mini App, export CSV/print/PDF dengan opsi password PDF, production hardening, dan migrasi storage ke Supabase. Fitur-fitur tersebut belum aktif pada deployment saat ini.

## Dokumentasi Tambahan

- [`docs/architecture.md`](docs/architecture.md) — keputusan arsitektur, family isolation, Google API scope, dan report privacy.
- [`docs/database.md`](docs/database.md) — schema worksheet dan mapping data.
- [`docs/decisions.md`](docs/decisions.md) — Architecture Decision Records.
- [`docs/telegram.md`](docs/telegram.md) — detail webhook, command, identity, authorization, dan report boundary.
- [`docs/milestones.md`](docs/milestones.md) — roadmap milestone dan status implementasi.

## Repository

Repository GitHub: [beembarik/falance](https://github.com/beembarik/falance)

Falancé saat ini belum merupakan aplikasi publik. Pengujian dilakukan secara terbatas oleh owner deployment sebelum fitur transaksi dan laporan dikembangkan.
