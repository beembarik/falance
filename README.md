# Falancé

Falancé adalah bot Telegram untuk pencatatan dan pengelolaan keuangan keluarga. Repository ini berisi fondasi aplikasi yang berjalan di Next.js, menerima update Telegram melalui webhook, dan menggunakan **satu Google Spreadsheet pusat untuk seluruh keluarga dalam satu deployment**.

**Versi saat ini:** `0.2.0`

> **Status saat ini:** Milestone 0–9 telah selesai secara fungsional/operasional, dengan validasi race lintas serverless instance dan production replay testing Milestone 8 yang tetap wajib sebelum public beta. Milestone 10 sedang berjalan: Dashboard Mini App, App Shell/branding, Transaksi read-only, Laporan, dan Akun/Keluarga read-only telah diimplementasikan; avatar Telegram viewer pada screen Akun menggunakan optional `photo_url` dari `initData` tervalidasi dengan fallback inisial. Target Mini App adalah workspace family-finance mobile-first namun responsive, dengan screen Beranda, Transaksi, Tambah Transaksi, Laporan, dan Akun/Keluarga. Arah visual mengikuti branding logo Falancé: hijau brand sebagai warna utama, lavender-purple sebagai aksen, coral sebagai semantic expense/attention, background off-white, card putih, dan tanpa memakai warna hitam pekat pada background logo. Slice report Telegram, Mini App dengan validated `initData`, report API family-scoped, launcher `/reportapp`, role-safe CSV export, print-friendly report, dan PDF server-side untuk `OWNER` dan `ADMIN` sudah tersedia. PDF mendukung optional password yang hanya digunakan saat pembuatan. Category summaries sengaja ditunda karena belum ada persisted `category` field pada `Transaction`. Sebelum deployment, `FALANCE_TELEGRAM_WEBHOOK_SECRET` harus diisi di Vercel dan secret yang sama harus dikonfigurasi pada Telegram `setWebhook`. AI parser, draft interaktif, receipt processing, approval, edit, pembatalan, validasi timezone, penanganan tanggal, category suggestion, dan description suggestion sudah tersedia.

## Kemampuan yang Sudah Tersedia

Implementasi saat ini mencakup identitas Telegram, pembuatan keluarga, undangan, keanggotaan, isolasi data antarkeluarga, administrasi anggota dan keluarga, audit administratif, serta fondasi penyimpanan transaksi yang family-scoped.

| Kemampuan | Keterangan | Status |
| --- | --- | --- |
| Webhook Telegram | Menerima update melalui `POST /api/telegram/webhook` dan menyediakan health check melalui `GET /api/telegram/webhook`. | Tersedia |
| Pembuatan keluarga | Pengguna tanpa membership aktif dapat membuat keluarga melalui alur `/createfamily` dan menjadi `OWNER`. | Tersedia |
| Invitation | `OWNER` dan `ADMIN` dapat membuat invitation code yang terikat ke keluarga actor dan memiliki masa berlaku. Mini App juga menyediakan pesan siap-share dengan tautan `https://t.me/<bot_username>` dan instruksi `/join <code>`. | Tersedia |
| Join keluarga | Pengguna dapat bergabung menggunakan invitation code yang valid, belum digunakan, belum dicabut, dan belum kedaluwarsa. | Tersedia |
| Daftar anggota | Pengguna aktif dapat melihat nama keluarga dan daftar anggota aktif dari keluarganya sendiri melalui `/members`. Output menampilkan `Member ID` opaque sebagai inline code, bukan Telegram user ID. | Tersedia |
| Revokasi invitation | `OWNER` dan `ADMIN` dapat mencabut invitation berstatus `PENDING` dari keluarganya melalui `/revokeinvite`. | Tersedia |
| Manajemen role | `OWNER` dapat mempromosikan atau menurunkan anggota aktif antara `MEMBER` dan `ADMIN` melalui `/changerole`. | Tersedia |
| Deactivation anggota | `OWNER` dapat menonaktifkan anggota non-OWNER secara soft-state menjadi `SUSPENDED` melalui `/deactivate`, lalu mengonfirmasi dengan balasan `Y` atau membatalkan dengan `N`. | Tersedia |
| Reactivation anggota | `OWNER` dapat mengaktifkan kembali membership `SUSPENDED` melalui `/reactivate` dengan `member_id` lama dan konfirmasi eksplisit. | Tersedia |
| Penggantian nama keluarga | `OWNER` dapat mengganti nama keluarga melalui `/renamefamily`; nama dinormalisasi dan dibatasi 1–80 karakter. | Tersedia |
| Fondasi transaksi | Service dan repository menyimpan transaksi `INCOME`/`EXPENSE` ke worksheet `Transactions`, dengan validasi amount/date/currency/description, soft status, audit creation, dan family isolation. | Tersedia |
| Input transaksi terstruktur | `/addincome`, `/addexpense`, `/transactions`, `/edittransaction`, dan `/voidtransaction` tersedia melalui Telegram; `/transactions` menampilkan saldo kumulatif per currency dan daftar transaksi aktif. Identifier invitation, member, dan transaksi ditampilkan sebagai inline code agar mudah disalin. | Tersedia |
| AI text parser | Pesan natural-language dari anggota aktif diekstrak menjadi draft transaksi tervalidasi. Bot menampilkan rekap dengan tombol `Ya, simpan`, `Edit`, dan `Batalkan`; `Ya, simpan`/`Kirim draft` menyimpan melalui service deterministik, sedangkan `Edit` membuka format `/editdraft`. Tanggal transaksi biasa tidak boleh melewati tanggal hari ini pada zona waktu bisnis yang dikonfigurasi. Jika transaksi aktual tidak menyebut tanggal, draft menggunakan hari ini dan menampilkannya sebagai `(diasumsikan hari ini)`. Draft dapat menampilkan saran kategori terkontrol dan saran deskripsi opsional untuk ditinjau; bahasa perencanaan tidak disimpan sebagai transaksi aktual. | Tersedia; Milestone 6 selesai |
| Receipt photo intake | Photo receipt dari anggota aktif divalidasi, diunduh melalui `getFile` secara server-side, lalu diarahkan ke receipt parser vision. Gambar tidak disimpan ke Google Sheets dan transaksi tidak dibuat sebelum approval draft. Production validation berhasil dengan OpenRouter menggunakan model text dan vision yang terpisah. | Tersedia; Milestone 7 selesai |
| Isolasi keluarga | `family_id` selalu ditentukan server dari membership aktif atau invitation yang telah divalidasi. | Tersedia |
| Registry Google Sheets | Satu registry pusat menggunakan dua belas worksheet: `Settings`, `Families`, `Members`, `Invitations`, `Pending Family Creations`, `Pending Confirmations`, `Pending Transaction Drafts`, `Audit Log`, `Transactions`, `Processed Telegram Updates`, `AI Vision Usage`, dan `Draft Approval Claims`. Worksheet claim menyimpan state durable untuk replay/update processing, AI vision usage, dan approval recovery. | Tersedia |
| Webhook security dan idempotency | POST webhook menolak request tanpa `FALANCE_TELEGRAM_WEBHOOK_SECRET` atau header `X-Telegram-Bot-Api-Secret-Token` yang cocok. `update_id` di-claim secara durable sebelum handler dijalankan dan duplicate update diabaikan. Approval draft menggunakan claim durable ber-lease dan deterministic transaction ID untuk recovery tanpa membuat transaksi kedua. | Implemented; konfigurasi production wajib |
| Registry integrity dan recovery | `npm run check:registry` memeriksa header, duplicate key, enum, foreign reference, active OWNER, serta consistency transaction/claim tanpa mencetak row values. Runbook backup dan partial-write retry tersedia pada `docs/backup-recovery.md`. | Tersedia; restoration tetap manual dan terkontrol |
| Diagnostik aman | Error Google Sheets dicatat menggunakan operation label dan path yang telah direduksi; token, credential, spreadsheet ID, Telegram ID, dan data baris tidak dicatat. | Tersedia |
| Report read model | Report bulan dan agregasi multi-currency dibangun secara deterministic dari transaction rows keluarga yang di-resolve server-side. | Milestone 9 Slice 1 tersedia |
| Telegram Mini App | UI read-only mobile-first dengan Dashboard keluarga, App Shell, bottom navigation, screen Transaksi, Laporan, dan Akun/Keluarga. Endpoint report/account memvalidasi raw `initData`; report mendukung filter bulan/rentang maksimal 366 hari, maksimal 50 transaksi terbaru, comparison periode sebelumnya, dan tombol CSV/print/PDF hanya untuk `OWNER`/`ADMIN`. Screen Akun mencoba avatar viewer dari optional Telegram `photo_url` yang telah divalidasi, lalu beralih ke signed same-origin proxy melalui Bot API jika URL tidak tersedia atau gagal dimuat, tanpa mengekspos bot token, menyimpan URL, atau mengambil avatar anggota lain. Branding menggunakan warm green, lavender-purple, coral semantic accent, off-white background, dan mengabaikan warna hitam pekat pada background logo. CSV/PDF menggunakan signed HTTPS URLs melalui `Telegram.WebApp.downloadFile()` dan print menggunakan `Telegram.WebApp.openLink()`. Tambah Transaksi, edit/soft-void transaksi, administrasi keluarga, dan pesan undangan siap-share sekarang tersedia melalui endpoint terotorisasi; kategori/metode pembayaran belum tersedia dan automatic retry belum digunakan. | Milestone 10 Slices 1–8 implemented; production validation pending |
| CSV export | `OWNER` dan `ADMIN` dapat mengunduh CSV family-scoped dari Mini App. Export menggunakan seluruh transaksi aktif pada periode yang dipilih, BOM UTF-8, CRLF, RFC 4180 quoting, dan formula-injection defense; `MEMBER` ditolak di service dan API boundary. | Milestone 9 Slice 3 tersedia |
| Print-friendly report | `OWNER` dan `ADMIN` dapat membuka HTML report family-scoped dari Mini App, lalu mencetak atau memilih Save as PDF melalui browser. Output menggunakan HTML escaping dan print stylesheet. | Milestone 9 Slice 4 tersedia |
| PDF export | `OWNER` dan `ADMIN` dapat mengunduh PDF family-scoped dari Mini App tanpa password atau dengan password optional. Password dikirim melalui prepare endpoint HTTPS, dienkripsi ke short-lived action token, digunakan ephemeral di server, dan tidak disimpan atau dicatat. | Milestone 9 Slice 5 tersedia |

## Telegram Commands

Pesan dan error yang dikirim bot kepada pengguna menggunakan Bahasa Indonesia. Tanggal bisnis untuk transaksi dan relative date AI diatur melalui `FALANCE_TIME_ZONE` dengan format IANA, misalnya `Asia/Jakarta`; nilai default adalah `UTC`. Transaksi biasa dengan tanggal masa depan ditolak. Fitur transaksi terencana dan recurring liabilities akan memakai boundary terpisah agar tidak memengaruhi saldo aktual sebelum terjadi.

| Command | Akses | Perilaku |
| --- | --- | --- |
| `/start` | Semua pengguna | Menampilkan status registrasi dan role pengguna. Pengguna tanpa membership diarahkan untuk membuat keluarga atau bergabung menggunakan invitation code. |
| `/createfamily` | Pengguna tanpa membership aktif | Memulai pending request selama 15 menit. Pesan teks berikutnya digunakan sebagai nama keluarga. Pembuat keluarga otomatis menjadi `OWNER`. |
| `/invite` | `OWNER`, `ADMIN` | Membuat invitation code baru untuk keluarga actor. Bot dan Mini App menampilkan pesan siap-share dengan tautan bot, masa berlaku, serta instruksi `/join <code>`; command join dibungkus sebagai inline code agar mudah disalin. Masa berlaku default adalah 24 jam dan dapat dikonfigurasi melalui environment variable. |
| `/join <code>` | Pengguna tanpa membership aktif | Memvalidasi invitation code, membuat membership sebagai `MEMBER`, lalu menandai invitation sebagai `USED`. |
| `/members` | `OWNER`, `ADMIN`, `MEMBER` aktif | Menampilkan anggota aktif dari keluarga actor, termasuk `Member ID` dalam inline code, role, status, username jika ada, dan tanggal bergabung. |
| `/addincome <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Semua anggota aktif | Mencatat pemasukan ke keluarga yang di-resolve server. Currency default `IDR`; amount mendukung digit biasa atau pemisah ribuan tiga digit. Transaction ID pada response ditampilkan sebagai inline code. |
| `/addexpense <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Semua anggota aktif | Mencatat pengeluaran ke keluarga yang di-resolve server. Transaction ID pada response ditampilkan sebagai inline code. |
| `/transactions` | Semua anggota aktif | Menampilkan ringkasan saldo kumulatif per currency serta maksimal 50 transaksi `ACTIVE` terbaru dari keluarga actor. Transaction ID ditampilkan sebagai inline code dan transaksi `VOID` dikecualikan. |
| `/report` atau `/report <YYYY-MM>` | Semua anggota aktif | Menampilkan laporan read-only untuk bulan berjalan atau periode yang dipilih, dengan total income, expense, saldo bersih, jumlah transaksi, dan agregasi multi-currency dari keluarga actor. `VOID` dan transaksi di luar periode dikecualikan. |
| `/reportapp` | Semua anggota aktif | Mengirim tombol HTTPS untuk membuka Telegram Mini App. Raw `initData` divalidasi server-side; Mini App tidak memilih `family_id`. |
| `/edittransaction <transaction_id> <INCOME|EXPENSE> <amount_minor> [CURRENCY] <YYYY-MM-DD> <deskripsi>` | Semua anggota aktif | Memperbarui transaksi aktif dalam keluarga actor tanpa mengganti transaction ID, family ID, creator member ID, atau created timestamp. Transaction ID pada response ditampilkan sebagai inline code. |
| `/voidtransaction <transaction_id>` atau `/canceltransaction <transaction_id>` lalu `Y`/`N` | Semua anggota aktif | Meminta konfirmasi interaktif; transaction ID pada prompt ditampilkan sebagai inline code, lalu status transaksi diubah menjadi `VOID` tanpa menghapus row. |
| `/revokeinvite <code>` lalu `Y`/`N` | `OWNER`, `ADMIN` | Meminta konfirmasi interaktif sebelum mengubah invitation `PENDING` menjadi `REVOKED`. Balasan `Y` menjalankan aksi, sedangkan `N` membatalkan. |
| `/changerole <member_id_atau_username> <ADMIN\|MEMBER>` | `OWNER` | Mengubah role anggota aktif antara `MEMBER` dan `ADMIN`. Target dapat dipilih menggunakan `Member ID` dari `/members` atau username Telegram. Role `OWNER` tidak dapat diubah. |
| `/deactivate <member_id_atau_username>` lalu `Y`/`N` | `OWNER` | Menampilkan target dan meminta konfirmasi interaktif sebelum mengubah status menjadi `SUSPENDED`. Balasan `Y` menjalankan aksi, sedangkan `N` membatalkan. |
| `/reactivate <member_id_atau_username> CONFIRM` | `OWNER` | Mengubah membership `SUSPENDED` menjadi `ACTIVE` menggunakan row dan `Member ID` yang sama. Target dapat dipilih melalui `Member ID` atau username Telegram, harus berasal dari keluarga actor, dan token `CONFIRM` wajib diberikan. |
| `/renamefamily <nama_baru>` | `OWNER` | Mengganti nama keluarga pada row keluarga actor. Spasi berulang dinormalisasi dan nama harus berisi 1–80 karakter. |
| `/archivefamily` lalu `Y`/`N` | `OWNER` | Meminta konfirmasi interaktif sebelum mengubah status keluarga menjadi `SUSPENDED` tanpa menghapus row atau data. Balasan `Y` menjalankan aksi, sedangkan `N` membatalkan. |
| `/reactivatefamily CONFIRM` | `OWNER` | Mengubah status keluarga `SUSPENDED` kembali menjadi `ACTIVE` tanpa membuat family ID baru. |

Contoh penggunaan role management dan member lifecycle:

```text
/members
/changerole mem_abc123 ADMIN
/changerole @nama_pengguna MEMBER
/deactivate mem_abc123
Y
/reactivate @nama_pengguna CONFIRM
/renamefamily Keluarga Baru
/archivefamily
Y
/reactivatefamily CONFIRM
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
| Mengarsipkan sementara keluarga | Ya | Tidak | Tidak |
| Mengaktifkan kembali anggota `SUSPENDED` | Ya | Tidak | Tidak |
| Mengaktifkan kembali keluarga `SUSPENDED` | Ya | Tidak | Tidak |
| Mengubah nama keluarga | Ya | Tidak | Tidak |
| Membuat transaksi pada keluarga sendiri | Ya | Ya | Ya |

Pada tahap laporan, semua role aktif dapat melihat report melalui Telegram dan Mini App. `OWNER` dan `ADMIN` dapat mengunduh CSV/PDF dan membuka tampilan cetak melalui Mini App. PDF dapat menggunakan password optional; category summaries sengaja ditunda karena belum ada persisted `category` field pada `Transaction`. Dashboard keluarga read-only Milestone 10 sekarang menggunakan payload report authoritative yang sama. `MEMBER` tidak dapat melakukan export, dan pembatasan tersebut ditegakkan ulang pada server.

Mini App Milestone 10 juga mendukung Tambah Transaksi, edit transaksi aktif, dan soft-void dengan konfirmasi server-side. Semua role aktif dapat membuat atau mengedit transaksi milik keluarganya sesuai service boundary; void tidak menghapus row, tetapi mengubah status menjadi `VOID`, mengecualikannya dari saldo, dan mencatat audit log. `family_id` tidak pernah diterima sebagai sumber otorisasi dari client.

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
| `Pending Confirmations` | Pending Y/N confirmation untuk operasi destruktif; status dan expiry disimpan server-side agar aman pada webhook stateless. |
| `Audit Log` | Append-only record untuk aksi administratif yang berhasil, dengan actor member ID, role, action, target opaque, state transition, dan timestamp. Telegram user ID, family name, invitation code, dan request body tidak disimpan. |
| `Transactions` | Record `INCOME` dan `EXPENSE` dengan `transaction_id`, mandatory `family_id`, amount minor, currency, tanggal, deskripsi, creator member ID, timestamp, dan soft status `ACTIVE`/`VOID`. |
| `Processed Telegram Updates` | Claim/completion state deployment-scoped untuk mencegah pemrosesan ulang berdasarkan `update_id`. |
| `AI Vision Usage` | Cooldown, rolling-window quota, dan in-flight lease untuk receipt vision per active user/family. |
| `Draft Approval Claims` | Claim approval draft dengan `CLAIMED`/`COMPLETED`, lease 60 detik, dan deterministic `transaction_id` untuk recovery. |

`Categories` dan `Accounts` belum dibuat. `Audit Log` menjadi boundary append-only untuk administrasi dan penciptaan transaksi.

Contoh input transaksi:

```text
/addincome 15.000 IDR 2026-08-19 Gaji bulanan
/addexpense 150.000 2026-08-19 Makan siang keluarga
/transactions
```

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
- `OWNER` tidak dapat diubah melalui role-management flow, dan operasi apa pun yang dapat menghilangkan OWNER terakhir ditolak oleh service invariant.
- Target perubahan role atau deactivation harus merupakan anggota aktif dari keluarga actor.
- Deactivation menggunakan soft-state `SUSPENDED`, bukan hard deletion, dan membutuhkan konfirmasi interaktif `Y`/`N`.
- Revokasi invitation dan archival keluarga juga menggunakan pending confirmation interaktif `Y`/`N` dengan masa berlaku lima menit.
- Archival keluarga menggunakan status `SUSPENDED`, mempertahankan row dan seluruh data, serta dapat dipulihkan OWNER dengan `/reactivatefamily CONFIRM`.
- Reactivation hanya dapat dilakukan OWNER terhadap row `SUSPENDED`, menggunakan `member_id` lama, dan membutuhkan `CONFIRM`.
- Penggantian nama keluarga hanya dapat dilakukan OWNER; `family_id` tetap ditentukan dari membership actor dan nama dinormalisasi dengan batas 80 karakter.
- Error log tidak boleh memuat spreadsheet ID, bearer token, private key, Telegram user ID, family name, row value, atau request body.
- Audit Log hanya mencatat aksi administratif yang berhasil pada target opaque; audit persistence failure tidak membatalkan state change utama dan hanya menghasilkan diagnostic operation label yang aman.
- Password PDF yang direncanakan pada milestone laporan harus digunakan secara ephemeral di server dan tidak disimpan atau dicatat.

## Konfigurasi Environment

Salin `.env.example` ke konfigurasi environment deployment dan isi nilai server-only secara aman.

| Variable | Kegunaan | Wajib |
| --- | --- | :---: |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram. | Ya |
| `FALANCE_TELEGRAM_WEBHOOK_SECRET` | Secret server-only yang harus sama dengan secret pada Telegram `setWebhook`; request tanpa header yang cocok ditolak. | Ya |
| `NEXT_PUBLIC_APP_URL` | URL publik deployment untuk kebutuhan link server-generated di masa depan. | Tidak untuk command saat ini |
| `FALANCE_MINI_APP_URL` | URL HTTPS publik Mini App yang dibuka oleh tombol `/reportapp`. | Wajib untuk `/reportapp` |
| `FALANCE_REPORT_TOKEN_SECRET` | Secret server-only untuk encrypted short-lived report action URLs; jika kosong, fallback ke `TELEGRAM_BOT_TOKEN`. | Direkomendasikan untuk CSV/PDF/print Mini App |
| `FALANCE_TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS` | Umur maksimum raw Mini App `initData`; default `3600` detik. | Tidak |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account Google. | Ya |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | PKCS#8 private key service account. | Ya |
| `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID` | ID spreadsheet pusat registry Falancé. | Ya |
| `FALANCE_INVITATION_EXPIRY_HOURS` | Masa berlaku invitation dalam jam; default `24`. | Tidak |
| `FALANCE_TIME_ZONE` | Timezone IANA untuk tanggal bisnis, relative date AI, dan validasi tanggal masa depan; default `UTC`, misalnya `Asia/Jakarta`. | Tidak |
| `FALANCE_AI_API_BASE` | Endpoint provider AI OpenAI-compatible; server-only dan wajib jika AI parser digunakan. | Tidak |
| `FALANCE_AI_API_KEY` | API key provider AI; server-only dan tidak boleh dikirim ke client atau Telegram. | Tidak |
| `FALANCE_AI_MODEL` | Model AI text parser; default `gpt-5-mini`. | Tidak |
| `FALANCE_AI_VISION_MODEL` | Model vision-capable untuk receipt parser; wajib jika receipt parsing diaktifkan. | Tidak |
| `FALANCE_RECEIPT_MAX_BYTES` | Batas ukuran receipt yang diunduh dalam byte; default `10485760` (10 MiB). | Tidak |
| `FALANCE_RECEIPT_VISION_COOLDOWN_SECONDS` | Cooldown receipt vision per active user/family; default `30` detik. | Tidak |
| `FALANCE_RECEIPT_VISION_WINDOW_SECONDS` | Rolling window quota receipt vision; default `3600` detik. | Tidak |
| `FALANCE_RECEIPT_VISION_MAX_REQUESTS` | Maksimum claim receipt vision per user/family/window; default `5`. | Tidak |
| `FALANCE_RECEIPT_VISION_LEASE_SECONDS` | Lease untuk claim receipt yang sedang diproses; default `60` detik. | Tidak |
| `FALANCE_TIMING_LOGS` | Mengaktifkan log durasi aman untuk webhook, Google Sheets, dan provider AI; gunakan sementara saat diagnosis latency. | Tidak |

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

Test saat ini mencakup pembuatan keluarga, membership, invitation, server-side family isolation, revokasi invitation, role management, soft member deactivation, family reactivation, family-name update authorization and persistence, soft family archival/reactivation, pending Y/N confirmation, cancellation, no-pending guard, last-OWNER invariant, append-only Audit Log persistence, transaction creation, editing, family-scoped listing, soft void confirmation, balance aggregation, structured transaction command parsing and handler responses, natural-language draft extraction and fallback, interactive draft approval/edit/cancellation, stale and foreign callback rejection, deterministic AI validation, configurable business-date timezone, future-date rejection, transparent today-default for undated actual AI transactions, planned-language clarification, category normalization, description suggestion normalization, draft suggestion display, suggestion clearing after manual edit, Telegram getFile/photo download limits, image signature validation, receipt extraction fallback, authorized receipt draft preview, durable draft approval claim suppression, stale lease recovery, completed-claim recovery, secret verification, update ID validation, AI vision guard behavior, Google Sheets quota telemetry, report aggregation and date-range rules, CSV BOM/CRLF/RFC 4180 serialization, print HTML escaping, PDF generation/encryption, unbounded export detail behavior, OWNER/ADMIN service authorization, family isolation, encrypted short-lived report tokens, signed HTTPS action URLs, JSON/form request parsing, native download action route authorization, and Mini App export/print/PDF route authorization. Suite saat ini berisi 174 test.

## Roadmap Saat Ini

Milestone 0–7 — **Project Setup, Telegram Webhook, Family and Authorization Foundation, Family Management, Transaction Foundation, Manual Transaction Input, AI Text Parser, dan Receipt Processing** — selesai secara fungsional. Milestone 6 telah diuji melalui Telegram, termasuk natural-language extraction, draft server-side, tombol `Ya, simpan`/`Edit`/`Batalkan`, manual `/editdraft`, expiry, callback authorization, future-date validation, configurable `FALANCE_TIME_ZONE`, today-default transparan untuk transaksi aktual tanpa tanggal, saran kategori terkontrol, saran deskripsi opsional, dan klarifikasi bahasa perencanaan. Milestone 7 telah divalidasi di production dengan OpenRouter menggunakan model text dan vision yang terpisah; photo receipt divalidasi, diunduh secara server-side, diproses melalui receipt parser vision, dan diarahkan ke draft interaktif yang sama.

Milestone 8 sekarang **operationally ready untuk pengujian satu sampai dua keluarga** setelah production registry integrity check menghasilkan `healthy: true` dan `issues: []`. Validasi race lintas serverless instance dengan dua akun Telegram berbeda dan production replay testing tetap ditunda serta wajib diselesaikan sebelum public beta. Milestone 9 telah selesai secara operasional dan menyediakan read-only Telegram reports, authenticated Mini App reports, role-safe CSV export, print-friendly report, dan PDF server-side dengan optional password. Category summaries tetap ditunda karena schema `Transaction` belum memiliki persisted `category` field. **Milestone 10 — Telegram Mini App Expansion (P1)** sedang berjalan. Slice 1–5 telah diuji melalui Telegram Mini App, termasuk Dashboard, Transaksi, Laporan, Akun/Keluarga, readability branding, dan avatar Telegram viewer. Slice 6 Tambah Transaksi serta Slice 7 edit/soft-void telah diimplementasikan dengan endpoint terotorisasi dan regression coverage; validasi production untuk submit, edit, dan void masih menjadi langkah berikutnya. Anggaran, kategori, payment method, AI financial insight, dan Mini App receipt scanning tetap deferred sampai data contract dan service boundary masing-masing siap. **Milestone 11 — AI Usage, Quota, and Provider Reliability (P2)**, **Milestone 12 — Supabase Migration (P2)**, dan **Milestone 13 — Monetization and Expansion (P3)** tetap berada di roadmap. Urutan ini mempertahankan fokus pada satu sampai dua keluarga terlebih dahulu, menempatkan hardening sebelum public beta, dan menunda usage tracking, quota, monetisasi, serta scale-out sampai kebutuhan operasionalnya terbukti.

Detail scope, exit criteria, dan backlog eksperimen non-commitment tersedia di [`docs/milestones.md`](docs/milestones.md). Gemini Canvas tidak lagi menjadi numbered milestone karena bukan dependency produk Falancé.

## Dokumentasi Tambahan

- [`docs/architecture.md`](docs/architecture.md) — keputusan arsitektur, family isolation, Google API scope, dan report privacy.
- [`docs/database.md`](docs/database.md) — schema worksheet dan mapping data.
- [`docs/decisions.md`](docs/decisions.md) — Architecture Decision Records.
- [`docs/telegram.md`](docs/telegram.md) — detail webhook, command, identity, authorization, Mini App, dan report boundary.
- [`docs/milestones.md`](docs/milestones.md) — roadmap milestone dan status implementasi.
- [`docs/mini-app.md`](docs/mini-app.md) — design system, screen specification, responsive behavior, interaction flow, dan Mini App data boundary.
- [`docs/monitoring.md`](docs/monitoring.md) — operation labels, latency/error/quota diagnostics, dan aturan redaction.
- [`docs/backup-recovery.md`](docs/backup-recovery.md) — prosedur backup, restoration, partial-write retry, dan integrity response.

## Repository

Repository GitHub: [beembarik/falance](https://github.com/beembarik/falance)

Falancé saat ini belum merupakan aplikasi publik. Pengujian dilakukan secara terbatas oleh owner deployment sebelum fitur transaksi dan laporan dikembangkan.
