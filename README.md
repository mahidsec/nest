<p align="center">
  <img src="assets/icon.png" alt="Nest Logo" width="128" />
</p>

<h1 align="center">Nest</h1>

<p align="center">
  A local course viewer with system tray integration, built with Express and React.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/react-19-61dafb" alt="React" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Install

**Option 1 — npx (no install needed):**

```bash
npx @mahidsec/nest
```

**Option 2 — global install:**

```bash
npm install -g @mahidsec/nest
nest
```

**Option 3 — from source:**

```bash
git clone https://github.com/mahidsec/nest.git
cd nest
npm install
cd frontend && npm install && cd ..
npm run build
npm start
```

The server starts at **http://localhost:6969**. Open from any device on your network: **http://\<your-ip\>:6969**.

> On first run, Nest will download [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) automatically if you want to use the tunnel feature.

## Features

- **Course Management** — Import folders, organize by categories, track watch progress
- **File Viewer** — Inline preview for videos, images, PDFs, code, markdown, and CSV
- **Curriculum Sidebar** — Collapsible sections with progress tracking, snake-line tree UI, and expand/collapse all
- **Cloudflare Tunnel** — One-click tunneling from both CLI and web UI (auto-downloads cloudflared)
- **QR Code** — Generated in-browser for easy mobile sharing of tunnel URLs (no external APIs)
- **System Tray** — Runs in the background with a native tray icon (cross-platform)
- **Multiple Themes** — Moonlight, Sakura, Matcha, Starry, Dusk, Aurora (dark/light)
- **Mobile Responsive** — Adaptive layout with touch-friendly navigation, collapsed controls on small screens
- **Natural Sorting** — Intelligent numeric ordering for course sections
- **LAN Access** — Open from any device on your network

## Tech Stack

| Layer    | Technology                                           |
| -------- | ---------------------------------------------------- |
| Backend  | Express, TypeScript                                  |
| Frontend | React 19, Vite, DaisyUI, Tailwind CSS                |
| Icons    | Lucide React                                         |
| QR Code  | `qrcode` (client-side, no external requests)         |
| Build    | Vite, esbuild                                        |
| CLI      | Interactive menu with system tray via `systray2`     |
| Tunnel   | Cloudflare Tunnel via `cloudflared` (auto-installed) |

## CLI Menu

```
═══════════════════════════════════════════
  🪺 Nest (v1.0.0)
  🚀 Server: http://192.168.x.x:6969
  ✅ Status: Running
═══════════════════════════════════════════
  ★  Web UI (Open in Browser)
  ☆  Hide to Tray (Background)
  ☆  Cloudflare Tunnel
  ☆  Exit
═══════════════════════════════════════════
```

- **Web UI** — Opens in browser
- **Hide to Tray** — Runs in background via system tray
- **Cloudflare Tunnel** — Creates a public URL with QR code
- **Exit** — Gracefully shuts down server and frees the port

## Development

```bash
# Run server in dev mode (with hot reload)
npm run dev

# Run frontend dev server separately
npm run dev:frontend
```

## Project Structure

```
nest/
├── assets/            # Static assets (icons)
├── bin/
│   └── nest.js        # CLI entry point with menu and tray
├── dist/              # Compiled backend output
├── frontend/
│   ├── dist/          # Built frontend
│   └── src/
│       ├── App.tsx    # Main application component
│       └── index.css  # DaisyUI + custom themes
├── src/
│   ├── config.ts      # Paths & data directory setup
│   ├── server.ts      # Express API, tunnel, file serving
│   └── types.ts       # TypeScript type definitions
├── esbuild.config.mjs # Backend build config
└── package.json
```

## Data Storage

Course data and progress are stored locally at:

```
~/.nest/data/
├── courses.json           # Course registry
└── course_progress.json   # Per-course progress tracking
```

## License

MIT
