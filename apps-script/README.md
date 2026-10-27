# Email Pengingat Otomatis RawatRumah

Aplikasi `index.html` hanya berjalan di browser dan menyimpan data di `localStorage`, jadi ia tidak bisa
mengirim email sendiri. Folder ini berisi skrip Google yang mengirim email terjadwal lewat Gmail Anda.
Aplikasi mengirim (sinkron) daftar tugas ke skrip ini setiap ada perubahan, termasuk saat Anda klik **Selesai**.

## Aturan pengingat

| Kondisi | Email |
|---|---|
| Tugas terlampaui 1, 2, atau 3 hari | Setiap hari sekitar jam 08:00, berhenti saat Anda klik **Selesai** |
| Tugas terlampaui lebih dari 3 hari | Tidak ada email lagi (tetap merah di aplikasi) |
| Setiap hari Senin | Daftar tugas yang jatuh tempo 0 sampai 7 hari ke depan |
| Senin + ada yang terlampaui | Digabung dalam satu email |
| Tidak ada yang perlu diingatkan | Tidak ada email |

Jam, hari mingguan, dan batas 3 hari bisa diubah di bagian PENGATURAN pada `Code.gs`.

## Pemasangan (sekitar 10 menit, sekali saja)

1. Buka <https://script.google.com> dengan akun Gmail yang akan menerima email, lalu klik **Proyek baru**.
2. Hapus isi `Code.gs` bawaan, lalu tempel seluruh isi file `apps-script/Code.gs` dari repo ini.
3. Ganti nilai `SECRET` dengan kata sandi acak buatan Anda sendiri (jangan di-commit ke repo).
   Jika penerima bukan akun yang memasang skrip, isi `RECIPIENT`.
4. Opsional tapi disarankan: klik **Pengaturan proyek** (ikon roda gigi), centang
   **Tampilkan file manifes "appsscript.json" di editor**, lalu samakan isinya dengan `apps-script/appsscript.json`
   agar zona waktu `Asia/Jakarta`. Jika tidak, atur zona waktu di Pengaturan proyek.
5. Pilih fungsi `setupTriggers` di editor lalu klik **Jalankan**. Setujui izin yang diminta (kirim email dan
   mengatur trigger). Muncul peringatan "Google belum memverifikasi aplikasi ini" karena skrip buatan Anda
   sendiri: klik **Lanjutan**, lalu **Buka ... (tidak aman)**.
6. Klik **Deploy**, lalu **Deployment baru**, jenis **Aplikasi web**:
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
   Salin **URL aplikasi web** (berakhiran `/exec`).
7. Buka aplikasi RawatRumah, klik tombol email di header, lalu isi:
   - **URL Web App** dengan URL dari langkah 6
   - **Kata Sandi** dengan `SECRET` dari langkah 3
8. Klik **Sinkronkan Sekarang**, lalu **Kirim Email Uji (Nyata)**. Cek inbox (dan folder Spam untuk pertama kali).

Jika Anda mengubah `Code.gs` setelah deploy, buat **Deployment baru** (atau Kelola deployment, lalu Versi baru)
agar perubahan berlaku. URL tidak berubah jika Anda memperbarui deployment yang sama.

## Hal yang perlu diketahui

- **Sinkron hanya terjadi saat ada perubahan di aplikasi**, bukan saat halaman dibuka. Email mengacu pada data
  terakhir yang tersinkron. Jika data di browser berbeda dengan di skrip, klik **Sinkronkan Sekarang**.
- **Satu browser = satu sumber data.** Jika Anda memakai aplikasi di dua perangkat, perubahan terakhir yang
  tersinkron yang menang, dan perangkat baru yang masih berisi tugas contoh bisa menimpa data Anda jika Anda
  menyinkronkannya. Isi URL dan kata sandi hanya di perangkat utama.
- **Keamanan:** URL web app bersifat publik, tetapi setiap permintaan ditolak tanpa `SECRET` yang benar. Penerima email
  tidak bisa diubah dari luar. `SECRET` tersimpan di `localStorage` browser Anda.
- Trigger harian Google dijalankan dalam rentang satu jam dari `SEND_HOUR`, jadi email datang sekitar jam 08:00 sampai 09:00.
- Kuota Gmail akun gratis 100 email per hari, jauh di atas kebutuhan ini (maksimal 1 email per hari).
