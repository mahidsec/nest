<p align="center">
  <img src="https://raw.githubusercontent.com/mahidsec/nest/main/assets/icon.png" alt="Nest" width="128" />
</p>

<h1 align="center">Nest</h1>

<p align="center">
  A beautiful local course viewer with system tray, tunneling, and progress tracking.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mahidsec/nest"><img src="https://img.shields.io/npm/v/@mahidsec/nest?label=npm&logo=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
</p>

<p align="center">
  If you find Nest useful, give it a ⭐ on <a href="https://github.com/mahidsec/nest">GitHub</a> — it helps others discover it!
</p>

---

Browse and watch local course materials with beautiful themes, inline file previews, watch progress tracking, and one-click Cloudflare tunneling.

**[Install](#install)** · **[Preview](#preview)** · **[Features](#features)** · **[CLI Menu](#cli-menu)** · **[FAQ](#faq)** · **[Contributing](#contributing)**

## Install

```bash
npm install -g @mahidsec/nest
```

Then just run:

```bash
nest
```

The server starts at **http://localhost:6969**. Open it from any device on your network using your local IP.

> On first run, Nest will automatically download [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) if you choose to start a tunnel.

## Preview

<p align="center">
  <img src="https://raw.githubusercontent.com/mahidsec/nest/main/screenshots/home.png" alt="Home View" width="640" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mahidsec/nest/main/screenshots/course-adding.png" alt="Course Adding" width="640" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mahidsec/nest/main/screenshots/dashboard.png" alt="Nest Dashboard" width="640" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mahidsec/nest/main/screenshots/navigation.png" alt="Navigation" width="640" />
</p>

## Features

- **Course Management** — Import folders, organize by categories, track watch progress
- **File Viewer** — Inline preview for videos, images, PDFs, code, markdown, and CSV
- **Curriculum Sidebar** — Collapsible sections with progress tracking and expand/collapse all
- **Cloudflare Tunnel** — One-click tunneling from both CLI and web UI
- **QR Code** — In-browser QR generation for sharing tunnel URLs (no external APIs)
- **System Tray** — Runs in the background with a native tray icon
- **Multiple Themes** — Moonlight, Sakura, Matcha, Starry, Dusk, Aurora (dark & light)
- **Mobile Responsive** — Adaptive layout with touch-friendly navigation
- **LAN Access** — Open from any device on your network

## CLI Menu

```
  🪺 Nest (v1.0.0)
  🚀 Server: http://192.168.x.x:6969
  ✅ Status: Running

  ★  Web UI (Open in Browser)
  ☆  Hide to Tray (Background)
  ☆  Cloudflare Tunnel
  ☆  Exit
```

| Option                | Description                           |
| --------------------- | ------------------------------------- |
| **Web UI**            | Opens the app in your default browser |
| **Hide to Tray**      | Runs in background via system tray    |
| **Cloudflare Tunnel** | Creates a public URL with QR code     |
| **Exit**              | Gracefully shuts down the server      |

Use ↑/↓ arrow keys to navigate and Enter to select.

## FAQ

**Why is port 6969 used?**

It's the default port. You can override it by setting the `PORT` environment variable: `PORT=3000 nest`.

**Does Nest send any data externally?**

No. All data stays on your machine. The only external connection is when you explicitly start a Cloudflare Tunnel — that connection goes directly to Cloudflare's edge network. No telemetry, no analytics, no phone-home.

**Can I access Nest from my phone/tablet?**

Yes. Open `http://<your-local-ip>:6969` on any device on the same network. For remote access, use the built-in Cloudflare Tunnel feature.

**What file types can Nest preview?**

Videos (mp4, mkv, webm, mov, avi), images (jpg, png, gif, webp), code (js, ts, py, java, c, cpp, go, rs, and 20+ more), text (txt, md, csv, log), PDFs, and link files (.url, .webloc).

**What happens if I exit the CLI?**

The server shuts down gracefully — it closes all connections, stops any active tunnel, and frees the port.

**Does it work on Windows/Linux/macOS?**

Yes. Nest works on all three platforms. The system tray feature requires a desktop environment. On headless servers, the CLI menu still works.

## Data Storage

All data is stored locally:

```
~/.nest/data/
├── courses.json           # Course registry
└── course_progress.json   # Watch progress per course
```

## Contributing

Clone and run locally:

```bash
git clone https://github.com/mahidsec/nest.git
cd nest
npm install
cd frontend && npm install && cd ..
```

**Development:**

```bash
npm run dev            # Server with hot reload
npm run dev:frontend   # Frontend dev server (separate terminal)
```

**Production build:**

```bash
npm run build
npm start
```

**Project structure:**

```
nest/
├── assets/              # Icons and static assets
├── bin/
│   └── nest.js          # CLI entry point
├── frontend/            # React + Vite frontend
│   └── src/
│       ├── App.tsx      # Main application
│       └── index.css    # Themes and styles
├── screenshots/         # UI screenshots
├── src/
│   ├── config.ts        # Paths and data directory setup
│   ├── server.ts        # Express API and tunnel
│   └── types.ts         # TypeScript types
├── esbuild.config.mjs   # Backend build config
└── package.json
```

## Tech Stack

| Layer    | Technology                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | [Express](https://expressjs.com), [TypeScript](https://www.typescriptlang.org)                                                     |
| Frontend | [React 19](https://react.dev), [Vite](https://vitejs.dev), [DaisyUI](https://daisyui.com), [Tailwind CSS](https://tailwindcss.com) |
| Icons    | [Lucide React](https://lucide.dev)                                                                                                 |
| QR Code  | [qrcode](https://www.npmjs.com/package/qrcode) (client-side)                                                                       |
| Tunnel   | [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) via `cloudflared`              |
| Tray     | [systray2](https://www.npmjs.com/package/systray2)                                                                                 |

## License

[MIT](LICENSE)
