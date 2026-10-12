# Arknight Card Battle

Game kartu duel bertema **Arknights** (HTML5 + CSS + JavaScript murni, tanpa framework).
Bisa dimainkan **offline vs AI** maupun **online 2 pemain jarak jauh** lewat internet.

## Fitur

- **Vs AI** — mode offline, AI heuristik yang deploy, pakai skill, dan menyerang.
- **Online 2 pemain** — cukup satu server Node kecil; kedua browser menjalankan engine
  yang sama dari seed yang sama (lock-step), server hanya jadi relay pesan.
- **Deck Builder** — deck wajib tepat 20 kartu (maks. 2 kopi per Art).
- **Board 2 baris** — baris depan (semua operator, memblokir) & baris belakang
  (operator ranged: Sniper/Caster/Medic/Supporter, tidak memblokir).
- **Field Arts** — ditempatkan di zona support di bawah tumpukan deck/discard.
- **Codex** — daftar Operator, Arts, Locations, Arenas + penjelasan lengkap tiap efek.

## Menjalankan

Butuh **Node.js >= 18** (untuk mode online). Mode vs AI bisa dibuka langsung tanpa server.

```bash
npm start            # default port 8130
node server.js 3000  # port lain
```

Lalu buka `http://localhost:8130`.

### Online (2 pemain)

1. Jalankan `node server.js` di satu komputer/server.
2. Buka `http://localhost:8130` di dua perangkat.
3. Menu → **Online** → satu pemain **Buat Room** (dapat kode 4 huruf), yang lain **Gabung**.

Detail lengkap (LAN, Render, Railway, Fly.io, VPS) ada di **[HOSTING.md](HOSTING.md)**.

### Hosting gratis di Render

Repo ini sudah menyertakan `package.json`, `Procfile`, dan `render.yaml`.
Push ke GitHub → Render **New → Web Service** → pilih repo → Deploy.
Start command: `node server.js`.

## Struktur

```
index.html        halaman utama (menu + arena + hand)
css/style.css     seluruh tampilan
js/cards.js       database kartu (Operator / Arts / Locations / Arenas)
js/engine.js      aturan permainan + RNG ber-seed
js/ai.js          AI heuristik
js/ui.js          render + interaksi + command layer (Cmd)
js/net.js         klien jaringan (WebSocket)
js/menu.js        menu, deck builder, codex
js/explain.js     modul penjelasan efek kartu
js/tooltip.js     tooltip kartu
js/audio.js       efek suara
server.js         server + relay WebSocket (tanpa dependency)
tools/            skrip bantu (serve.js untuk dev statis, fetch-assets.ps1)
```

## Lisensi / Catatan

Proyek penggemar (fan project). Arknights dan nama/karakter terkait adalah milik
Hypergryph / Studio Montagne. Aset gambar dipakai hanya untuk keperluan non-komersial.
