# Operasi AI Falancé

Dokumen ini menjelaskan kontrol operasional AI pada Falancé. Kontrol ini berlaku untuk **AI text parser** dan **receipt vision parser**. M11 Slice 1 menambahkan tracking dan quota durable untuk workload text, M11 Slice 2 menambahkan klasifikasi error provider dan outcome timing yang aman, M11 Slice 3 menambahkan fallback provider satu tingkat untuk kegagalan transient, dan M11 Slice 4 menambahkan degraded-mode messaging Bahasa Indonesia. Retry policy provider yang lebih luas tetap berada di backlog.

## Prinsip keamanan

AI hanya membantu membuat **draft transaksi**. AI tidak menentukan identitas pengguna, `family_id`, role, authorization, transaction status, atau keputusan persistence. Semua draft tetap melewati validasi deterministic dan approval eksplisit pengguna sebelum transaksi disimpan.

Falancé tidak mencatat prompt, response mentah, token atau biaya provider, API key, receipt bytes, raw family name, display name, atau identifier mentah ke log diagnostik, browser, maupun Telegram. Worksheet usage adalah storage operasional server-side dan tidak dibagikan langsung kepada pengguna. Data usage dipakai untuk enforcement quota, bukan untuk menampilkan riwayat isi percakapan.

## Worksheet usage

Falancé mempertahankan worksheet terpisah untuk setiap workload agar data vision yang sudah ada tidak perlu dimigrasikan atau dihapus.

| Worksheet | Workload | Key | State |
| --- | --- | --- | --- |
| `AI Text Usage` | Natural-language transaction parser | `family_id:telegram_user_id` yang dibentuk server | `IN_FLIGHT` atau `COMPLETED` |
| `AI Vision Usage` | Receipt photo parser | `family_id:telegram_user_id` yang dibentuk server | `IN_FLIGHT` atau `COMPLETED` |

Kedua worksheet hanya menggunakan field operasional berikut: `usage_key`, `family_id`, `telegram_user_id`, `window_started_at`, `request_count`, `last_claimed_at`, `lease_until`, dan `status`. Tidak ada kolom prompt, response, model output, receipt content, atau token count.

`family_id` dan Telegram user ID pada key berasal dari membership aktif yang di-resolve oleh service. Nilai tersebut tidak pernah diterima dari browser atau command sebagai sumber authorization. Registry integrity checker memvalidasi required fields, unique key, family reference, active member reference, status enum, dan non-negative request count tanpa mencetak row values.

## Quota dan claim semantics

Pada M11 Slice 1, text parser menggunakan default berikut.

| Control | Environment variable | Default |
| --- | --- | ---: |
| Cooldown antar-attempt | `FALANCE_AI_TEXT_COOLDOWN_SECONDS` | 5 detik |
| Rolling window | `FALANCE_AI_TEXT_WINDOW_SECONDS` | 3.600 detik |
| Maximum attempts per window | `FALANCE_AI_TEXT_MAX_REQUESTS` | 30 |
| In-flight lease | `FALANCE_AI_TEXT_LEASE_SECONDS` | 60 detik |

Satu request natural-language melakukan durable claim **sebelum** provider dipanggil. Claim dihitung sebagai attempt, sehingga provider failure tetap mengonsumsi satu slot. Semantics ini sengaja mencegah retry storm ketika provider sedang bermasalah. Bila claim ditolak, parser tidak dipanggil dan bot mengembalikan pesan Bahasa Indonesia yang meminta pengguna mencoba lagi atau memakai `/addincome`/`/addexpense`.

Setelah provider selesai, baik berhasil maupun gagal, handler memanggil completion pada blok `finally`. Completion menghapus lease dan mengubah state menjadi `COMPLETED`, sedangkan `request_count` tetap dipertahankan. Jika invocation crash sebelum completion, claim dapat dipulihkan setelah lease berakhir.

Command manual `/addincome` dan `/addexpense` tidak melalui AI parser dan tidak mengonsumsi quota text. Receipt photo tetap menggunakan guard `AI Vision Usage` yang sudah ada dengan policy vision tersendiri.

## Konkurensi dan batas Google Sheets

Repository memiliki keyed lock untuk kombinasi deployment, family, dan user pada warm instance. Lock tersebut mengurangi race condition dalam satu instance. Google Sheets tetap tidak menyediakan compare-and-swap pada pola read-then-update yang digunakan repository ini, sehingga keyed lock tidak memberikan jaminan atomic lintas serverless instance.

Validasi cross-instance dan keputusan storage primitive dengan conditional write tetap merupakan hardening backlog dan wajib sebelum public beta. Jangan menganggap quota worksheet sebagai billing ledger atau sebagai sistem global anti-abuse sampai batas lintas instance tersebut diselesaikan.

## Klasifikasi error provider

M11 Slice 2 membedakan kegagalan request provider menjadi `timeout`, `network`, `rate_limited`, `server_error`, dan `client_error`. HTTP 408 dan 504 diklasifikasikan sebagai timeout, HTTP 429 sebagai rate limit, HTTP 5xx sebagai server error, dan HTTP 4xx lainnya sebagai client error. Provider yang belum memiliki base/key/model menghasilkan `not_configured`. Response yang tidak memiliki content, JSON valid, atau schema yang sesuai tetap menjadi `invalid_response` pada error detail dan mempertahankan outcome response-phase yang lebih spesifik (`no_content`, `invalid_json`, atau `schema_invalid`).

Klasifikasi hanya disimpan pada error object internal dan safe timing outcome. Pesan publik tetap generik dalam Bahasa Indonesia, dan detail error provider, response body, API key, prompt, receipt, serta transaction data tidak diteruskan ke user atau log.

Request network exception yang memiliki `AbortError` diklasifikasikan sebagai timeout; exception lainnya diklasifikasikan sebagai network.

## One-level fallback

M11 Slice 3 menyediakan konfigurasi fallback terpisah untuk setiap workload. Fallback hanya digunakan bila seluruh trio base URL, API key, dan model tersedia, serta berbeda dari provider primary. Provider primary dicoba lebih dahulu. Fallback dapat dicoba **tepat satu kali** hanya bila primary gagal dengan `timeout`, `network`, `rate_limited`, atau `server_error`. Error `client_error`, `not_configured`, dan `invalid_response` tidak memicu fallback.

Fallback tetap berada dalam satu invocation parser dan satu claim quota. Tidak ada provider loop, retry berulang, atau claim tambahan untuk fallback. Response fallback melewati parsing dan schema validation yang sama, lalu tetap menghasilkan draft yang harus melalui approval deterministik. Bila primary dan fallback sama-sama gagal, error terakhir dikembalikan sebagai error internal yang tetap dipetakan ke pesan publik generik.

Konfigurasi fallback menggunakan `FALANCE_AI_TEXT_FALLBACK_API_BASE`, `FALANCE_AI_TEXT_FALLBACK_API_KEY`, `FALANCE_AI_TEXT_FALLBACK_MODEL` untuk text, serta prefix `FALANCE_AI_VISION_FALLBACK_*` untuk vision. Variable fallback bersifat server-only dan tidak boleh dikirim ke browser atau Telegram.

## Degraded mode

M11 Slice 4 memetakan error internal menjadi pesan publik Bahasa Indonesia yang aman. Quota exhaustion diberi pesan retry-later dan alternatif command manual sebelum parser dipanggil. `not_configured` memberi petunjuk konfigurasi atau alternatif manual. `rate_limited`, `timeout`, `network`, dan `server_error` memberi pesan bahwa layanan sementara tidak tersedia atau tidak merespons. Bila fallback sudah dicoba, pesan dapat menyatakan bahwa provider cadangan juga tidak tersedia tanpa menyebut host, status code, response body, atau detail credential. `invalid_response` menyatakan hasil tidak dapat divalidasi dan mengarahkan pengguna ke input alternatif.

Degraded mode tidak membeberkan `error.message`, status provider, model, URL, API key, prompt, response, receipt, atau transaction data. Semua error yang tidak dikenal tetap dipetakan ke pesan generik. Manual `/addincome` dan `/addexpense` tetap tersedia sebagai jalur non-AI.

## Urutan pekerjaan M11 berikutnya

M11 berikutnya dapat memfokuskan runbook operasional, provider health review, dan observability aggregate berdasarkan kebutuhan pilot. Multi-provider loop, silent fallback tanpa klasifikasi, retry tanpa budget, dan automatic persistence tidak diperbolehkan.
