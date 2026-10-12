/* =========================================================================
   Arknight Card Battle — online networking (client side)
   ---------------------------------------------------------------------------
   Talks to server.js. Host creates a room, the other player joins with the
   code, then the two browsers exchange "action" messages and keep their game
   engines in lock-step so both see the same match.
   ========================================================================= */
(function (global) {
  'use strict';

  const Net = {
    ws: null,
    connected: false,
    role: -1,            // 0 = host, 1 = guest (set when the match starts)
    room: null,
    leaving: false,
    handlers: {},        // room / start / action / error / peerLeft

    url() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      return proto + '://' + location.host;
    },

    _open(onOpen, onFail) {
      if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) { onOpen && onOpen(); return; }
      let ws;
      try { ws = new WebSocket(this.url()); }
      catch (e) { onFail && onFail(e); return; }
      this.ws = ws;
      this.leaving = false;
      ws.onopen = () => { this.connected = true; onOpen && onOpen(); };
      ws.onerror = () => { this.connected = false; onFail && onFail(); };
      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        if (this.leaving) return;
        if (this.role >= 0) { this.handlers.peerLeft && this.handlers.peerLeft(); }
        else { this.handlers.error && this.handlers.error('Cannot reach the game server.'); }
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        this._msg(m);
      };
    },

    _send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },

    _msg(m) {
      if (!m) return;
      if (m.t === 'room') { this.room = m.code; this.handlers.room && this.handlers.room(m.code); }
      else if (m.t === 'start') { this.role = m.you; this.handlers.start && this.handlers.start(m); }
      else if (m.t === 'act') { this.handlers.action && this.handlers.action(m.msg); }
      else if (m.t === 'error') { this.handlers.error && this.handlers.error(m.msg); }
      else if (m.t === 'peer-left') { this.handlers.peerLeft && this.handlers.peerLeft(); }
    },

    create(deck) { this._open(() => this._send({ t: 'create', deck })); },
    join(code, deck) { this._open(() => this._send({ t: 'join', code: String(code || '').trim().toUpperCase(), deck })); },
    action(msg) { this._send({ t: 'act', msg }); },
    leave() {
      this.leaving = true;
      this._send({ t: 'bye' });
      try { if (this.ws) this.ws.close(); } catch (e) {}
      this.ws = null; this.connected = false; this.role = -1; this.room = null;
    }
  };

  global.Net = Net;
})(window);
