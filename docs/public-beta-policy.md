# Falancé Public Beta Policy

**Status:** Implementasi awal pada branch `beta-release`  
**Model:** Free limited access  
**Production source of truth:** Google Sheets  
**Supabase:** Migration-ready, belum menjadi backend Production  

## Tujuan

Public Beta digunakan untuk memvalidasi core value Falancé pada keluarga Indonesia dengan akses gratis yang dibatasi secara waktu, kapasitas, dan fitur. Beta bukan paid launch dan bukan komitmen bahwa seluruh fitur Production komersial telah selesai.

## Scope fitur beta

Selama Public Beta, fitur Vision/receipt scanning dinonaktifkan. Pengujian Vision ditunda sampai beta berjalan pada deployment Production yang telah disetujui. Karena webhook Telegram bersifat global per bot, pengujian Mini App Preview tidak dapat membuktikan guard Vision pada webhook Production tanpa bot atau webhook terpisah; webhook Production tidak diubah selama beta preparation.

| Fitur | Status beta | Catatan |
|---|---|---|
| `/start`, `/help`, onboarding, invitation, dan join | Aktif | Mengikuti authorization dan role yang sudah ada |
| Pencatatan transaksi manual | Aktif | AI tidak boleh menyimpan transaksi secara langsung |
| AI text parser | Aktif terbatas | Menghasilkan draft; tetap memerlukan review/approval |
| Receipt Vision | Dikunci | Disiapkan untuk update beta berikutnya |
| Mini App dashboard | Aktif untuk family beta | Beranda, Transaksi, Laporan, dan Akun |
| Category summary dan analytics | Aktif | Membaca transaksi aktual; bukan budget planner |
| CSV export | Aktif terbatas | OWNER/ADMIN, tetap mengikuti authorization, dan menggunakan dialog native `Telegram.WebApp.downloadFile()` |
| Print Preview | Dikunci | Tombol UI dihilangkan dan endpoint menolak akses |
| PDF export | Dikunci | Tombol UI dihilangkan dan endpoint menolak akses |
| Budget planner | Deferred | Bukan bagian beta awal |
| Recurring liability | Deferred | Planned obligation, bukan actual transaction atau budget |

## Acceptance beta

CSV export telah divalidasi pada deployment Preview beta melalui Telegram Mini App menggunakan akun OWNER/ADMIN. Dialog download native muncul, file tersimpan tanpa membuka window browser atau safe-browsing tab, dan isi CSV laporan transaksi tervalidasi. Implementasi memiliki fallback fail-closed: tombol disembunyikan pada client yang tidak menyediakan API native tersebut. Print Preview dan PDF tetap dikunci, sedangkan Vision tetap disabled selama beta.

## Capacity policy

Beta dibuka bertahap menggunakan soft cap family. Cohort awal adalah 5 family, kemudian 10, 15, dan maksimal 20 family. Setiap family dibatasi maksimal 3 active member pada beta awal, sehingga ceiling nominalnya adalah 60 active members.

Cap family berlaku untuk onboarding baru. Family yang sudah diterima tetap dapat menggunakan layanan ketika soft cap tercapai, kecuali operator menekan pause switch atau layanan perlu dihentikan untuk alasan keamanan/recovery. Karena Google Sheets adalah backend terpusat dan pemeriksaan cap dapat menghadapi race lintas instance serverless, angka tersebut adalah operational ceiling, bukan jaminan load capacity tanpa batas.

## Environment beta

Environment berikut hanya boleh dipasang pada deployment beta:

```text
FALANCE_PUBLIC_BETA=true
FALANCE_BETA_VISION_ENABLED=false
FALANCE_BETA_PRINT_ENABLED=false
FALANCE_BETA_PDF_ENABLED=false
FALANCE_BETA_MAX_FAMILIES=20
FALANCE_BETA_MAX_ACTIVE_MEMBERS_PER_FAMILY=3
```

Service-role Supabase, jika digunakan untuk migration readiness atau observation, tetap server-only dan Preview/test-only. Production harus tetap menggunakan:

```text
FALANCE_PERSISTENCE_BACKEND=google-sheets
```

## Status beta tester dan benefit

Badge `Public Beta` menunjukkan deployment sedang berada pada mode beta. Badge `Founder Beta Tester` menunjukkan bahwa family dibuat melalui onboarding saat Public Beta aktif dan memiliki plan registry `BETA`. Semua active member pada family tersebut mewarisi status tester melalui server-side family membership. Family yang sudah ada sebelum beta tidak otomatis berubah menjadi beta tester; operator dapat menambahkannya melalui proses enrollment yang terdokumentasi, bukan melalui manipulasi request dari client.

Status `BETA` dipertahankan setelah beta berakhir agar dapat menjadi input entitlement dan benefit masa depan. Benefit final—misalnya founder pricing, credit terbatas, atau priority support—belum dijanjikan sampai pricing dan unit economics diputuskan. Tidak ada lifetime-free promise pada tahap ini.

## Feedback dan support

Halaman Akun dapat menampilkan badge `Public Beta`, versi runtime, dan CTA menuju akun support Telegram public melalui `FALANCE_SUPPORT_TELEGRAM_URL`. URL tersebut harus berupa HTTPS pada host `t.me` atau `telegram.me`. Feedback tidak boleh meminta pengguna mengirim Telegram ID, family ID, raw transaction rows, receipt, credential, atau data rahasia.

## Release flow

Branch `beta-release` dibuat dari `main` Production terbaru. Perubahan beta diuji pada deployment Preview khusus beta dengan environment beta. Setelah quality gate dan acceptance selesai, beta dapat diberi domain beta atau URL Preview yang stabil. Perubahan beta tidak boleh otomatis dipromosikan ke Production.

PDF, Print Preview, dan Vision dapat dibuka pada update beta berikutnya dengan mengubah feature flag melalui deployment baru, setelah acceptance dan cost review. Pengaktifan fitur tidak boleh hanya dilakukan pada UI; endpoint server juga harus dibuka secara eksplisit.

## Monetisasi yang belum dikunci

Beta tidak memungut biaya dan tidak meminta metode pembayaran. Calon model pasca-beta adalah subscription bulanan berbasis family dengan quota AI transparan. Mini App penuh, quota lebih tinggi, export lanjutan, dan Vision dapat menjadi entitlement paid plan, tetapi benefit beta tester belum diputuskan dan tidak boleh dijanjikan sebagai lifetime free sebelum unit economics selesai.

## Kriteria pause beta

Onboarding family baru harus dihentikan sementara apabila muncul pola `429` Google Sheets, `5xx` pada endpoint utama, repeated `unable to load`, authorization failure yang bukan session invalid, lonjakan latency, atau indikasi data isolation failure. Penghentian onboarding tidak menghapus data family yang sudah terdaftar.
