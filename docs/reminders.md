# Planning Reminders and Due-Date Notifications

## Status

Planned. Reminder belum diimplementasikan dan belum ada scheduler produksi yang mengirim pesan otomatis.

## Tujuan

Memberi tahu anggota keluarga ketika rencana pendapatan, rencana pengeluaran, atau recurring liability mendekati atau mencapai tanggal occurrence, tanpa mengubah forecast menjadi transaksi aktual secara otomatis.

Reminder adalah notification layer di atas `Financial Plans`. Reminder bukan saldo, bukan transaksi, dan bukan bukti bahwa pembayaran telah terjadi.

## Scope awal

Reminder akan mendukung:

- planned income (`PLAN_INCOME`)
- planned expense (`PLAN_EXPENSE`)
- recurring liability (`RECURRING_LIABILITY`)
- occurrence sekali jalan dan bulanan
- reminder sebelum jatuh tempo, misalnya H-1 atau H-3
- reminder hari-H
- pengiriman melalui Telegram Bot API
- pengaturan reminder per keluarga atau per rencana pada slice lanjutan
- deep link atau callback action untuk membuka rencana yang terkait

Scope awal tidak mencakup:

- auto-posting ke `Transactions`
- menganggap reminder sebagai konfirmasi pembayaran
- pengurangan saldo atau perubahan laporan aktual
- pengiriman ke pengguna yang bukan active member keluarga
- pengiriman langsung dari browser Mini App tanpa scheduler server-side
- reminder tanpa idempotency dan delivery tracking

## Perilaku yang diharapkan

Untuk rencana tanggal 15 dengan recurrence bulanan:

1. Scheduler menemukan occurrence tanggal 15 pada timezone bisnis keluarga.
2. Scheduler membuat reminder H-1 atau hari-H sesuai konfigurasi.
3. Telegram mengirim satu pesan ke penerima yang berwenang.
4. Pengguna dapat membuka detail rencana, menandai bahwa pembayaran sudah dilakukan, atau memilih untuk melewati occurrence.
5. Sistem tidak membuat transaksi aktual kecuali pengguna secara eksplisit memilih `Catat sebagai transaksi` dan menyetujui detailnya.

Jika occurrence tidak dikonfirmasi, scheduler tidak boleh mengirim pesan duplikat tanpa aturan retry yang terdokumentasi. Status reminder harus membedakan `PENDING`, `SENT`, `ACKNOWLEDGED`, `SKIPPED`, `FAILED`, dan `CANCELLED`.

## Waktu dan timezone

- `FALANCE_TIME_ZONE` tetap menjadi default timezone deployment.
- Implementasi lanjutan dapat menambahkan timezone per family jika kebutuhan operasional terbukti.
- Tanggal occurrence dihitung sebagai calendar date, bukan durasi 24 jam dari waktu pembuatan.
- Scheduler harus memakai jendela waktu eksplisit agar satu occurrence tidak terlewat atau dikirim dua kali ketika terjadi cold start.
- Perubahan timezone tidak boleh mengubah histori reminder yang sudah dikirim.

## Arsitektur yang direncanakan

```text
Financial Plans
  -> occurrence resolver
  -> reminder eligibility query
  -> durable reminder claim
  -> Telegram delivery
  -> delivery status / audit metadata
```

Scheduler dapat berupa Vercel Cron atau worker terjadwal lain yang memanggil endpoint server-only. Endpoint harus:

- menggunakan secret scheduler yang terpisah dari Telegram webhook secret
- menolak request tanpa autentikasi scheduler
- membatasi window tanggal yang diproses
- aman dipanggil berulang
- tidak menerima `family_id` dari request sebagai authorization input
- tidak mengembalikan row values atau credential di log

Repository boundary membutuhkan claim atomik atau conditional write untuk mencegah dua scheduler instance mengirim reminder yang sama. Google Sheets read-then-update tidak cukup sebagai jaminan cross-instance uniqueness; implementasi production sebaiknya menggunakan Supabase atomic operation atau storage primitive setara sebelum reminder diaktifkan secara luas.

## Penerima dan privasi

Penerima awal adalah active OWNER, ADMIN, atau MEMBER yang memiliki konfigurasi reminder. Default paling sederhana adalah creator plan, tetapi keputusan final harus mempertimbangkan apakah creator masih aktif dan apakah keluarga menginginkan satu penerima terpusat.

Pesan Telegram tidak boleh menampilkan spreadsheet ID, internal `family_id`, atau Telegram ID. Isi pesan boleh memuat nama/description rencana, nominal, currency, tanggal occurrence, dan status forecast yang aman untuk anggota keluarga yang berwenang.

## Action design

Action yang direncanakan:

- `Lihat rencana`
- `Sudah dibayar`
- `Lewati occurrence`
- `Catat sebagai transaksi`

`Sudah dibayar` tidak boleh langsung membuat transaksi tanpa detail dan konfirmasi yang jelas. `Catat sebagai transaksi` harus memakai `FamilyService.createTransaction`, memvalidasi tanggal aktual, currency, nominal, kategori, dan authorization seperti input transaksi biasa.

Untuk recurring liability, acknowledgement harus terikat pada occurrence tertentu, misalnya `plan_id + occurrence_date`, bukan hanya `plan_id`, supaya acknowledgement bulan September tidak menyelesaikan bulan Oktober.

## Data dan lifecycle yang dibutuhkan

Implementasi production kemungkinan membutuhkan boundary baru seperti `Planning Reminder Deliveries` dengan data minimum:

- opaque `reminder_id`
- `family_id`
- `plan_id`
- `occurrence_date`
- reminder offset, misalnya `D_MINUS_1` atau `DUE_DATE`
- recipient member reference
- scheduled window
- claim lease
- sent/acknowledged timestamps
- delivery status
- retry count dan safe failure code

Setiap family-owned row wajib memiliki `family_id`. Row reminder tidak boleh menyimpan token Bot API, credential, raw provider response, atau isi request yang tidak dibutuhkan.

## Reliability requirements

- idempotent claim sebelum Telegram call
- lease untuk claim yang terhenti
- retry terbatas untuk error transient
- backoff dan dead-letter/failed state setelah batas retry
- delivery status terpisah dari user acknowledgement
- observability berbasis operation label, latency, result, dan safe error code
- replay test untuk scheduler request yang sama
- test timezone, month-end, leap day, missed window, duplicate invocation, dan family isolation
- graceful behavior ketika Telegram API tidak tersedia

## Rollout plan

1. Implementasikan occurrence resolver murni dengan test calendar dan timezone.
2. Tambahkan schema/repository reminder delivery dan atomic claim pada Supabase.
3. Tambahkan scheduler endpoint guarded di Preview.
4. Kirim reminder ke test family dengan feature flag dan recipient terbatas.
5. Ukur duplicate, failed delivery, latency, dan acknowledgement rate.
6. Tambahkan action callback dengan authorization ulang.
7. Validasi backup, replay, recovery, dan rollback sebelum Production.
8. Aktifkan reminder secara bertahap per family.

Reminder tidak boleh diaktifkan pada Production hanya karena endpoint berhasil dideploy. Exit gate harus mencakup delivery idempotency, timezone validation, privacy review, dan operational replay test.
