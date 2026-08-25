# Falancé Public Launch Runbook

## Tujuan dan keputusan release

Runbook ini menutup kesiapan public launch Falancé tanpa melakukan cutover database pada hari release. Production menggunakan Google Sheets sebagai satu-satunya source of truth. Supabase tetap berada pada jalur Preview/test dan tidak menjadi dependency untuk operasi Production. Keputusan ini memungkinkan public launch dilakukan tanpa menggabungkan risiko migrasi storage dengan risiko onboarding pengguna baru.

> **Release boundary:** public launch berarti membuka akses pengguna ke deployment Production Google-primary; public launch bukan persetujuan untuk mengaktifkan Supabase-primary, dual-write, atau shadow-read di Production.

## Production configuration gate

Sebelum launch, environment Production harus memenuhi konfigurasi berikut. Nilai secret tidak boleh dicatat pada issue, log, screenshot, atau dokumen.

| Area | Nilai atau aturan Production |
| --- | --- |
| Mini App URL | `https://falance.vercel.app` |
| Persistence | `FALANCE_PERSISTENCE_BACKEND=google-sheets` |
| Google registry | Spreadsheet pusat Production yang sudah di-backup dan dapat diakses service account |
| Supabase-primary | Tidak aktif; `FALANCE_SUPABASE_SERVICE_ROLE_KEY` tidak boleh tersedia di Production |
| Shadow-read | `FALANCE_SHADOW_READS=false`; shadow URL/key tidak boleh tersedia di Production |
| Telegram webhook | `FALANCE_TELEGRAM_WEBHOOK_SECRET` terisi dan sama dengan secret pada Telegram `setWebhook` |
| Report/export token | `FALANCE_REPORT_TOKEN_SECRET` terisi atau fallback yang telah dipahami operator |
| Timing logs | Aktif hanya bila sedang mendiagnosis, lalu dimatikan setelah verifikasi |
| AI provider | Text dan vision provider server-only; fallback hanya bila seluruh konfigurasinya memang telah diuji |

Environment Preview boleh memakai Supabase shadow credentials dan `FALANCE_SHADOW_READ_SAMPLE_RATE=0.1` serta `FALANCE_SHADOW_READ_MAX_CONCURRENCY=1`. Jangan menyalin credential Preview ke Production.

## Pre-launch checks

Operator menjalankan `npm run check:registry` pada salinan atau lingkungan operator yang memiliki akses registry. Hasil yang diterima adalah `healthy: true` dan `issues: []`. Pemeriksaan tidak boleh mengeluarkan row values, Telegram ID, family ID, credential, nama keluarga, atau spreadsheet ID ke chat, issue, atau log publik. Backup registry pusat harus mencakup seluruh worksheet pada satu titik waktu dan disimpan pada lokasi operator yang terlindungi.

Deployment Production harus berstatus `READY` dan menggunakan commit release yang telah melewati `npm test`, `npm run lint`, `npm run build`, serta `git diff --check`. BotFather harus menunjuk ke `https://falance.vercel.app` untuk Mini App Production. URL Preview tidak boleh dipasang sebagai URL launch publik.

## Launch-day smoke test

Smoke test hari launch dimulai dari akun OWNER dan dilakukan read-only terlebih dahulu. Operator membuka `/start`, `/help`, `/report`, dan `/reportapp`, kemudian pada Mini App memeriksa Beranda, Transaksi, Laporan, dan Akun. Operator melakukan satu atau dua reload untuk memastikan sesi Telegram, report, account, family context, dan avatar fallback tidak menyebabkan halaman berhenti pada loading. Tidak ada transaksi uji yang dibuat pada registry Production selama smoke test ini.

Setelah itu operator memeriksa log Production pada jendela waktu smoke test. Kriteria lulus adalah endpoint yang diuji berhasil, tidak ada error `5xx`, tidak ada `429 RESOURCE_EXHAUSTED`, tidak ada `mini app authorization` atau `unable to load` yang berulang, dan tidak ada indikasi cross-family data. Log yang dipakai untuk diagnosis harus tetap label/status/digest yang diizinkan; jangan menyalin request body, initData, provider response, atau row values.

## Operational policy after launch

Google Sheets tetap menjadi jalur tulis dan baca Production sampai ada keputusan cutover tertulis. Perubahan schema, import, environment backend, atau penghapusan row tidak dilakukan sebagai workaround saat public launch. Jika terjadi partial write, operator mengikuti `docs/backup-recovery.md`, menjalankan inspection read-only terlebih dahulu, dan tidak melakukan retry buta pada operasi tanpa idempotency key.

Supabase migration dilanjutkan setelah launch sebagai pekerjaan M12 pasca-launch. Prosedur detail tersedia di [`docs/supabase-migration-runbook.md`](supabase-migration-runbook.md). Urutannya adalah measurable Preview shadow-read observation, Production compatibility validation pada approved environment, backup and write-freeze plan, full-state idempotent import termasuk worksheet operasional, final delta reconciliation, rollback simulation termasuk post-switch writes, explicit maintenance-window approval, lalu deprecation plan untuk Google Sheets. Tidak ada satu pun tahap ini yang digantikan oleh manual CSV import.

## Rollback and incident triggers

Operator menghentikan onboarding atau mengembalikan URL Mini App ke deployment Production terakhir yang telah tervalidasi bila terjadi error `5xx` berulang pada endpoint inti, Google Sheets `429` yang menetap, kegagalan webhook authentication, laporan dari satu keluarga menampilkan data keluarga lain, atau write state yang tidak dapat direkonsiliasi secara aman. Supabase tidak digunakan sebagai rollback cepat; rollback release dan recovery registry dilakukan melalui runbook backup/recovery.

## Launch decision record

Pada saat checklist lulus, catat hanya metadata non-sensitif: tanggal dan waktu pemeriksaan, deployment ID/commit, hasil `check:registry`, jumlah endpoint yang sukses, ada/tidaknya `5xx` dan `429`, serta operator yang menyetujui launch. Jangan mencatat credential, Telegram identifier, family identifier, initData, row values, atau isi transaksi.
