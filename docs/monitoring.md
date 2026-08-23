# Monitoring dan Diagnostics Falancé

## Tujuan

Falancé menggunakan structured server-side logs untuk diagnosis latency, error-rate, dan quota tanpa mencatat credential, spreadsheet ID, Telegram identity, request body, atau nilai baris Google Sheets. Monitoring ini ditujukan untuk deployment kecil satu sampai dua keluarga dan tidak menggantikan audit data atau backup registry.

## Konfigurasi

Aktifkan `FALANCE_TIMING_LOGS=true` hanya ketika melakukan diagnosis latency atau provider. Ketika aktif, log durasi dikirim sebagai event `[Timing]` dengan `scope`, `durationMs`, dan operation fields yang aman. Setelah diagnosis selesai, kembalikan nilainya menjadi `false` agar volume log tetap rendah.

| Scope | Makna | Field aman yang utama |
| --- | --- | --- |
| `telegram.webhook` | Request ditolak sebelum dispatch karena konfigurasi secret, authorization, JSON, atau bentuk update. | `outcome`, `status`, `durationMs` |
| `telegram.update` | Update Telegram berhasil, diabaikan, atau ditekan sebagai duplicate. | `updateType`, `outcome`, `status`, `handlerMs`, `deliveryMs`, `durationMs` |
| `telegram.update.error` | Exception saat claim, handler, pengiriman Telegram, atau completion update. | `errorType`, `durationMs` |
| `google.request` | Request Google Sheets atau metadata registry. | `operation`, `method`, `status`, `outcome`, `durationMs` |
| `ai.text.request` / `ai.vision.request` | Request ke provider AI. | `provider`, `status`, `outcome`, `durationMs` |
| `ai.text.response` / `ai.vision.response` | Parsing response provider AI. | `provider`, `outcome`, `durationMs` |

## Interpretasi event penting

`google.request` dengan `outcome=quota_exceeded` dan `quota=google_sheets` menunjukkan HTTP 429 dari Google Sheets. Periksa apakah terjadi burst request, cold-start registry initialization berulang, atau operasi yang melakukan read amplification. Jangan mengatasi 429 dengan menonaktifkan family isolation atau mengurangi validasi authorization.

`telegram.update` dengan `outcome=duplicate` menunjukkan update sudah memiliki claim durable atau status `COMPLETED`. Event ini normal ketika Telegram melakukan retry atau request yang sama masuk lebih dari sekali. Duplicate tidak boleh menghasilkan pesan atau transaction kedua.

`telegram.update.error` perlu dikorelasikan dengan `google.request` dan `ai.*` berdasarkan waktu deployment/function invocation, bukan berdasarkan Telegram user ID atau update ID. Falancé sengaja tidak mencatat identifier tersebut pada timing event.

Untuk AI, response-phase `outcome=no_content`, `invalid_json`, `schema_invalid`, dan `needs_clarification` menunjukkan hasil provider yang tidak dapat langsung dipakai. Request-phase dapat menghasilkan `success`, `timeout`, `network`, `rate_limited`, `server_error`, atau `client_error`. `not_configured` dicatat pada error classification internal ketika provider belum dikonfigurasi. Event tersebut tidak mencatat prompt, response content, receipt image, API key, atau transaction data. Klasifikasi ini belum mengaktifkan fallback otomatis; fallback dibatasi untuk slice berikutnya setelah policy dan retry safety divalidasi.

## Prosedur diagnosis latency

Pertama, aktifkan `FALANCE_TIMING_LOGS` pada environment production dan lakukan satu atau dua request terkontrol. Kedua, buka log deployment yang sama di Vercel dan kelompokkan event berdasarkan `scope`. Ketiga, bandingkan `handlerMs` dengan `deliveryMs`: handler tinggi biasanya mengarah ke Google Sheets atau AI provider, sedangkan delivery tinggi mengarah ke Telegram Bot API. Keempat, setelah penyebab ditemukan, nonaktifkan timing logs dan lakukan satu smoke test untuk memastikan webhook kembali normal.

| Gejala | Pemeriksaan pertama | Tindakan aman |
| --- | --- | --- |
| Response Telegram lambat dan `ai.*` tinggi | Provider, model, `status`, dan response outcome | Uji provider/model yang kompatibel; jangan log content atau credential. |
| `google.request` tinggi tanpa AI event | Operation label dan jumlah read registry | Kurangi read amplification melalui cache atau request-scoped memoization; pertahankan server-side authorization. |
| Banyak `quota_exceeded` | Status 429 dan operation label | Perlambat burst, pertahankan client reuse, dan evaluasi storage scale-out; jangan membuat spreadsheet per keluarga. |
| Banyak `telegram.update.error` | `errorType` dan event Google/AI pada invocation yang sama | Periksa dependency yang gagal dan retry safety; jangan menganggap request 200 sebagai business success tanpa completion state. |
| Banyak duplicate | `telegram.update` dengan `outcome=duplicate` | Pastikan `Processed Telegram Updates` memiliki claim/completion state dan lease yang benar. |

## Batas keamanan

Log diagnostik tidak boleh berisi `TELEGRAM_BOT_TOKEN`, `FALANCE_TELEGRAM_WEBHOOK_SECRET`, `FALANCE_AI_API_KEY`, private key, `GOOGLE_FAMILY_REGISTRY_SPREADSHEET_ID`, Telegram user ID, family name, invitation code, transaction description, prompt, response content, receipt bytes, atau row values. Jika provider atau platform menambahkan detail error secara otomatis, detail tersebut harus melalui redaction sebelum dicatat.

Monitoring bersifat observability, bukan sumber authorization. `family_id` tetap selalu di-resolve dari membership atau invitation server-side. Event monitoring tidak boleh dipakai untuk menerima `family_id` dari Telegram atau client.

## Batasan dan tindak lanjut

Vercel logs menyediakan agregasi dan pencarian operasional pada level deployment, tetapi belum menjadi metrics store atau alerting system khusus Falancé. Slice berikutnya setelah monitoring adalah runbook backup, recovery, partial-write retry, dan integritas registry. Validasi race lintas serverless instance tetap terbuka karena Google Sheets tidak menyediakan compare-and-swap atau unique conditional write pada pola adapter saat ini.
