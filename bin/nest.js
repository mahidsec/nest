#!/usr/bin/env node
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs";
import { homedir, networkInterfaces, platform, arch } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");
const distServer = join(root, "dist", "server.js");

// Ensure data directory exists
const dataDir = join(homedir(), ".nest", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const coursesPath = join(dataDir, "courses.json");
const progressPath = join(dataDir, "course_progress.json");
if (!existsSync(coursesPath)) writeFileSync(coursesPath, "[]");
if (!existsSync(progressPath)) writeFileSync(progressPath, "{}");

const VERSION = "1.0.0";
const PORT = Number(process.env.PORT) || 6969;

let serverProcess = null;
let tunnelProcess = null;
let tunnelUrl = null;

// ─── Cloudflared auto-install ───
const NEST_BIN_DIR = join(homedir(), ".nest", "bin");
const CLOUDFLARED_PATH = join(NEST_BIN_DIR, "cloudflared");

function getCloudflaredUrl() {
  const p = platform(); // linux, darwin
  const a = arch();     // x64, arm64
  const osMap = { linux: "linux", darwin: "darwin" };
  const archMap = { x64: "amd64", arm64: "arm64" };
  const os = osMap[p] || p;
  const cpu = archMap[a] || a;
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${os}-${cpu}`;
}

function ensureCloudflared() {
  // 1. Check system PATH first
  try {
    const result = execSync("which cloudflared 2>/dev/null || command -v cloudflared 2>/dev/null").toString().trim();
    if (result && existsSync(result)) return result;
  } catch {}

  // 2. Check ~/.nest/bin/cloudflared
  if (existsSync(CLOUDFLARED_PATH)) return CLOUDFLARED_PATH;

  // 3. Download
  console.log("  \x1b[33m↓\x1b[0m Downloading cloudflared...");
  if (!existsSync(NEST_BIN_DIR)) mkdirSync(NEST_BIN_DIR, { recursive: true });

  const url = getCloudflaredUrl();
  try {
    execSync(`curl -fSL -o "${CLOUDFLARED_PATH}" "${url}"`, { stdio: "inherit" });
    chmodSync(CLOUDFLARED_PATH, 0o755);
    console.log("  \x1b[32m✓\x1b[0m cloudflared installed");
    return CLOUDFLARED_PATH;
  } catch {
    console.log("  \x1b[31m✗\x1b[0m Failed to download cloudflared");
    console.log("  \x1b[90mInstall manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/\x1b[0m");
    return null;
  }
}

function stopTunnel() {
  return fetch(`http://localhost:${PORT}/api/tunnel/stop`, { method: "POST" })
    .catch(() => {})
    .then(() => { tunnelUrl = null; });
}

const OPTIONS = [
  { label: "\u2605  Web UI (Open in Browser)", action: "webui" },
  { label: "\u2606  Hide to Tray (Background)", action: "background" },
  { label: "\u2606  Cloudflare Tunnel", action: "tunnel" },
  { label: "\u2606  Exit", action: "exit" },
];

let selected = 0;

function getLocalIP() {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "localhost";
}

function killServer() {
  return new Promise((resolve) => {
    killPort(PORT);
    const pid = serverProcess?.pid;
    if (!pid) { resolve(); return; }
    try { serverProcess.kill('SIGTERM'); } catch {}
    const timer = setTimeout(() => {
      try { process.kill(pid, 'SIGKILL'); } catch {}
      serverProcess = null;
      resolve();
    }, 2000);
    serverProcess.on('close', () => {
      clearTimeout(timer);
      serverProcess = null;
      resolve();
    });
  });
}

function printMenu() {
  const ip = getLocalIP();
  process.stdout.write("\x1B[2J\x1B[0;0H");
  console.log();
  console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
  console.log();
  console.log("  \x1b[1;37m  \uD83E\uDEBA Nest \x1b[90m(v" + VERSION + ")\x1b[0m");
  console.log("  \x1b[32m  \uD83D\uDE80 Server: http://" + ip + ":" + PORT + "\x1b[0m");
  console.log("  \x1b[32m  \u2705 Status: Running" + (tunnelUrl ? " \x1b[36m|\x1b[0m \U0001F517 Tunnel Active" : "") + "\x1b[0m");
  console.log();
  console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
  console.log();

  for (let i = 0; i < OPTIONS.length; i++) {
    const arrow = i === selected ? "  \x1b[1;37m \u27A4 \x1b[0m" : "     ";
    const text = i === selected
      ? "\x1b[1;37m" + OPTIONS[i].label + "\x1b[0m"
      : "\x1b[90m" + OPTIONS[i].label + "\x1b[0m";
    console.log(arrow + text);
  }

  console.log();
  console.log("  \x1b[90m\u2191/\u2193 navigate  \u2022  Enter select  \u2022  q quit\x1b[0m");
  console.log();
}

function killPort(port) {
  const cmds = [
    `lsof -ti:${port} 2>/dev/null`,
    `fuser ${port}/tcp 2>/dev/null | tr -s ' '`,
  ];
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd).toString().trim();
      if (out) {
        for (const pid of out.split(/[\s\n]+/).filter(Boolean)) {
          const n = Number(pid);
          if (n > 0 && n !== process.pid) {
            try { process.kill(n, "SIGKILL"); } catch {}
          }
        }
        return;
      }
    } catch {}
  }
}

function startServer(tunnel = false) {
  killPort(PORT);
  const env = { ...process.env };
  if (tunnel) env.NEST_TUNNEL = "true";
  const cmd = existsSync(distServer)
    ? ["node", distServer]
    : [join(root, "node_modules", ".bin", "tsx"), join(root, "src", "server.ts")];
  serverProcess = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env });
  serverProcess.on("error", () => {});
  serverProcess.on("close", () => { serverProcess = null; });
}

async function openBrowser() {
  try {
    const open = (await import("open")).default;
    await open("http://localhost:" + PORT);
  } catch {
    console.log("  \x1b[90mOpen http://localhost:" + PORT + " in your browser\x1b[0m");
  }
}

// ─── Terminal QR via qrcode package ───
async function printTerminalQR(text) {
  try {
    const QRCode = (await import("qrcode")).default;
    const qr = await QRCode.toString(text, { type: "terminal", small: true });
    console.log(qr);
  } catch {
    // Fallback: just print the URL
    console.log("  \x1b[36m" + text + "\x1b[0m");
  }
}

// ─── Cloudflare Tunnel ───
async function startTunnel() {
  // Ensure server is running
  startServer();
  console.log("  \x1b[33m↻\x1b[0m Starting server...");
  await new Promise((r) => setTimeout(r, 1500));

  console.log("  \x1b[33m⏳\x1b[0m Starting Cloudflare Tunnel...");

  // Use server API — so UI and CLI share the same tunnel
  try {
    const res = await fetch(`http://localhost:${PORT}/api/tunnel/start`, { method: "POST" });
    const data = await res.json();

    if (data.success && data.url) {
      tunnelUrl = data.url;
      process.stdout.write("\x1B[2J\x1B[0;0H");
      console.log();
      console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
      console.log();
      console.log("  \x1b[1;37m  \U0001F310 Cloudflare Tunnel Active\x1b[0m");
      console.log();
      await printTerminalQR(tunnelUrl);
      console.log();
      console.log("  \x1b[1;36m  " + tunnelUrl + "\x1b[0m");
      console.log();
      console.log("  \x1b[90m  Press any key to stop tunnel\x1b[0m");
      console.log();
      console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
      console.log();
    } else {
      console.log("  \x1b[31m✗\x1b[0m " + (data.error || "Tunnel failed to start"));
    }
  } catch (err) {
    console.log("  \x1b[31m✗\x1b[0m Could not reach server at localhost:" + PORT);
  }

  // Wait for any key to stop tunnel
  const waitForKey = () => {
    return new Promise((resolve) => {
      const handler = (key) => {
        process.stdin.removeListener("data", handler);
        resolve();
      };
      process.stdin.on("data", handler);
    });
  };

  await waitForKey();

  // Stop tunnel via server API
  try { await fetch(`http://localhost:${PORT}/api/tunnel/stop`, { method: "POST" }); } catch {}
  tunnelUrl = null;
  await new Promise((r) => setTimeout(r, 500));
  printMenu();
}

// ─── System Tray ───
async function startTray() {
  try {
    const imported = await import("systray2");
    const SysTray = imported.default?.default || imported.default || imported;
    const iconPath = join(root, "assets", "icon.png");

    if (!existsSync(iconPath)) {
      console.log("  \x1b[33m\u26A0\x1b[0m icon.png not found at " + iconPath);
      return;
    }

    const iconData = readFileSync(iconPath).toString("base64");

    const systray = new SysTray({
      menu: {
        icon: iconData,
        title: "Nest Server",
        tooltip: "Nest Server \u2014 http://localhost:" + PORT,
        items: [
          { title: "Open Web UI", tooltip: "Open in browser", checked: false, enabled: true },
          { title: "Exit", tooltip: "Stop server and exit", checked: false, enabled: true },
        ],
      },
      debug: false,
      copyDir: true,
    });

    systray.onClick((action) => {
      if (action.item.title === "Open Web UI") {
        openBrowser();
      } else if (action.item.title === "Exit") {
        (async () => {
          await stopTunnel();
          await killServer();
          systray.kill(false);
          process.exit(0);
        })();
      }
    });

    await systray.ready();
    console.log("  \x1b[32m\u2713\x1b[0m System tray active");
    return systray;
  } catch (err) {
    console.log("  \x1b[33m\u26A0\x1b[0m Tray unavailable (" + (err.message || err) + ")");
    console.log("  \x1b[90mServer running in background. Stop with: kill $(lsof -ti:" + PORT + ")\x1b[0m");
    return null;
  }
}

async function handleSelect() {
  const opt = OPTIONS[selected];

  if (opt.action === "webui") {
    openBrowser();
    printMenu();
  } else if (opt.action === "tunnel") {
    startTunnel();
  } else if (opt.action === "background") {
    process.stdout.write("\x1B[2J\x1B[0;0H");
    console.log();
    console.log("  \x1b[32m\u2713\x1b[0m System tray active in background.");
    console.log("  \x1b[90mServer: http://localhost:" + PORT + "\x1b[0m");
    console.log();

    // Redirect server stdout/stderr so logs don't leak to terminal
    if (serverProcess) {
      serverProcess.stdout?.destroy();
      serverProcess.stderr?.destroy();
      serverProcess.unref();
    }

    spawn("node", [__filename, "--tray"], {
      stdio: "ignore",
      detached: true,
    }).unref();

    process.exit(0);
  } else if (opt.action === "exit") {
    process.stdout.write("\x1B[2J\x1B[0;0H");
    console.log();
    console.log("  \x1b[32m\u2713\x1b[0m Shutting down server...");
    await stopTunnel();
    await killServer();
    console.log("  \x1b[90mBye!\x1b[0m");
    console.log();
    process.exit(0);
  }
}

// ─── If --tray flag, just run tray ───
if (process.argv.includes("--tray")) {
  startTray();
  setInterval(() => {}, 1000 * 60 * 60);
} else {
  // ─── If --auto flag, start silently ───
  if (process.argv.includes("--auto")) {
    startServer();
    if (serverProcess) serverProcess.unref();
    process.exit(0);
  }

  // ─── Start server immediately, then show menu ───
  startServer();
  let cleaning = false;

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    setTimeout(() => { printMenu(); }, 800);

    process.stdin.on("data", (key) => {
      if (key === "\x1B[A") {
        selected = (selected - 1 + OPTIONS.length) % OPTIONS.length;
        printMenu();
      } else if (key === "\x1B[B") {
        selected = (selected + 1) % OPTIONS.length;
        printMenu();
      } else if (key === "\r" || key === "\n") {
        handleSelect();
      } else if (key === "q" || key === "Q") {
        selected = OPTIONS.length - 1;
        handleSelect();
      } else if (key === "\x03") {
        if (!cleaning) {
          cleaning = true;
          (async () => {
            await stopTunnel();
            await killServer();
            console.log("\n  \x1b[90mBye!\x1b[0m\n");
            process.exit(0);
          })();
        }
      }
    });
  } else {
    if (serverProcess) serverProcess.unref();
    process.exit(0);
  }

  // SIGINT handler — in raw mode, the stdin handler above catches Ctrl+C.
  // This is a safety net for edge cases (e.g. SIGINT from another process).
  process.on("SIGINT", async () => {
    if (cleaning) return;
    cleaning = true;
    await stopTunnel();
    await killServer();
    console.log("\n  \x1b[90mBye!\x1b[0m\n");
    process.exit(0);
  });
}
