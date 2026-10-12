# Online 2 Pemain — Cara Menjalankan & Hosting

Game ini **HTML5 + CSS + JS murni**. Sekarang sudah ada mode **Online 2 pemain**
(jarak jauh) yang butuh satu server kecil (`server.js`) karena memakai **WebSocket**.
Mode **vs AI** tetap jalan seperti biasa tanpa server khusus.

Arsitektur singkat:
- `server.js` melayani file game **dan** menjadi relay pesan antar dua browser.
- Kedua pemain menjalankan **engine yang sama** dari **seed yang sama** (lock-step).
  Jadi cukup mengirim "aksi" (deploy / attack / skill / end turn) — hemat bandwidth dan simpel.
- Setiap pemain memakai **deck tersimpannya sendiri** (wajib pas 20 kartu).

---

## A. Main berdua di jaringan yang sama (LAN) — paling cepat

1. Buka terminal di folder game, jalankan:
   ```
   node server.js
   ```
   (default port **8130**; ganti dengan `node server.js 3000` bila perlu)
2. Cari IP komputer ini, mis. `192.168.1.14`.
3. Di HP/laptop teman (harus satu Wi-Fi), buka:
   ```
   http://192.168.1.14:8130
   ```
4. Salah satu klik **Buat Room** → dapat kode 4 huruf. Teman klik **Online → Gabung** dan masukkan kodenya.

> Jika tidak bisa dibuka, izinkan Node melewati Windows Firewall (Private network) untuk port 8130.

---

## B. Hosting ke internet

> Penting: **GitHub Pages / Netlify / Vercel (static) TIDAK cukup** — itu hanya menyajikan
> file statis, tidak bisa menjalankan WebSocket. Kamu butuh host yang menjalankan Node.

Berkas `package.json`, `Procfile`, dan `render.yaml` sudah disiapkan (`npm start` → `node server.js`).
Port diambil otomatis dari environment `$PORT`.

### Render (gratis, paling mudah)
1. Push folder ini ke sebuah repo GitHub (atau upload).
2. Render → **New → Web Service** → pilih repo.
3. Runtime: **Node**. Build Command: **kosong**. Start Command: **`node server.js`**.
4. Deploy. Buka URL `https://namamu.onrender.com` di dua perangkat → **Online**.

### Railway
1. New Project → Deploy from GitHub repo.
2. Railway mendeteksi Node otomatis (`npm start` / `Procfile`).

### Fly.io
```
fly launch        # deteksi Node, set internal port 8130
fly deploy
```

### VPS sendiri (nginx + systemd)
1. `node server.js` (mis. pakai PM2: `pm2 start server.js --name acb`).
2. Nginx reverse proxy **harus** meneruskan upgrade WebSocket:
   ```
   location / {
     proxy_pass http://127.0.0.1:8130;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
     proxy_set_header Host $host;
   }
   ```
3. Tambahkan HTTPS (Let's Encrypt). Klien otomatis memakai `wss://` saat halaman HTTPS.

---

## C. Cara main

1. Menu → **Online**.
2. **Buat Room** → muncul kode (mis. `Q9CK`) + link siap-bagikan:
   ```
   https://situs-anda/?room=Q9CK
   ```
   Kirim kode/link itu ke temanmu.
3. Teman membuka link (kode otomatis terisi) atau mengetik kode → **Gabung**.
4. Pertandingan mulai otomatis; giliran bergantian. Tombol **☰ Menu** di dalam pertandingan
   berisi Resume / Rules / Main Menu.

---

## Catatan

- **Deck**: kedua pemain harus punya deck tepat **20 kartu** (aturan sama seperti vs AI).
  Jika belum pas, tombol Buat/Gabung menolak dengan peringatan.
- **Koneksi putus**: lawan yang keluar akan memunculkan overlay "OPPONENT LEFT".
- **Lock-step & keamanan**: engine berjalan di kedua klien, jadi secara teknis kartu lawan
  ada di memori browser (bisa dilihat lewat DevTools oleh yang paham). Untuk main santai
  bersama teman ini aman; bukan anti-curang untuk turnamen.
- **Berkas terkait**: `server.js` (server + relay), `js/net.js` (klien jaringan),
  `js/ui.js` (command layer `Cmd` + mode online), `js/menu.js` (layar Online),
  `js/engine.js` (RNG ber-seed + deck pemain 2).
- Server dev lama `tools/serve.js` tetap ada untuk uji lokal biasa (tanpa online).
