# Runbook Backup, Recovery, dan Partial-Write Falancé

## Ruang lingkup dan prinsip

Falancé menggunakan **satu Google Spreadsheet pusat untuk seluruh keluarga dalam satu deployment**. Runbook ini tidak membuat spreadsheet per keluarga, tidak membagikan spreadsheet kepada pengguna bot, dan tidak menambahkan Google Drive API ke aplikasi. Backup dan restoration dilakukan oleh operator melalui Google Sheets atau mekanisme administrasi Google yang telah disetujui, sedangkan aplikasi tetap menggunakan Sheets-only OAuth scope.

> **Prinsip utama:** Jangan mengulang write yang hasilnya tidak diketahui sebelum membaca ulang row terkait. Sebuah HTTP error tidak selalu berarti write tidak terjadi.

Runbook ini berlaku untuk registry yang berisi worksheet `Settings`, `Families`, `Members`, `Invitations`, `Pending Family Creations`, `Pending Confirmations`, `Pending Transaction Drafts`, `Audit Log`, `Transactions`, `Processed Telegram Updates`, `AI Vision Usage`, dan `Draft Approval Claims`.

## Frekuensi backup dan retensi

Untuk tahap satu sampai dua keluarga, buat snapshot manual sebelum perubahan schema, perubahan besar pada service/repository, migrasi deployment, atau diagnosis yang berpotensi memerlukan restoration. Simpan setidaknya dua snapshot yang valid pada lokasi yang terenkripsi dan aksesnya dibatasi operator. Gunakan timestamp UTC pada nama file dan jangan memasukkan nama keluarga, Telegram ID, invitation code, atau deskripsi transaksi ke nama file.

Backup Google Sheets adalah snapshot point-in-time; backup tidak melakukan sinkronisasi setelah dibuat. Karena data registry bersifat rahasia, file export tidak boleh diletakkan pada chat, repository Git, issue tracker, atau storage publik. Simpan spreadsheet asli dan snapshot sebagai dua artefak terpisah sampai integrity check menyatakan snapshot dapat dipakai.

## Prosedur membuat backup

Pertama, pilih maintenance window dan minta pengguna tidak mengirim command transaksi atau lifecycle selama snapshot. Jangan menghapus webhook dan jangan menonaktifkan authorization sebagai cara menghentikan write. Kedua, dari Google Sheets UI gunakan fitur `File → Download` untuk membuat salinan workbook, atau gunakan prosedur administrasi Google yang telah disetujui untuk menyalin spreadsheet pusat. Aplikasi Falancé sendiri tidak menjalankan pembuatan file atau operasi Drive.

Ketiga, simpan export pada lokasi terenkripsi dengan permission minimum. Keempat, buat checksum file dan catat waktu snapshot, operator, spreadsheet sumber, serta commit deployment yang sedang aktif pada catatan internal yang tidak dikirim ke pengguna. Kelima, buka export dan pastikan seluruh 12 worksheet hadir serta headernya sesuai schema. Terakhir, jalankan integrity check terhadap registry aktif dan simpan output report yang hanya berisi jumlah row serta metadata issue, bukan row values.

Command integrity check tersedia sebagai:

```bash
npm run check:registry
```

Saat dijalankan, registry initialization mengenali dua schema legacy yang diketahui: urutan kolom lama pada `Invitations` dan format lama `Pending Family Creations` tanpa `family_name`. Migrasi hanya menata ulang atau menambahkan kolom kosong pada row yang sudah ada, memperbarui header ke schema saat ini, dan tidak menghapus row. Schema mismatch lain tidak boleh diperbaiki dengan menimpa header secara manual; simpan snapshot dan lakukan reconciliation terlebih dahulu.

Command tersebut memerlukan `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, dan `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` pada environment operator. Output hanya boleh dibagikan jika sudah dipastikan tidak mengandung nilai baris atau credential.

## Integrity check dan klasifikasi hasil

| Hasil | Arti | Tindakan |
| --- | --- | --- |
| `healthy=true` dan `issues=[]` | Header, key uniqueness, enum, foreign reference, active owner, serta claim consistency lulus pemeriksaan. | Simpan report bersama metadata backup. |
| `HEADER_MISMATCH` | Header worksheet berbeda dari schema aplikasi. | Hentikan deploy yang bergantung pada worksheet tersebut; jangan memperbaiki dengan menghapus kolom secara manual. |
| `DUPLICATE_KEY` | Ada key yang tidak unik. | Jangan menjalankan retry yang dapat menambah row; identifikasi row yang harus dipertahankan melalui prosedur operator. |
| `ORPHAN_REFERENCE` atau `ORPHAN_MEMBER` | Row merujuk ke family/member yang tidak ada atau tidak konsisten. | Preserve snapshot, hentikan destructive retry, dan lakukan reconciliation manual. |
| `NO_ACTIVE_OWNER` | Family tidak memiliki OWNER aktif. | Jangan mengubah role atau menghapus member; pulihkan state dari snapshot atau lakukan transfer ownership melalui prosedur yang disetujui. |
| `COMPLETED_WITHOUT_TRANSACTION` | Approval claim selesai tetapi transaction terkait tidak ditemukan. | Jangan menekan tombol approval berulang; bandingkan snapshot dan audit/transaction rows sebelum recovery. |

Integrity report tidak boleh dijadikan sumber authorization baru. `family_id` tetap diambil service dari membership atau invitation yang divalidasi server-side.

## Prosedur restoration

Restoration adalah operasi terkontrol dan tidak boleh dilakukan hanya karena satu request Telegram gagal. Sebelum restoration, simpan salinan registry saat ini untuk forensik dan jalankan integrity check. Tentukan snapshot yang paling baru dan lengkap; jangan menggabungkan worksheet dari snapshot berbeda tanpa reconciliation karena relasi antar-row dapat tidak konsisten.

Dalam maintenance window, hentikan aktivitas pengguna secara komunikatif dan jangan melakukan write manual pada registry aktif. Buat atau pulihkan satu spreadsheet pusat baru melalui Google Sheets UI atau prosedur administrasi yang disetujui. Setelah itu, pastikan service account memiliki akses Editor dan salin seluruh 12 worksheet beserta header, row, status soft-state, claim state, dan audit history. Spreadsheet hasil restoration tetap menjadi **satu** registry untuk seluruh family deployment, bukan spreadsheet khusus family tertentu.

Jalankan `npm run check:registry` terhadap spreadsheet hasil restoration sebelum mengubah deployment. Jika report sehat, ubah `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID` pada environment production ke spreadsheet hasil restoration, lakukan redeploy, lalu jalankan smoke test `/start`, `/members`, `/transactions`, dan satu operasi read-only untuk family yang diketahui. Setelah smoke test lulus, lakukan satu write non-destructive yang terkontrol. Pertahankan spreadsheet lama tanpa perubahan sampai recovery diterima dan periode observasi selesai.

Jika integrity check tidak sehat, jangan mengarahkan production ke spreadsheet tersebut. Kembalikan environment ke spreadsheet sebelumnya atau lanjutkan reconciliation offline. Jangan menghapus row untuk membuat check terlihat sehat; hard deletion dilarang untuk data family, membership, transaction, audit, dan claim.

## Partial-write retry matrix

| Alur | Partial-write yang mungkin | Tindakan retry aman |
| --- | --- | --- |
| `/createfamily` | `Families` sudah tertulis tetapi `Members` atau pending completion gagal. | Ulangi alur family creation untuk Telegram user yang sama. Service mencari family berdasarkan `created_by`, memakai `createMember` idempotently, lalu menyelesaikan pending row. Jangan membuat family ID baru secara manual. |
| `/join` | Invitation sudah `USED` oleh user yang sama tetapi membership write gagal. | Ulangi `/join` dengan code yang sama. Service mengenali same-user `USED` claim dan menyelesaikan membership yang hilang. Jangan memakai code baru sebelum integrity check. |
| `/join` antar-user | Dua instance berebut invitation yang sama. | Jangan menganggap dua response sukses sebagai bukti konsistensi. Periksa `Invitations` dan `Members`; validasi cross-instance tetap terbuka sampai storage conditional write tersedia. |
| Approval draft | Claim `CLAIMED` atau transaction write berhasil tetapi request berhenti sebelum completion. | Tunggu lease 60 detik bila claim masih aktif. Jika claim `COMPLETED` dan transaction ada, recovery mengembalikan transaction yang sama. Jika claim stale, approval dapat merebut claim dengan deterministic transaction ID. |
| Telegram update | Row `Processed Telegram Updates` tetap `CLAIMED` setelah timeout. | Jangan menambah row manual. Setelah lease lima menit stale, retry Telegram dapat merebut claim. Jika efek samping mungkin sudah terjadi, baca state domain sebelum memicu retry manual. |
| Transaction manual | Append berhasil tetapi response Telegram gagal. | Jangan langsung mengirim ulang command. Baca `Transactions` dan `Audit Log` untuk memeriksa kemungkinan transaction yang sudah tercatat. Karena structured manual input belum memiliki idempotency key user-level, operator harus mencegah retry buta. |
| Administrative update | Primary row berubah tetapi audit append gagal. | State utama dipertahankan; jangan mengulang operasi destructive. Catat incident pada operator log dan lakukan audit reconciliation sesuai prosedur manual. |
| Invitation creation | Invitation row berhasil tetapi response Telegram gagal. | Baca invitation berdasarkan waktu dan actor sebelum retry. Retry dapat menghasilkan code baru; revoke code yang tidak diperlukan melalui flow resmi, bukan menghapus row. |

## Recovery decision tree

Jika request menghasilkan error, pertama periksa apakah error terjadi sebelum claim, sesudah claim, atau sesudah primary write. Jika status domain belum diketahui, lakukan read-only inspection. Jika row menunjukkan state sukses, balas atau lanjutkan dari state tersebut; jangan mengulang write. Jika row menunjukkan state `CLAIMED` dengan lease aktif, tunggu atau beri pesan retry nanti. Jika lease stale, gunakan service retry yang sudah menyediakan reclaim. Jika row menunjukkan partial state yang belum memiliki recovery path, hentikan retry dan buat snapshot sebelum reconciliation manual.

Untuk semua recovery, pertahankan `family_id` yang sudah tersimpan server-side. Operator tidak boleh memperbaiki row dengan mengganti family ID berdasarkan input Telegram atau pesan pengguna. Setiap manual correction harus menyimpan alasan, waktu, operator, worksheet, row number, dan before/after values pada catatan internal yang memiliki akses terbatas.

## Batasan yang diketahui

Google Sheets tidak menyediakan compare-and-swap atau unique conditional write pada pola read-then-update adapter saat ini. Keyed locks mencegah race pada warm instance, sedangkan durable claim dan deterministic IDs memperbaiki retry recovery. Namun, jaminan absolut terhadap dua serverless instance yang membaca row kosong secara bersamaan masih memerlukan storage primitive dengan conditional write atau unique constraint. Item ini tetap terbuka dalam Milestone 8 dan menjadi salah satu alasan Supabase Migration dipertahankan dalam roadmap.

Runbook ini juga bukan pengganti backup provider, version history, atau disaster-recovery policy organisasi. Sebelum public beta, lakukan latihan restoration terkontrol pada salinan registry dan verifikasi bahwa seluruh command tetap mempertahankan isolasi family.


## M12 local-only cutover dan rollback rehearsal

The repository provides a local-only rehearsal command that simulates the non-destructive migration sequence with a synthetic fixture:

```bash
npm run rehearse:supabase-cutover -- --output /tmp/falance-cutover-rehearsal.json
```

The command performs no network access and never reads production credentials. It validates a healthy pre-cutover backup, creates a foreign-key-safe Supabase import plan, simulates a write-freeze final delta, verifies repeated import-plan generation is deterministic, and compares the rollback plan with the original backup plan. The simulated source of truth remains Google Sheets before and after the rehearsal, and no production switch or destructive rollback is applied.

A successful rehearsal must report `healthy: true`, `productionSwitchApplied: false`, `networkWriteAttempted: false`, `final_delta_detected_after_freeze: true`, `import_plan_is_idempotent: true`, and `rollback_plan_matches_backup: true`. The fixture is synthetic and proves orchestration and safety properties only; it does not prove live Supabase connectivity, Google Sheets restoration, Telegram compatibility, or production cutover readiness. Live cutover requires a separately approved maintenance window, a point-in-time backup, a reconciled sanitized import, final delta handling, post-switch smoke tests, and an explicit rollback decision.

## M12 Preview acceptance dan CSV test import

The guarded Preview deployment has completed authenticated non-production acceptance with the Supabase-primary adapter. Account and report reads returned HTTP 200; a clearly labeled test transaction was created with HTTP 201, updated with HTTP 200, voided with HTTP 200, and removed from the active report after reload. The test fixture was then cleaned up. This acceptance validates the server-side repository path and family authorization boundary only for Preview; it does not authorize a Production backend switch.

When service-role import automation is unavailable, a sanitized CSV copy may be imported manually into the dedicated Supabase test project. Import parent rows before child rows: `families`, then `members`, then `transactions`. Validate `family_id`, member foreign keys, active membership, status values, currency format, and row counts before testing. Do not upload raw Production exports to public storage, do not disable RLS, and do not use manual CSV import as a substitute for the final idempotent cutover procedure. Remove test fixtures after acceptance and retain only the operator-controlled migration evidence.

## Slice 18 security hardening dan pre-public-beta checks

M10 Slice 18 menambahkan baseline security headers pada seluruh response Next.js, termasuk `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` tanpa camera/microphone/geolocation, dan HSTS untuk deployment HTTPS. Seluruh response API diberi `Cache-Control: no-store, max-age=0` agar raw `initData`, signed action URL, report content, dan error response tidak disimpan oleh cache.

Webhook Telegram membandingkan secret menggunakan timing-safe comparison dan menolak body di atas 1 MB sebelum parsing update. Signed report token menolak token di atas 4096 karakter sebelum verifikasi AES-GCM. Batas ini adalah defense-in-depth; secret webhook, token encryption, update claim, dan service authorization tetap menjadi kontrol utama.

Sebelum public beta, operator wajib memastikan production headers hadir melalui deployment check, menguji webhook tanpa secret dan dengan secret salah, menguji body webhook oversized, memverifikasi duplicate `update_id` tetap diabaikan, serta menguji expired/tampered/oversized report token. Jalankan `npm run check:registry` setelah maintenance atau restoration dan pastikan hasilnya `healthy: true` serta `issues: []`. Latihan restoration terkontrol dan validasi race lintas serverless instance tetap merupakan exit item terpisah sampai storage dengan conditional write atau unique constraint tersedia.
