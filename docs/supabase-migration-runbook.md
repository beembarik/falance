# Falancé Supabase Migration Runbook

## 1. Status dan tujuan

Dokumen ini menjelaskan prosedur untuk memindahkan persistence Falancé dari Google Sheets ke Supabase apabila migration window yang disetujui dibutuhkan setelah public release. **Production saat ini tetap menggunakan Google Sheets.** Dokumen ini tidak merupakan persetujuan cutover, tidak mengubah environment Production, dan tidak mengizinkan Supabase service-role key disimpan di repository atau dikirim melalui chat.

Readiness dibagi menjadi dua tingkat:

| Tingkat | Arti | Status |
| --- | --- | --- |
| Migration package ready | Schema, RLS, atomic RPC, repository adapter, import plan, idempotent executor, rehearsal, test validation, dan rollback procedure tersedia | **Selesai** |
| Production cutover ready | Snapshot Production terbaru telah direkonsiliasi, operational state tervalidasi, maintenance window disetujui, final delta dan rollback plan siap, lalu smoke test pasca-switch berhasil | **Belum; harus diputuskan saat migration window** |

Migration package ready berarti migrasi dapat dimulai tanpa membangun tooling dari awal. Ia tidak berarti data Production sudah berada di Supabase atau aplikasi sudah menggunakan Supabase.

## 2. Invariants yang tidak boleh berubah

Falancé tetap memakai satu central database atau spreadsheet per deployment, bukan satu database per family. `family_id` selalu diselesaikan oleh server dari membership Telegram yang aktif; browser dan import operator tidak boleh menjadi sumber authorization. AI tetap hanya menghasilkan draft dan tidak boleh menulis transaksi secara langsung. Supabase menggunakan PostgreSQL `CHECK` constraints, foreign keys, indexes, dan RLS deny-by-default; native enum tidak digunakan sebagai bagian dari migration contract.

Selama belum ada keputusan cutover, konfigurasi Production harus tetap `FALANCE_PERSISTENCE_BACKEND=google-sheets`, tanpa Supabase-primary dan tanpa shadow-read. Supabase service-role hanya boleh digunakan dari protected operator environment atau deployment Preview/test yang telah ditentukan.

## 3. Data yang wajib dimigrasikan

Snapshot harus diambil pada satu titik waktu dan mencakup seluruh worksheet berikut. Worksheet operasional tidak boleh dilewati karena menyimpan state retry, approval, replay protection, dan quota.

| Urutan | Worksheet sumber | Tabel Supabase | Conflict key |
| ---: | --- | --- | --- |
| 1 | `Settings` | `settings` | `key` |
| 2 | `Families` | `families` | `family_id` |
| 3 | `Members` | `members` | `member_id` |
| 4 | `Invitations` | `invitations` | `invitation_id` |
| 5 | `Pending Family Creations` | `pending_family_creations` | `telegram_user_id` |
| 6 | `Pending Confirmations` | `pending_confirmations` | `confirmation_id` |
| 7 | `Audit Log` | `audit_log` | `audit_id` |
| 8 | `Pending Transaction Drafts` | `pending_transaction_drafts` | `draft_id` |
| 9 | `Draft Approval Claims` | `draft_approval_claims` | `draft_id` |
| 10 | `Processed Telegram Updates` | `processed_telegram_updates` | `update_id` |
| 11 | `AI Vision Usage` | `ai_vision_usage` | `usage_key` |
| 12 | `AI Text Usage` | `ai_text_usage` | `usage_key` |
| 13 | `Transactions` | `transactions` | `transaction_id` |

Snapshot Production bersifat sensitif. Simpan pada lokasi terenkripsi dengan akses minimum, gunakan timestamp UTC pada catatan operator, dan jangan menyimpan file tersebut di Git, issue tracker, public storage, atau chat. CSV manual hanya dapat digunakan untuk data test/Preview yang sudah disanitasi; ia bukan pengganti import Production yang idempotent.

## 4. Tahap A — Preflight dan freeze

Pilih maintenance window dan informasikan write freeze kepada pengguna. Jangan menonaktifkan webhook authentication atau authorization untuk menghentikan write. Jangan menjalankan migration bersamaan dengan perubahan schema, perubahan role, invitation, transaksi, approval draft, atau perubahan quota.

Ambil point-in-time backup registry Google Sheets dan pertahankan spreadsheet asli tanpa perubahan. Jalankan integrity check pada registry sumber:

```bash
npm run check:registry
```

Hanya lanjut bila report menghasilkan `healthy: true` dan `issues: []`. Simpan metadata internal yang tidak sensitif: waktu backup, commit deployment, checksum snapshot, hasil integrity check, dan operator. Jangan menyimpan row values, Telegram ID, family ID, invitation code, credential, atau deskripsi transaksi pada catatan publik.

## 5. Tahap B — Rehearsal dan import plan

Jalankan rehearsal local-only sebelum network write. Rehearsal tidak membaca credential Production dan tidak melakukan perubahan ke Supabase:

```bash
npm run rehearse:supabase-cutover -- \
  --output /path/ke/rehearsal-report.json
```

Report yang diterima harus menyatakan `healthy: true`, `productionSwitchApplied: false`, `networkWriteAttempted: false`, `final_delta_detected_after_freeze: true`, `import_plan_is_idempotent: true`, dan `rollback_plan_matches_backup: true`.

Setelah snapshot lolos validasi, buat import plan pada protected operator environment. Untuk Production, gunakan snapshot terlindungi yang tidak dipublikasikan; untuk Preview/test, gunakan snapshot yang telah disanitasi:

```bash
npm run prepare:supabase-import -- \
  --input /path/ke/snapshot.json \
  --output /path/ke/local-import-plan.json \
  --local-only
```

Import plan menentukan projection kolom, validasi schema, foreign-reference checks, urutan batch, dan conflict key. Jangan mengedit plan secara manual setelah dibuat; ulangi proses dari snapshot jika sumber berubah.

## 6. Tahap C — Import ke Preview/test

Sebelum menyentuh Production, jalankan plan ke dedicated Supabase Preview/test project dari environment operator yang memiliki URL dan service-role key server-only. Jangan menyalin key ke browser, repository, screenshot, atau command history yang dibagikan.

```bash
npm run apply:supabase-import -- \
  --input /path/ke/local-import-plan.json \
  --target preview \
  --allow-network
```

Executor mengirim satu idempotent PostgREST upsert batch per tabel, menghentikan proses pada batch pertama yang gagal, dan hanya mengeluarkan target, source-sheet metadata, jumlah batch, serta jumlah row. Rerun pada plan yang sama aman pada conflict key database, tetapi setiap rerun tetap harus diikuti reconciliation.

Setelah import, bandingkan row count dan canonical digest per tabel dari source snapshot dan Supabase. Jalankan acceptance read-only pada account, report, transaksi, dan akun Mini App. Jika diperlukan, lakukan satu transaksi test yang diberi label dan bersihkan kembali setelah acceptance. Supabase RLS tidak boleh dimatikan sebagai workaround.

## 7. Tahap D — Final delta dan Production import

Setelah Preview/test lulus, ambil snapshot final atau final delta pada akhir write freeze. Pastikan tidak ada write yang tertinggal pada `Processed Telegram Updates`, `Draft Approval Claims`, pending drafts, AI usage, audit log, atau transactions. Rebuild import plan dari snapshot final jika ada perubahan.

Production import hanya boleh dilakukan setelah maintenance approval tertulis. Jalankan dari protected operator environment dengan project Supabase Production yang telah diverifikasi melalui metadata internal. Guard executor memerlukan konfirmasi eksplisit:

```bash
FALANCE_SUPABASE_IMPORT_PRODUCTION_CONFIRM=I_CONFIRM_MAINTENANCE_WINDOW \
npm run apply:supabase-import -- \
  --input /path/ke/local-import-plan.json \
  --target production \
  --allow-network
```

Guard tersebut hanya mengizinkan import data; ia **tidak mengubah backend aplikasi**. Import harus selesai dan row count/digest harus direkonsiliasi sebelum deployment diarahkan ke Supabase. Jika satu batch gagal, hentikan proses, pertahankan backup dan log metadata, jangan menghapus row untuk memaksa check lulus, dan lakukan diagnosis berdasarkan status code aman tanpa mencetak response body.

## 8. Tahap E — Switch backend dan acceptance

Setelah import dan reconciliation lulus, ubah environment deployment Production secara terpisah:

```text
FALANCE_PERSISTENCE_BACKEND=supabase
FALANCE_SUPABASE_URL=<server-only production URL>
FALANCE_SUPABASE_SERVICE_ROLE_KEY=<server-only production key>
```

Jangan mengatur `family_id` dari browser. Redeploy hanya pada maintenance window, lalu jalankan smoke test berurutan: webhook health, `/start`, `/help`, `/report`, Mini App account/report, satu read-only transaction listing, dan pemeriksaan audit/operational state. Untuk write test, gunakan hanya skenario yang telah disetujui dan dapat direkonsiliasi; jangan menggunakan Production sebagai sandbox.

Acceptance switch dinyatakan lulus hanya bila endpoint inti stabil, data family tetap terisolasi, report dan transaction semantics sama dengan Google Sheets, status `VOID` tetap benar, replay/update claim tetap bekerja, draft approval tidak menggandakan transaksi, invitation one-time tetap conditional, dan AI quota state tidak hilang. Pertahankan Google Sheets dalam keadaan utuh dan read-only sebagai rollback source selama periode observation yang disepakati.

## 9. Rollback

Rollback dipertimbangkan bila terjadi data isolation issue, repeated `5xx`, persistent database failure, duplicate transaction, replay/claim inconsistency, kehilangan audit atau operational state, atau mismatch report yang tidak dapat dijelaskan. Jangan melakukan rollback hanya karena satu request Telegram transient gagal.

Urutan rollback adalah menghentikan write baru melalui komunikasi maintenance, menyimpan metadata incident dan snapshot Supabase, mengembalikan `FALANCE_PERSISTENCE_BACKEND=google-sheets`, menghapus atau menonaktifkan credential Supabase dari environment aplikasi sesuai prosedur secret management, redeploy, lalu menjalankan smoke test read-only. Google Sheets lama tidak boleh dihapus atau ditimpa sampai acceptance Supabase selesai. Jika terdapat write yang terjadi setelah switch, rekonsiliasi final harus menentukan apakah write tersebut sudah ada di Google Sheets sebelum rollback; jangan melakukan merge manual tanpa audit trail.

## 10. Exit criteria dan evidence

Migration window dapat ditutup bila semua kriteria berikut terpenuhi:

| Kriteria | Bukti minimum |
| --- | --- |
| Backup source tersedia | Checksum, timestamp UTC, operator, dan lokasi terlindungi |
| Source sehat | `healthy: true`, `issues: []` |
| Semua worksheet diproses | Import plan mencakup 13 worksheet, termasuk operational state |
| Import aman | Semua batch berhasil atau kegagalan ditangani tanpa partial-write yang tidak diketahui |
| Parity lulus | Row count dan canonical digest per tabel direkonsiliasi |
| Application compatibility lulus | Read/write/claim/approval/audit smoke test sesuai scope maintenance |
| Rollback siap | Backup source, rollback environment, dan post-switch write handling diuji |
| Monitoring lulus | Tidak ada error rate, latency, quota, atau authorization regression yang tidak terjelaskan |
| Approval tercatat | Keputusan operator dan maintenance owner tercatat tanpa data sensitif |

Evidence publik cukup menyimpan commit, deployment ID, timestamp, status code aggregate, row-count aggregate, digest metadata yang telah disetujui, dan hasil gate. Raw snapshot, service-role key, request body, initData, Telegram ID, family ID, row values, provider response, dan transaction description tetap berada pada operator-controlled storage.

## 11. Jalur emergency migration

Jika Google Sheets mengalami bottleneck setelah public release, jangan langsung mengubah backend berdasarkan error tunggal. Pertama stabilkan dan klasifikasikan incident, buat backup, jalankan `check:registry`, aktifkan write freeze, dan pastikan project Supabase Production yang benar. Karena executor, schema, RPC, import plan, dan rollback runbook sudah tersedia, pekerjaan emergency migration berfokus pada snapshot terbaru, final delta, reconciliation, approved switch, dan observation—bukan pembangunan ulang tooling.

Public launch dan Supabase migration tetap merupakan dua keputusan berbeda. Launch dapat berlangsung dengan Google Sheets-primary, sedangkan migration dapat dimulai kapan saja setelah gate maintenance terpenuhi.
