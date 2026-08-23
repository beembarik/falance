# Runbook Validasi Production M11

Dokumen ini digunakan untuk memvalidasi M11 Slice 1–4 pada deployment Falancé secara terkontrol. Pengujian harus dilakukan oleh operator yang memiliki akses ke environment deployment dan akun Telegram uji yang berwenang. Jangan menyalin API key, webhook secret, Telegram user ID, family ID, prompt, response, receipt, atau row values ke laporan, chat, issue, maupun screenshot.

## Prasyarat

Pastikan deployment berasal dari commit yang sudah disetujui dan environment provider primary sudah berfungsi. Provider fallback bersifat opsional. Jika fallback diuji, isi konfigurasi server-only yang lengkap untuk satu workload saja atau gunakan provider uji yang memang aman; jangan memakai credential production pada screenshot atau laporan.

| Pemeriksaan | Kriteria |
| --- | --- |
| Registry | `AI Text Usage` sudah tersedia dengan header yang benar dan `AI Vision Usage` lama tetap utuh. |
| Quota | Default atau policy deployment sudah diketahui operator, tanpa menampilkan user ID atau row values. |
| Provider | Primary text/vision terkonfigurasi; fallback hanya bila pengujian memang diperlukan. |
| Logging | `FALANCE_TIMING_LOGS` diaktifkan sementara pada deployment target dan akan dikembalikan ke `false` setelah test. |
| Safety | Semua transaksi hasil AI hanya menjadi draft dan memerlukan tombol approval. |

## Smoke test normal

Kirim satu pesan natural-language yang tidak mengandung data sensitif selain transaksi uji, misalnya nominal kecil dan deskripsi sintetis. Pastikan bot membuat draft, tidak langsung membuat transaksi, dan tombol approval tetap tersedia. Untuk vision, gunakan receipt sintetis atau fixture yang tidak memuat data pribadi. Pastikan image tidak muncul pada worksheet atau log.

Pada log deployment, cari event berdasarkan scope saja. Event normal harus menunjukkan `ai.text.request` atau `ai.vision.request` dengan `providerRole=primary` dan outcome sukses, kemudian response-phase yang sesuai. Jangan mengelompokkan atau mengekspor log berdasarkan Telegram ID, family ID, transaction ID, prompt, atau response.

## Validasi quota dan completion

Lakukan dua request text dalam rentang cooldown menggunakan akun uji yang sama. Request kedua harus menerima pesan Bahasa Indonesia yang menyatakan batas sementara atau retry-later dan parser tidak boleh dipanggil. Untuk vision, lakukan pengujian yang sama sesuai policy vision. Bila provider gagal setelah claim, pastikan claim tetap diselesaikan dan percobaan berikutnya tidak terblokir permanen setelah lease atau cooldown yang sesuai.

Command manual `/addincome` dan `/addexpense` harus tetap dapat digunakan saat quota AI text habis karena command tersebut tidak memanggil AI. Transaksi manual tetap melewati validasi service dan tidak boleh dianggap sebagai bypass authorization.

## Validasi degraded mode

Gunakan provider test atau konfigurasi yang dapat dikendalikan. Jangan sengaja membocorkan credential melalui URL, prompt, atau response. Validasi minimal berikut harus dilakukan secara berurutan.

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Provider belum dikonfigurasi | Pesan menyebut parser belum dikonfigurasi dan menawarkan jalur manual. |
| Primary timeout/network/server error tanpa fallback | Pesan menyebut layanan sementara tidak tersedia atau tidak merespons. |
| Primary rate limit dengan fallback tidak tersedia | Pesan menyebut batas penggunaan sementara dan menawarkan alternatif manual. |
| Primary transient error lalu fallback berhasil | Satu primary attempt, satu fallback attempt, lalu draft normal yang tetap membutuhkan approval. |
| Primary transient error lalu fallback gagal | Tidak lebih dari dua provider attempt; pesan menyebut provider cadangan tidak tersedia tanpa detail teknis. |
| Primary client error atau invalid response | Tidak ada fallback; pesan mengarahkan input alternatif atau retry yang sesuai. |

Pesan publik tidak boleh memuat status code, host, model, error message, response body, API key, prompt, receipt, atau data transaksi. Jika ada detail tersebut, hentikan validasi dan jangan membagikan log mentah.

## Verifikasi observability

Untuk setiap invocation fallback yang terkontrol, hitung event hanya berdasarkan `scope`, `providerRole`, dan outcome. Satu invocation boleh memiliki maksimal satu event primary dan satu event fallback pada request phase. `handlerMs`, `deliveryMs`, serta durasi AI digunakan untuk menentukan sumber latency secara aggregate. Jangan mencoba menghubungkan event dengan Telegram user ID atau update ID.

Setelah pengujian, simpan hanya ringkasan aggregate seperti jumlah request, jumlah fallback attempt, jumlah outcome per kind, dan rentang durasi. Hapus atau redaksi log mentah yang memuat detail sensitif bila platform menyertakannya secara otomatis. Kembalikan `FALANCE_TIMING_LOGS=false`, lakukan satu smoke test, lalu pastikan tidak ada perubahan pada workflow draft atau authorization.

## Kriteria lulus

M11 Slice 1–4 dianggap tervalidasi pada deployment bila quota denial terjadi sebelum provider call, completion tetap berjalan setelah kegagalan, fallback tidak lebih dari satu attempt, non-transient error tidak memicu fallback, degraded mode tetap aman dan berbahasa Indonesia, serta seluruh hasil AI tetap draft-only. Validasi ini tidak menghapus kebutuhan untuk menguji race lintas serverless instance dan tidak mengubah Google Sheets menjadi billing ledger.

## Catatan rollback

Jika fallback atau degraded mode menghasilkan perilaku yang tidak diharapkan, nonaktifkan seluruh variable fallback pada deployment dan kembalikan `FALANCE_TIMING_LOGS=false`. Provider primary tetap dapat dipakai tanpa fallback. Jika perubahan aplikasi perlu di-rollback, gunakan deployment sebelumnya yang telah tervalidasi; jangan menghapus worksheet usage atau mengubah row production secara manual sebagai langkah pertama.
