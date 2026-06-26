#!/usr/bin/env node
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { homedir, networkInterfaces } from "os";

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

const OPTIONS = [
  { label: "\u2605  Web UI (Open in Browser)", action: "webui" },
  { label: "\u2606  Hide to Tray (Background)", action: "background" },
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
  // Always kill by port (handles --tray mode where serverProcess is null)
  killPort(PORT);
  if (serverProcess && serverProcess.pid) {
    try { process.kill(-serverProcess.pid, "SIGTERM"); } catch {}
    try { serverProcess.kill("SIGTERM"); } catch {}
    serverProcess = null;
  }
}

function printMenu() {
  const ip = getLocalIP();
  process.stdout.write("\x1B[2J\x1B[0;0H");
  console.log();
  console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
  console.log();
  console.log("  \x1b[1;37m  \uD83E\uDEBA Nest \x1b[90m(v" + VERSION + ")\x1b[0m");
  console.log("  \x1b[32m  \uD83D\uDE80 Server: http://" + ip + ":" + PORT + "\x1b[0m");
  console.log("  \x1b[32m  \u2705 Status: Running\x1b[0m");
  console.log();
  console.log("  \x1b[35m\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\x1b[0m");
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
  // Try lsof first (macOS), then fuser (Linux), then ss fallback
  const cmds = [
    `lsof -ti:${port} 2>/dev/null`,
    `fuser ${port}/tcp 2>/dev/null | tr -s ' '`,
  ];
  for (const cmd of cmds) {
    try {
      const out = execSync(cmd).toString().trim();
      if (out) {
        const pids = out.split(/[\s\n]+/).filter(Boolean);
        for (const pid of pids) {
          const n = Number(pid);
          if (n > 0 && n !== process.pid) try { process.kill(n, "SIGTERM"); } catch {}
        }
        return; // killed successfully
      }
    } catch {}
  }
}

function startServer() {
  killPort(PORT);
  if (existsSync(distServer)) {
    serverProcess = spawn("node", [distServer], { stdio: "inherit", detached: true });
  } else {
    const tsxBin = join(root, "node_modules", ".bin", "tsx");
    serverProcess = spawn(tsxBin, [join(root, "src", "server.ts")], { stdio: "inherit", detached: true });
  }
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
        killServer();
        systray.kill(false);
        process.exit(0);
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

function handleSelect() {
  const opt = OPTIONS[selected];

  if (opt.action === "webui") {
    openBrowser();
    printMenu();
  } else if (opt.action === "background") {
    process.stdout.write("\x1B[2J\x1B[0;0H");
    console.log();
    console.log("  \x1b[32m\u2713\x1b[0m System tray active in background.");
    console.log("  \x1b[90mServer: http://localhost:" + PORT + "\x1b[0m");
    console.log();

    if (serverProcess) serverProcess.unref();

    // Spawn tray in detached background process
    spawn("node", [__filename, "--tray"], {
      stdio: "ignore",
      detached: true,
    }).unref();

    process.exit(0);
  } else if (opt.action === "exit") {
    process.stdout.write("\x1B[2J\x1B[0;0H");
    console.log();
    console.log("  \x1b[32m\u2713\x1b[0m Shutting down server...");
    killServer();
    console.log("  \x1b[90mBye!\x1b[0m");
    console.log();
    process.exit(0);
  }
}

// ─── If --tray flag, just run tray ───
if (process.argv.includes("--tray")) {
  startTray();
  // Keep alive
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
        killServer();
        console.log("\n  \x1b[90mBye!\x1b[0m\n");
        process.exit(0);
      }
    });
  } else {
    if (serverProcess) serverProcess.unref();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    killServer();
    console.log("\n  \x1b[90mBye!\x1b[0m\n");
    process.exit(0);
  });
}
