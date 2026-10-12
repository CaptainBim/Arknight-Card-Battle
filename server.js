/* =========================================================================
   Arknight Card Battle — online 2-player server
   ---------------------------------------------------------------------------
   Serves the static game AND relays match messages between two browsers over
   a WebSocket. No dependencies (pure Node http + a tiny RFC6455 implementation)
   so it can be dropped on any Node host (Render / Railway / Fly / VPS).

   Run:   node server.js            (default port 8130)
          PORT=3000 node server.js  (hosts usually set $PORT)
   Play:  open http://localhost:8130 on two devices and use "Online".
   ========================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8130', 10);
const root = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

// ------------------------------------------------------------------ static
function serveStatic(req, res) {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    if (urlPath === '/server.js' || urlPath.startsWith('/node_modules') || urlPath.startsWith('/tools/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
    }
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found: ' + urlPath); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      res.end(data);
    });
  } catch (e) { res.writeHead(500); res.end('Server error'); }
}

const server = http.createServer(serveStatic);

// ------------------------------------------------------------------ rooms
const rooms = new Map();   // code -> { p0, p1 }

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = ''; for (let i = 0; i < 4; i++) code += A[Math.floor(Math.random() * A.length)]; }
  while (rooms.has(code));
  return code;
}

function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  return Buffer.concat([header, payload]);
}
function send(conn, obj) {
  if (!conn || conn.dead) return;
  try { conn.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) { /* ignore */ }
}
function sendControl(conn, opcode, payload) {
  if (!conn || conn.dead) return;
  const p = payload || Buffer.alloc(0);
  const header = Buffer.from([0x80 | opcode, p.length]);
  try { conn.socket.write(Buffer.concat([header, p])); } catch (e) {}
}

// ------------------------------------------------------------------ ws upgrade
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  const conn = { socket, buffer: Buffer.alloc(0), dead: false, room: null, role: null, deck: [], frag: null };
  socket.on('data', (d) => { conn.buffer = Buffer.concat([conn.buffer, d]); processBuffer(conn); });
  socket.on('close', () => onClose(conn));
  socket.on('error', () => onClose(conn));
});

function processBuffer(conn) {
  let buf = conn.buffer;
  for (;;) {
    if (buf.length < 2) break;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    let maskKey = null;
    if (masked) { if (buf.length < off + 4) break; maskKey = buf.slice(off, off + 4); off += 4; }
    if (buf.length < off + len) break;

    let payload = buf.slice(off, off + len);
    if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3]; }
    buf = buf.slice(off + len);

    if (opcode === 0x8) { conn.buffer = buf; onClose(conn); return; }        // close
    if (opcode === 0x9) { sendControl(conn, 0xA, payload); continue; }        // ping -> pong
    if (opcode === 0xA) continue;                                            // pong
    if (opcode === 0x1) conn.frag = payload;                                 // text (start)
    else if (opcode === 0x0) conn.frag = conn.frag ? Buffer.concat([conn.frag, payload]) : payload; // continuation
    else continue;
    if (!fin) continue;
    const text = (conn.frag || Buffer.alloc(0)).toString('utf8');
    conn.frag = null;
    try { handleMessage(conn, JSON.parse(text)); } catch (e) { /* ignore bad frame */ }
  }
  conn.buffer = buf;
}

function handleMessage(conn, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'create') {
    if (conn.room) rooms.delete(conn.room);   // drop any previous, unstarted room
    const code = makeCode();
    conn.room = code; conn.role = 0;
    conn.deck = Array.isArray(m.deck) ? m.deck : [];
    rooms.set(code, { p0: conn, p1: null, deck0: conn.deck, deck1: null });
    send(conn, { t: 'room', code });
  } else if (m.t === 'join') {
    const code = String(m.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(conn, { t: 'error', msg: 'Room not found.' });
    if (room.p1) return send(conn, { t: 'error', msg: 'That room is already full.' });
    conn.room = code; conn.role = 1;
    conn.deck = Array.isArray(m.deck) ? m.deck : [];
    room.p1 = conn; room.deck1 = conn.deck;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const base = { t: 'start', seed, deck0: room.deck0, deck1: room.deck1 };
    send(room.p0, Object.assign({ you: 0 }, base));
    send(room.p1, Object.assign({ you: 1 }, base));
  } else if (m.t === 'act') {
    const room = rooms.get(conn.room);
    if (!room) return;
    const peer = conn.role === 0 ? room.p1 : room.p0;
    send(peer, { t: 'act', msg: m.msg });
  } else if (m.t === 'ping') {
    send(conn, { t: 'pong' });
  } else if (m.t === 'bye') {
    onClose(conn);
  }
}

function onClose(conn) {
  if (conn.dead) return;
  conn.dead = true;
  try { conn.socket.destroy(); } catch (e) {}
  const room = rooms.get(conn.room);
  if (room) {
    const peer = conn.role === 0 ? room.p1 : room.p0;
    if (peer) send(peer, { t: 'peer-left' });
    rooms.delete(conn.room);
  }
}

// periodic keep-alive ping so dead sockets get cleaned up
setInterval(() => { rooms.forEach(r => { sendControl(r.p0, 0x9, Buffer.alloc(0)); if (r.p1) sendControl(r.p1, 0x9, Buffer.alloc(0)); }); }, 25000);

server.listen(PORT, () => {
  console.log('Arknight Card Battle server running');
  console.log('  local:  http://localhost:' + PORT);
  console.log('  online: share this URL; players open Online -> Create / Join a room');
});
