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

## Features

- **Course Management** — Import folders, organize by categories, track progress
- **File Viewer** — Inline preview for videos, images, PDFs, code, and markdown
- **Curriculum Sidebar** — Collapsible sections with progress ring and expand/collapse all
- **System Tray** — Runs in the background with a native tray icon (cross-platform)
- **Multiple Themes** — Moonlight, Sakura, Matcha, Starry, Dusk, Aurora
- **Real-time Sync** — WebSocket-powered progress updates via Socket.IO
- **Mobile Responsive** — Adaptive layout with touch-friendly navigation
- **Natural Sorting** — Intelligent numeric ordering for course sections

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express, Socket.IO, TypeScript |
| Frontend | React 19, Vite, DaisyUI, Tailwind CSS |
| Icons | Lucide React |
| Build | Vite, esbuild |
| CLI | Node.js system tray via `systray2` |

## Quick Start

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Build the frontend
npm run build

# Start the server
npm start
```

The server starts at **http://localhost:6969**.

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
├── bin/               # CLI entry point with system tray
├── dist/              # Compiled backend output
├── frontend/          # React + Vite frontend
│   └── src/
│       ├── App.tsx    # Main application component
│       └── index.css  # DaisyUI + custom themes
├── src/
│   ├── config.ts      # Paths & data directory setup
│   └── server.ts      # Express API + Socket.IO
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
