import express from "express";
import cors from "cors";
import { createServer } from "http";
import fs from "fs";
import { readFile, writeFile, readdir, stat, rename } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { homedir } from "os";
import { COURSES_PATH, COURSE_PROGRESS_PATH } from "./config.js";
import type {
  Course,
  CourseWithVideos,
  FileItem,
  DirectoryScanResult,
} from "./types.js";
import {
  VALID_ICONS,
  HIDDEN_EXTS,
  VIDEO_EXTS,
  MIME_MAP,
  JSON_LIMIT,
  TEXT_FILE_CAP,
  AI_TIMEOUT_MS,
  TUNNEL_WAIT_MS,
  VIDEO_COUNT_TTL,
  VIDEO_COUNT_MAX,
  fileKind,
} from "./constants.js";
import { zenId, zenHeaders, buildChatBody } from "./zen.js";

const app = express();
const httpServer = createServer(app);

const PORT = (() => {
  const n = Number(process.env.PORT);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 6969;
})();

// ─── CORS: intentionally open — LAN devices + Cloudflare tunnel need it ───
app.use(cors());

app.use(express.json({ limit: JSON_LIMIT }));

// ─── Security headers ───
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self';",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  next();
});

// ─── Serve static frontend ───
const publicDir = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "frontend",
  "dist",
);
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      maxAge: "1h",
      setHeaders: (res, p) => {
        if (p.endsWith("/sw.js")) res.setHeader("Cache-Control", "no-cache");
        if (p.endsWith(".webmanifest"))
          res.setHeader("Content-Type", "application/manifest+json");
      },
    }),
  );
}

// ─── Helpers ───

const VALID_ICON_LIST = [...VALID_ICONS];

const getCourses = async (): Promise<Course[]> => {
  try {
    const data = await readFile(COURSES_PATH, "utf-8");
    const courses: Course[] = JSON.parse(data);

    // Migration: add sortOrder if missing
    let migrated = false;
    courses.forEach((c, i) => {
      if (typeof c.sortOrder !== "number") {
        c.sortOrder = i;
        migrated = true;
      }
    });

    if (migrated) {
      await saveCourses(courses).catch(() => {});
    }

    return courses;
  } catch {
    return [];
  }
};

const saveCourses = async (courses: Course[]): Promise<void> => {
  const tmp = COURSES_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(courses, null, 2));
  await rename(tmp, COURSES_PATH);
};

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const HIDDEN_CHECK = (filename: string): boolean =>
  HIDDEN_EXTS.has(path.extname(filename).toLowerCase());

const getFileType = (filename: string) =>
  fileKind(path.extname(filename).toLowerCase());

const scanDirectory = async (
  dirPath: string,
  relativeTo: string,
): Promise<DirectoryScanResult> => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const folders: FileItem[] = [];
  const files: FileItem[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    try {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(relativeTo, fullPath);

      if (entry.isDirectory()) {
        const children = await scanDirectory(fullPath, relativeTo);
        folders.push({
          name: entry.name,
          type: "folder",
          path: relPath,
          children: children.items,
          totalVideos: children.totalVideos,
        });
      } else {
        if (HIDDEN_CHECK(entry.name)) continue;
        const st = await stat(fullPath).catch(() => null);
        if (!st || (!st.isFile() && !st.isSymbolicLink())) continue;
        files.push({
          name: entry.name,
          type: getFileType(entry.name),
          path: relPath,
          size: st.size,
        });
      }
    } catch {
      continue; // one bad entry must not fail the whole course
    }
  }

  folders.sort((a, b) => naturalCompare(a.name, b.name));
  files.sort((a, b) => naturalCompare(a.name, b.name));

  const items = [...folders, ...files];
  const totalVideos =
    files.filter((f) => f.type === "video").length +
    folders.reduce((sum, f) => sum + (f.totalVideos || 0), 0);

  return { items, totalVideos };
};

const countVideoFiles = async (dirPath: string, depth = 0): Promise<number> => {
  if (depth > 32) return 0; // symlink-loop ceiling
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  const subdirs: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    try {
      if (entry.isDirectory()) subdirs.push(path.join(dirPath, entry.name));
      else if (VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) count++;
    } catch {
      continue;
    }
  }
  // Bounded concurrency: 8 dirs at a time (FD ceiling on big courses)
  for (let i = 0; i < subdirs.length; i += 8) {
    const batch = await Promise.all(
      subdirs.slice(i, i + 8).map((d) => countVideoFiles(d, depth + 1)),
    );
    for (const n of batch) count += n;
  }
  return count;
};

// ─── Video count cache (30s TTL, max 200 entries) ───
const videoCountCache = new Map<
  string,
  { count: number; ts: number; updating?: boolean }
>();
const CACHE_TTL = VIDEO_COUNT_TTL;
const CACHE_MAX = VIDEO_COUNT_MAX;

const triggerVideoCountUpdate = async (course: Course) => {
  const dirPath = course.localPath;
  let cached = videoCountCache.get(dirPath);
  if (!cached) {
    cached = { count: course.totalVideos || 0, ts: 0, updating: true };
    if (videoCountCache.size >= CACHE_MAX) {
      const oldest = videoCountCache.keys().next().value;
      if (oldest) videoCountCache.delete(oldest);
    }
    videoCountCache.set(dirPath, cached);
  } else {
    cached.updating = true;
  }

  try {
    const count = await countVideoFiles(dirPath);
    videoCountCache.set(dirPath, { count, ts: Date.now(), updating: false });

    if (course.totalVideos !== count) {
      const allCourses = await getCourses();
      const target = allCourses.find((c) => c.id === course.id);
      if (target && target.totalVideos !== count) {
        target.totalVideos = count;
        await saveCourses(allCourses);
      }
    }
  } catch {
    if (cached) cached.updating = false;
  }
};

const getCachedVideoCount = (course: Course): number => {
  const dirPath = course.localPath;
  const cached = videoCountCache.get(dirPath);

  if (cached) {
    if (Date.now() - cached.ts > CACHE_TTL && !cached.updating) {
      triggerVideoCountUpdate(course).catch(() => {});
    }
    return cached.count;
  }

  triggerVideoCountUpdate(course).catch(() => {});
  return course.totalVideos || 0;
};

const invalidateVideoCount = (dirPath: string) => {
  videoCountCache.delete(dirPath);
};

const getCourseProgressData = async (): Promise<
  Record<string, Record<string, boolean>>
> => {
  try {
    const data = await readFile(COURSE_PROGRESS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
};

const saveCourseProgressData = async (
  data: Record<string, Record<string, boolean>>,
): Promise<void> => {
  const tmp = COURSE_PROGRESS_PATH + ".tmp";
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, COURSE_PROGRESS_PATH);
};

// ─── Cloudflare Tunnel (server-side for web UI control) ───

let tunnelChild: ReturnType<typeof spawn> | null = null;
let tunnelPublicUrl: string | null = null;

const NEST_BIN_DIR = path.join(homedir(), ".nest", "bin");
const CLOUDFLARED_PATH = path.join(NEST_BIN_DIR, "cloudflared");

let cloudflaredBin: string | null | undefined;
function findCloudflared(): string | null {
  if (cloudflaredBin !== undefined) return cloudflaredBin;
  // 1. System PATH (non-blocking: PATH scan instead of execSync)
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    try {
      const cand = path.join(dir, "cloudflared");
      if (cand && fs.existsSync(cand)) {
        cloudflaredBin = cand;
        return cand;
      }
    } catch {
      continue;
    }
  }
  // 2. ~/.nest/bin/cloudflared (CLI installs it on demand)
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    cloudflaredBin = CLOUDFLARED_PATH;
    return CLOUDFLARED_PATH;
  }
  cloudflaredBin = null;
  return null;
}

app.get("/api/tunnel", (_req, res) => {
  res.json({
    active: !!tunnelChild && !!tunnelPublicUrl,
    url: tunnelPublicUrl,
  });
});

app.post("/api/tunnel/start", async (req, res) => {
  if (tunnelChild) {
    return res.json({ success: true, url: tunnelPublicUrl });
  }

  const bin = findCloudflared();
  if (!bin) {
    return res.status(400).json({
      error: `cloudflared not found. Start the Nest CLI once (it auto-installs cloudflared) or run \`cloudflared tunnel --url http://localhost:${PORT}\` manually.`,
    });
  }

  tunnelChild = spawn(bin, ["tunnel", "--url", `http://localhost:${PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let resolved = false;

  const extractUrl = (text: string) => {
    if (resolved) return;
    const match = text.match(/https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      resolved = true;
      tunnelPublicUrl = match[0];
    }
  };

  tunnelChild.stdout?.on("data", (data) => {
    extractUrl(data.toString());
  });

  tunnelChild.stderr?.on("data", (data) => {
    extractUrl(data.toString());
  });

  tunnelChild.on("close", () => {
    tunnelChild = null;
    tunnelPublicUrl = null;
  });

  tunnelChild.on("error", () => {
    tunnelChild = null;
    tunnelPublicUrl = null;
  });

  // Wait for URL (cleanup timers if the client disconnects)
  const tunnelUrl = await new Promise<string | null>((resolve) => {
    if (tunnelPublicUrl) return resolve(tunnelPublicUrl);
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(interval);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), TUNNEL_WAIT_MS);
    const interval = setInterval(() => {
      if (tunnelPublicUrl) finish(tunnelPublicUrl);
    }, 200);
    req.on("close", () => finish(tunnelPublicUrl));
  });

  if (tunnelUrl) {
    res.json({ success: true, url: tunnelUrl });
  } else {
    res.status(500).json({ error: "Tunnel failed to start (timeout)" });
  }
});

app.post("/api/tunnel/stop", (_req, res) => {
  if (tunnelChild) {
    try {
      tunnelChild.kill("SIGTERM");
    } catch {}
    tunnelChild = null;
    tunnelPublicUrl = null;
  }
  res.json({ success: true });
});

// ─── Course Routes (no auth — local only) ───

app.get("/api/courses", async (_req, res) => {
  try {
    const courses = await getCourses();
    courses.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const enriched: CourseWithVideos[] = courses.map((c) => ({
      ...c,
      totalVideos: getCachedVideoCount(c),
    }));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: "Failed to load courses" });
  }
});

app.post("/api/courses", async (req, res) => {
  const { name, localPath, icon, subtitle } = req.body;
  if (!name || !localPath)
    return res.status(400).json({ error: "Name and localPath are required" });

  // Validate icon
  if (icon && !VALID_ICONS.has(icon)) {
    return res
      .status(400)
      .json({ error: `Invalid icon. Valid icons: ${VALID_ICON_LIST.join(", ")}` });
  }

  // Validate subtitle length
  if (subtitle && subtitle.length > 200) {
    return res
      .status(400)
      .json({ error: "Subtitle must be 200 characters or less" });
  }

  const resolved = path.resolve(localPath);
  const s = await stat(resolved).catch(() => null);
  if (!s || !s.isDirectory()) {
    return res
      .status(400)
      .json({ error: "Path does not exist or is not a directory" });
  }

  const courses = await getCourses();
  const course = {
    id: crypto.randomUUID(),
    name,
    subtitle: subtitle || "",
    localPath: resolved,
    icon: icon || "BookOpen",
    createdAt: new Date().toISOString(),
  };
  courses.push(course);
  await saveCourses(courses);
  invalidateVideoCount(resolved);
  res.json({ success: true, course });
});

app.delete("/api/courses/:id", async (req, res) => {
  const courses = await getCourses();
  const target = courses.find((c) => c.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Course not found" });
  invalidateVideoCount(target.localPath);
  await saveCourses(courses.filter((c) => c.id !== req.params.id));
  res.json({ success: true });
});

app.put("/api/courses/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds))
    return res.status(400).json({ error: "orderedIds array required" });

  const courses = await getCourses();
  const validIds = new Set(courses.map((c) => c.id));
  if (
    !orderedIds.every((id) => validIds.has(id)) ||
    orderedIds.length !== courses.length
  ) {
    return res.status(400).json({ error: "Invalid orderedIds" });
  }

  const idToIndex = new Map(orderedIds.map((id, index) => [id, index]));
  courses.forEach((c) => {
    c.sortOrder = idToIndex.get(c.id) ?? 0;
  });

  await saveCourses(courses);
  res.json({ success: true });
});

// ─── Course Progress (local, no auth) ───

app.get("/api/courses/progress", async (_req, res) => {
  const all = await getCourseProgressData();
  const result: Record<string, number> = {};
  for (const [courseId, files] of Object.entries(all)) {
    result[courseId] = Object.keys(files).length;
  }
  res.json(result);
});

app.get("/api/courses/:id/browse", async (req, res) => {
  const courses = await getCourses();
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: "Course not found" });

  try {
    await stat(course.localPath);
  } catch {
    return res
      .status(404)
      .json({ error: "Course directory not found on disk" });
  }

  try {
    const result = await scanDirectory(course.localPath, course.localPath);
    invalidateVideoCount(course.localPath);
    res.json({ ...course, ...result });
  } catch {
    res.status(500).json({ error: "Failed to scan directory" });
  }
});

app.get("/api/courses/:id/file", async (req, res) => {
  try {
    const courses = await getCourses();
    const course = courses.find((c) => c.id === req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "File path required" });

    const resolved = path.resolve(course.localPath, filePath);
    // Canonicalize both paths to prevent symlink escapes
    const courseRoot = await fs.promises.realpath(
      path.resolve(course.localPath),
    );
    let realResolved: string;
    try {
      realResolved = await fs.promises.realpath(resolved);
    } catch {
      // File doesn't exist yet or broken symlink — fall back to resolved path
      // but still validate the resolved path is under courseRoot
      realResolved = resolved;
    }
    if (
      !realResolved.startsWith(courseRoot + path.sep) &&
      realResolved !== courseRoot
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const fileStat = await stat(realResolved).catch(() => null);
    if (!fileStat) return res.status(404).json({ error: "File not found" });

    const ext = path.extname(realResolved).toLowerCase();
    const fileType = getFileType(path.basename(realResolved));

    if (fileStat.isDirectory())
      return res.status(400).json({ error: "Path is a directory" });

    if (fileType === "text" || fileType === "code") {
      if (fileStat.size > TEXT_FILE_CAP)
        return res.status(413).json({ error: "File too large to preview inline" });
      const content = await readFile(realResolved, "utf-8");
      return res.json({
        type: fileType,
        content,
        name: path.basename(realResolved),
      });
    }

    if (fileType === "link") {
      try {
        const content = await readFile(realResolved, "utf-8");
        const urlMatch =
          content.match(/URL=(.+)/i) || content.match(/https?:\/\/[^\s]+/);
        return res.json({
          type: "link",
          url: urlMatch ? urlMatch[1] || urlMatch[0] : content.trim(),
          name: path.basename(realResolved),
        });
      } catch {
        return res.status(500).json({ error: "Failed to read link file" });
      }
    }

    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const safePipe = (stream: fs.ReadStream, response: typeof res) => {
      stream.on("error", () => {
        stream.destroy();
      });
      req.on("close", () => {
        stream.destroy();
      });
      stream.pipe(response);
    };

    if (fileType === "video") {
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0] || "0", 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;
        // Validate and clamp range bounds
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= fileStat.size) end = fileStat.size - 1;
        if (start > end) start = end;
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Content-Type": contentType,
        });
        safePipe(fs.createReadStream(realResolved, { start, end }), res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileStat.size,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });
        safePipe(fs.createReadStream(realResolved), res);
      }
      return;
    }

    res.writeHead(200, {
      "Content-Length": fileStat.size,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    });
    safePipe(fs.createReadStream(realResolved), res);
  } catch {
    res.status(500).json({ error: "Failed to serve file" });
  }
});

app.get("/api/courses/:id/progress", async (_req, res) => {
  const courseId = _req.params.id;
  const all = await getCourseProgressData();
  res.json(all[courseId] || {});
});

app.put("/api/courses/:id/progress", async (req, res) => {
  const courseId = req.params.id;
  const { filePath, watched } = req.body;
  if (!filePath) return res.status(400).json({ error: "filePath required" });
  const all = await getCourseProgressData();
  if (!all[courseId]) all[courseId] = {};
  if (watched) all[courseId][filePath] = true;
  else delete all[courseId][filePath];
  await saveCourseProgressData(all);
  res.json(all[courseId]);
});

// ─── Zen (OpenCode) request shape — mirrors 9router's bundled opencode adapter ───
// Free tier 403s (FreeTierError) unless the request looks like the official
// agentic client: versioned UA, canonical ses_/msg_ IDs, the {bash,glob,grep,
// read} tool quartet, stream:true. Adapted from 9router PR #4132.
// ponytail: muse-spark models prefer /zen/v1/responses (different body/SSE shape);
// staying on chat/completions so the relay parser below keeps working — upgrade
// to a responses-shape translator if muse-spark support is ever needed.
const ZEN_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
const ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";
let autoWinner: string | null = null;
const zenFreeModels = async (signal: AbortSignal): Promise<string[]> => {
  const r = await fetch(ZEN_MODELS_URL, { signal });
  if (!r.ok) return [];
  const d = (await r.json()) as { data?: Array<{ id?: string }> };
  return (d?.data || [])
    .map((m) => m.id || "")
    .filter((id) => id && (id.endsWith("-free") || id === "big-pickle"));
};

// ─── AI Chat Proxy (free models, no API key) ───

app.get("/api/ai/models", async (_req, res) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch("https://opencode.ai/zen/v1/models", {
      signal: ctl.signal,
    });
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
    const data = (await resp.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const models = (data?.data || []).filter(
      (m) => m.id?.endsWith("-free") || m.id === "big-pickle",
    );
    res.json({ data: models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(502).json({ error: "Failed to fetch models", detail: msg.slice(0, 200) });
  } finally {
    clearTimeout(timer);
  }
});

app.post("/api/ai/chat", async (req, res) => {
  const { model, messages, context } = req.body as {
    model?: unknown;
    messages?: unknown;
    context?: unknown;
  };
  if (typeof model !== "string" || !model || !Array.isArray(messages))
    return res.status(400).json({ error: "model and messages required" });
  if (typeof context !== "undefined" && typeof context !== "string")
    return res.status(400).json({ error: "context must be a string" });

  const systemMsg = {
    role: "system" as const,
    content:
      `You are the user's best buddy — the one friend who somehow knows everything and explains it in a way that just clicks. You're built into the Nest learning platform, and your job is to make learning feel like a conversation with a smart friend, not a lecture.

Your AI identity:
- Your model identifier is: ${model === "auto" ? "Nest Auto" : model}
- If a student asks what model you are, what AI you are, or who made you, answer honestly: you are the "${model === "auto" ? "Nest Auto" : model}" language model, served through Nest's AI tutor feature.
- Do not claim to be GPT, Claude, Gemini, or any other named model unless your model ID clearly indicates so.

Identity & Style:
- You are warm, casual, and genuinely enthusiastic — like a close friend who happens to know everything and loves sharing it with you.
- You NEVER assume what the student knows. Start from fundamentals when needed, but skip the ones they've clearly already got.
- You are STRICT about accuracy, even in buddy mode. If something is wrong, you say so directly and kindly, like a friend who won't let you walk around with bad info — never softened into agreement just to be nice.
- When you are unsure, say so honestly rather than guessing — buddies don't bluff.
- You adapt your tone and depth to the student's level and mood — more playful when they're relaxed, more focused when they're cramming.
- Keep the friendliness real, not performative — no forced slang, no overdoing enthusiasm. Talk the way an actually smart, likable friend talks.

Writing Style (Sound Human):
- Never write like a generic AI assistant. Avoid inflated significance ("stands as a testament," "marks a pivotal moment," "plays a crucial role"), promotional language ("vibrant," "rich," "boasts a," "showcases"), and vague hedging ("it could be argued that," "some experts believe").
- Avoid tacking on fake-depth "-ing" phrases at the end of sentences (e.g. "...highlighting its importance," "...reflecting broader trends"). Just state the point and stop.
- Skip filler ("in order to," "due to the fact that," "it is important to note that") — say it plainly.
- Vary sentence length and rhythm. Don't make every sentence the same shape. Short ones land harder when they follow a longer one.
- Have a real reaction sometimes, not just neutral reporting — a friend has opinions and mixed feelings, not just facts.
- Avoid em dash overuse, rule-of-three lists, and generic upbeat closers ("the future looks bright," "exciting times ahead").
- Don't open with "Great question!" or close with "Let me know if you'd like me to expand!" — just answer like a person would.

Teaching Rules:
- Explain concepts step-by-step, building from basics.
- Use analogies and real-world examples to make abstract ideas concrete.
- When explaining processes, relationships, or hierarchies, use Mermaid diagrams (fenced code block with \`\`\`mermaid).
- When explaining formulas or math, use LaTeX notation: inline $...$ or block $$...$$.
- Use code examples when relevant (with proper language-tagged fenced code blocks).
- If the student seems confused, break it down further with simpler language.
- Periodically ask follow-up questions to check understanding.
- Reference the course context provided when it helps clarify concepts.
- If the student's premise is wrong, correct it firmly but kindly — never validate incorrect information.

Formatting:
- Use clear headings (## or ###) to structure longer explanations.
- Use bullet points and numbered lists for steps.
- Bold key terms on first use.
- Keep paragraphs short and readable.` +
      (context
        ? `

Course Context:
The student is currently viewing: ${context}`
        : ""),
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Flushed after the upstream pick so X-Nest-Model can ride along.

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
  // req emits "close" once its body is consumed — abort only if the SSE
  // response itself drops mid-flight (client navigated away / cancelled).
  res.on("close", () => {
    if (!res.writableEnded) ctl.abort();
  });
  try {
    // Auto: winner first, then free models in order; explicit model: one shot.
    const free =
      model === "auto"
        ? await zenFreeModels(ctl.signal).catch((e: unknown) => {
            if (e instanceof Error && e.name === "AbortError") throw e;
            return [] as string[];
          })
        : [];
    const candidates = (model === "auto" ? [autoWinner, ...free] : [model]).filter(
      (m, i, a): m is string => !!m && a.indexOf(m) === i,
    );
    let upstream: Response | null = null;
    let usedModel = model === "auto" ? "" : model;
    let lastErr = "";
    for (const m of candidates.length ? candidates : [model]) {
      try {
        const session = zenId("ses_");
        const chatBody = buildChatBody(m, systemMsg, messages);
        const r = await fetch(ZEN_CHAT_URL, {
          method: "POST",
          headers: zenHeaders(session),
          signal: ctl.signal,
          body: JSON.stringify(chatBody),
        });
        if (r.ok) {
          upstream = r;
          usedModel = m;
          break;
        }
        lastErr = `Upstream error ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`;
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        lastErr =
          e instanceof Error
            ? aborted
              ? "Request timed out, please retry"
              : e.message.slice(0, 300)
            : "Chat failed";
        if (aborted) break;
      }
    }
    if (model === "auto" && usedModel) autoWinner = usedModel;
    if (!upstream) {
      res.write(
        "data: " +
          JSON.stringify({ error: lastErr || "No model responded" }) +
          "\n\n",
      );
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    if (usedModel) res.setHeader("X-Nest-Model", usedModel);
    res.flushHeaders();

    const reader = upstream.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      res.end();
      return;
    }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const raw = decoder.decode(value, { stream: true });
      buffer += raw;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          res.write(line + "\n\n");
        }
      }
    }
    // flush remaining
    if (buffer.trim()) res.write(buffer + "\n\n");
    res.write("data: [DONE]\n\n");
  } catch (err) {
    if (!res.writableEnded) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out, please retry"
            : err.message.slice(0, 300)
          : "Chat failed";
      res.write("data: " + JSON.stringify({ error: msg }) + "\n\n");
      res.write("data: [DONE]\n\n");
    }
  } finally {
    clearTimeout(timer);
  }
  res.end();
});

// ─── Export / Import Settings ───

app.get("/api/settings/export", async (_req, res) => {
  try {
    const courses = await getCourses();
    const progress = await getCourseProgressData();
    const bundle = {
      _nest_backup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      courses,
      progress,
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    res.setHeader("Content-Disposition", `attachment; filename="nest-backup-${timestamp}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(bundle);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: "Export failed: " + msg.slice(0, 200) });
  }
});

app.post("/api/settings/import", async (req, res) => {
  try {
    const bundle = req.body;
    if (!bundle || !bundle._nest_backup) {
      return res.status(400).json({ error: "Invalid backup file. Not a Nest backup." });
    }
    // Validate courses array
    if (!Array.isArray(bundle.courses)) {
      return res.status(400).json({ error: "Invalid backup: courses must be an array." });
    }
    // Validate progress object
    if (typeof bundle.progress !== "object" || Array.isArray(bundle.progress)) {
      return res.status(400).json({ error: "Invalid backup: progress must be an object." });
    }
    const cleanCourses: Course[] = [];
    for (const c of bundle.courses) {
      if (
        !c ||
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        typeof c.localPath !== "string"
      ) {
        return res.status(400).json({ error: "Invalid backup: bad course entry." });
      }
      const st = await stat(path.resolve(c.localPath)).catch(() => null);
      if (!st || !st.isDirectory()) {
        return res
          .status(400)
          .json({ error: `Invalid backup: missing directory for "${c.name}".` });
      }
      cleanCourses.push({
        id: c.id,
        name: c.name.slice(0, 200),
        subtitle: typeof c.subtitle === "string" ? c.subtitle.slice(0, 200) : "",
        localPath: path.resolve(c.localPath),
        icon: typeof c.icon === "string" && VALID_ICONS.has(c.icon) ? c.icon : "BookOpen",
        createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
        sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : cleanCourses.length,
      });
    }
    const cleanProgress: Record<string, Record<string, boolean>> = {};
    for (const [cid, files] of Object.entries(bundle.progress as Record<string, unknown>)) {
      if (!files || typeof files !== "object" || Array.isArray(files)) continue;
      cleanProgress[cid] = {};
      for (const [fp, v] of Object.entries(files as Record<string, unknown>)) {
        if (v === true && typeof fp === "string" && fp.length < 1024)
          cleanProgress[cid][fp] = true;
      }
    }
    await saveCourses(cleanCourses);
    await saveCourseProgressData(cleanProgress);
    videoCountCache.clear();
    res.json({ success: true, coursesImported: cleanCourses.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: "Import failed: " + msg.slice(0, 200) });
  }
});

// ─── API 404 (JSON, not the SPA shell) ───
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Central error handler (JSON envelope, no HTML leaks) ───
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const msg = err instanceof Error ? err.message : "Internal error";
    res.status(500).json({ error: msg.slice(0, 200) });
  },
);

// ─── SPA fallback ───
app.get("*", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend not built. Run: npm run build");
  }
});

// ─── Start ───
httpServer.listen(PORT, "0.0.0.0", () => {});

// ─── Graceful Shutdown ───
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (tunnelChild) {
    try {
      tunnelChild.kill("SIGTERM");
    } catch {}
    tunnelChild = null;
    tunnelPublicUrl = null;
  }
  (httpServer as any).closeAllConnections?.();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
