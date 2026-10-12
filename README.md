# Arknight Card Battle

A browser-based, Arknights-themed trading card game. Play offline against an AI or
online against a friend in real time. Built with plain HTML, CSS, and JavaScript —
no frameworks, no build step.

![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Offline vs AI** — heuristic AI that deploys, uses skills, and attacks.
- **Online 1v1** — lightweight WebSocket relay; both clients run the same
  deterministic engine from a shared seed.
- **Deck Builder** — build a 20-card deck (max. 2 copies per Art).
- **Two-row board** — front row (all operators, blocks) and back row
  (ranged only, does not block).
- **Field Arts** — long-lasting support cards placed in a dedicated support zone.
- **Codex** — browse operators, Arts, locations, and arenas with full effect breakdowns.

## Getting started

Requires Node.js 18+ (only for the online server).

```bash
npm start            # http://localhost:8130
node server.js 3000  # custom port
```

Open `http://localhost:8130` in your browser.

### Online

1. Run `node server.js` on one machine.
2. Open the game on two devices.
3. Menu → **Online** → one player creates a room, the other joins with the 4-letter code.

See [HOSTING.md](HOSTING.md) for LAN and VPS deployment.

### Deploy free

One-click deploy to [Render](https://render.com) (free, no credit card):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/CaptainBim/Arknight-Card-Battle)

Render reads the included `render.yaml` automatically. The free instance sleeps after
15 minutes of inactivity and wakes in about a minute — WebSocket traffic counts as
activity, so it stays awake while a match is in progress.

## Project structure

```
index.html      entry point
css/            styles
js/             game logic (cards, engine, AI, UI, net, menu)
server.js       static server + WebSocket relay
tools/          dev helpers
```

## License

MIT — see [LICENSE](LICENSE).

Fan project. Arknights and all related names and characters are property of
Hypergryph / Studio Montagne. Assets are used for non-commercial purposes only.
