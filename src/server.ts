import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import fs from 'fs';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { homedir, platform, arch } from 'os';
import { COURSES_PATH, COURSE_PROGRESS_PATH, DATA_DIR } from './config.js';
import type { Course, CourseWithVideos, FileType, FileItem, DirectoryScanResult } from './types.js';

const app = express();
const httpServer = createServer(app);

const PORT = Number(process.env.PORT) || 6969;
const IS_TUNNEL = process.env.NEST_TUNNEL === 'true';

// ─── CORS: localhost only + tunnel support ───
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (IS_TUNNEL && /^https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json());

// ─── Security headers ───
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' blob: data:; media-src 'self' blob:;");
  next();
});

// ─── Serve static frontend ───
const publicDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'frontend', 'dist');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ─── Helpers ───

const VALID_ICONS = [
  'Zap', 'Music', 'Languages', 'BookOpen', 'DollarSign', 'Code', 'Paintbrush', 'Microscope',
  'BarChart3', 'Dumbbell', 'Camera', 'Gamepad2', 'Brain', 'Scale', 'HeartPulse', 'Wrench',
  'GraduationCap', 'Briefcase',
];

const getCourses = async (): Promise<Course[]> => {
  try {
    const data = await readFile(COURSES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch { return []; }
};

const saveCourses = async (courses: Course[]): Promise<void> => {
  await writeFile(COURSES_PATH, JSON.stringify(courses, null, 2));
};

const naturalCompare = (a: string, b: string): number => {
  const ax: (string | number)[] = [];
  const bx: (string | number)[] = [];
  a.replace(/(\d+)|(\D+)/g, (_: string, n: string, s: string) => { ax.push(n ? parseInt(n, 10) : s); return ''; });
  b.replace(/(\d+)|(\D+)/g, (_: string, n: string, s: string) => { bx.push(n ? parseInt(n, 10) : s); return ''; });
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const ai = ax[i] ?? ''; const bi = bx[i] ?? '';
    if (typeof ai === 'number' && typeof bi === 'number') { if (ai !== bi) return ai - bi; }
    else { const cmp = String(ai).localeCompare(String(bi)); if (cmp !== 0) return cmp; }
  }
  return 0;
};

const HIDDEN_EXTS = ['.srt', '.sub', '.ass', '.ssa', '.idx', '.vtt'];

const isHiddenMediaSub = (filename: string): boolean =>
  HIDDEN_EXTS.includes(path.extname(filename).toLowerCase());

const getFileType = (filename: string): FileType => {
  const ext = path.extname(filename).toLowerCase();
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const codeExts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.sh', '.bash', '.sql', '.r', '.jsx', '.tsx', '.vue', '.svelte'];
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt'];
  const textExts = ['.txt', '.md', '.rtf', '.log', '.csv'];
  const linkExts = ['.url', '.webloc', '.desktop', '.lnk'];
  if (videoExts.includes(ext)) return 'video';
  if (imageExts.includes(ext)) return 'image';
  if (codeExts.includes(ext)) return 'code';
  if (docExts.includes(ext)) return 'document';
  if (textExts.includes(ext)) return 'text';
  if (linkExts.includes(ext)) return 'link';
  return 'other';
};

const scanDirectory = async (dirPath: string, relativeTo: string): Promise<DirectoryScanResult> => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const folders: FileItem[] = [];
  const files: FileItem[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      const children = await scanDirectory(fullPath, relativeTo);
      folders.push({
        name: entry.name,
        type: 'folder',
        path: relPath,
        children: children.items,
        totalVideos: children.totalVideos,
      });
    } else {
      if (isHiddenMediaSub(entry.name)) continue;
      const fileType = getFileType(entry.name);
      const s = await stat(fullPath);
      files.push({
        name: entry.name,
        type: fileType,
        path: relPath,
        size: s.size,
      });
    }
  }

  folders.sort((a, b) => naturalCompare(a.name, b.name));
  files.sort((a, b) => naturalCompare(a.name, b.name));

  const items = [...folders, ...files];
  const totalVideos = files.filter(f => f.type === 'video').length
    + folders.reduce((sum, f) => sum + (f.totalVideos || 0), 0);

  return { items, totalVideos };
};

const countVideoFiles = async (dirPath: string): Promise<number> => {
  try { await stat(dirPath); } catch { return 0; }
  let count = 0;
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) count += await countVideoFiles(path.join(dirPath, entry.name));
      else if (videoExts.includes(path.extname(entry.name).toLowerCase())) count++;
    }
  } catch {}
  return count;
};

// ─── Video count cache (30s TTL) ───
const videoCountCache = new Map<string, { count: number; ts: number }>();
const CACHE_TTL = 30_000;

const getCachedVideoCount = async (dirPath: string): Promise<number> => {
  const cached = videoCountCache.get(dirPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.count;
  const count = await countVideoFiles(dirPath);
  videoCountCache.set(dirPath, { count, ts: Date.now() });
  return count;
};

const invalidateVideoCount = (dirPath: string) => {
  videoCountCache.delete(dirPath);
};

const getCourseProgressData = async (): Promise<Record<string, Record<string, boolean>>> => {
  try {
    const data = await readFile(COURSE_PROGRESS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch { return {}; }
};

const saveCourseProgressData = async (data: Record<string, Record<string, boolean>>): Promise<void> => {
  await writeFile(COURSE_PROGRESS_PATH, JSON.stringify(data));
};

// ─── Cloudflare Tunnel (server-side for web UI control) ───

let tunnelChild: ReturnType<typeof spawn> | null = null;
let tunnelPublicUrl: string | null = null;

function findCloudflared(): string | null {
  // 1. Check system PATH
  try {
    const result = execSync('which cloudflared 2>/dev/null || command -v cloudflared 2>/dev/null').toString().trim();
    if (result && fs.existsSync(result)) return result;
  } catch {}
  // 2. Check ~/.nest/bin/cloudflared
  const localPath = path.join(homedir(), '.nest', 'bin', 'cloudflared');
  if (fs.existsSync(localPath)) return localPath;
  return null;
}

app.get('/api/tunnel', (_req, res) => {
  res.json({ active: !!tunnelChild && !!tunnelPublicUrl, url: tunnelPublicUrl });
});

app.post('/api/tunnel/start', async (_req, res) => {
  if (tunnelChild) {
    return res.json({ success: true, url: tunnelPublicUrl });
  }

  const bin = findCloudflared();
  if (!bin) {
    return res.status(400).json({ error: 'cloudflared not found. Run `cloudflared tunnel --url http://localhost:${PORT}` manually or install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-local-tunnel/' });
  }

  tunnelChild = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resolved = false;

  tunnelChild.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const match = line.match(/https?:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        tunnelPublicUrl = match[0];
        console.log(`[Tunnel] URL: ${tunnelPublicUrl}`);
      }
    }
  });

  tunnelChild.on('close', () => {
    tunnelChild = null;
    tunnelPublicUrl = null;
  });

  tunnelChild.on('error', (err) => {
    console.error('[Tunnel] Error:', err);
    tunnelChild = null;
    tunnelPublicUrl = null;
  });

  // Wait up to 15s for URL
  const start = Date.now();
  while (!tunnelPublicUrl && Date.now() - start < 15000) {
    await new Promise(r => setTimeout(r, 200));
  }

  if (tunnelPublicUrl) {
    res.json({ success: true, url: tunnelPublicUrl });
  } else {
    res.status(500).json({ error: 'Tunnel failed to start (timeout)' });
  }
});

app.post('/api/tunnel/stop', (_req, res) => {
  if (tunnelChild) {
    try { tunnelChild.kill('SIGTERM'); } catch {}
    tunnelChild = null;
    tunnelPublicUrl = null;
  }
  res.json({ success: true });
});

// ─── Course Routes (no auth — local only) ───

app.get('/api/courses', async (_req, res) => {
  const courses = await getCourses();
  const enriched: CourseWithVideos[] = await Promise.all(courses.map(async (c) => ({
    ...c,
    totalVideos: await getCachedVideoCount(c.localPath),
  })));
  res.json(enriched);
});

app.post('/api/courses', async (req, res) => {
  const { name, localPath, icon, subtitle } = req.body;
  if (!name || !localPath) return res.status(400).json({ error: 'Name and localPath are required' });

  // Validate icon
  if (icon && !VALID_ICONS.includes(icon)) {
    return res.status(400).json({ error: `Invalid icon. Valid icons: ${VALID_ICONS.join(', ')}` });
  }

  // Validate subtitle length
  if (subtitle && subtitle.length > 200) {
    return res.status(400).json({ error: 'Subtitle must be 200 characters or less' });
  }

  const resolved = path.resolve(localPath);
  const s = await stat(resolved).catch(() => null);
  if (!s || !s.isDirectory()) {
    return res.status(400).json({ error: 'Path does not exist or is not a directory' });
  }

  const courses = await getCourses();
  const course = {
    id: crypto.randomUUID(),
    name,
    subtitle: subtitle || '',
    localPath: resolved,
    icon: icon || 'BookOpen',
    createdAt: new Date().toISOString(),
  };
  courses.push(course);
  await saveCourses(courses);
  invalidateVideoCount(resolved);
  console.log(`[Courses] Added "${name}" → ${resolved}`);
  res.json({ success: true, course });
});

app.delete('/api/courses/:id', async (req, res) => {
  const courses = await getCourses();
  const target = courses.find((c) => c.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Course not found' });
  invalidateVideoCount(target.localPath);
  await saveCourses(courses.filter((c) => c.id !== req.params.id));
  console.log(`[Courses] Removed course ${req.params.id}`);
  res.json({ success: true });
});

app.get('/api/courses/:id/browse', async (req, res) => {
  const courses = await getCourses();
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  try {
    await stat(course.localPath);
  } catch {
    return res.status(404).json({ error: 'Course directory not found on disk' });
  }

  try {
    const result = await scanDirectory(course.localPath, course.localPath);
    invalidateVideoCount(course.localPath);
    res.json({ ...course, ...result });
  } catch (err: unknown) {
    console.error('[Courses] Browse error:', err);
    res.status(500).json({ error: 'Failed to scan directory' });
  }
});

app.get('/api/courses/:id/file', async (req, res) => {
  const courses = await getCourses();
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'File path required' });

  const resolved = path.resolve(course.localPath, filePath);
  if (!resolved.startsWith(path.resolve(course.localPath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const fileStat = await stat(resolved).catch(() => null);
  if (!fileStat) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(resolved).toLowerCase();
  const fileType = getFileType(path.basename(resolved));

  if (fileType === 'text' || fileType === 'code') {
    const content = await readFile(resolved, 'utf-8');
    return res.json({ type: fileType, content, name: path.basename(resolved) });
  }

  if (fileType === 'link') {
    try {
      const content = await readFile(resolved, 'utf-8');
      const urlMatch = content.match(/URL=(.+)/i) || content.match(/https?:\/\/[^\s]+/);
      return res.json({ type: 'link', url: urlMatch ? urlMatch[1] || urlMatch[0] : content.trim(), name: path.basename(resolved) });
    } catch {
      return res.status(500).json({ error: 'Failed to read link file' });
    }
  }

  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/mp4',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';

  const safePipe = (stream: fs.ReadStream, response: typeof res) => {
    stream.on('error', () => { stream.destroy(); });
    req.on('close', () => { stream.destroy(); });
    stream.pipe(response);
  };

  if (fileType === 'video') {
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0] || '0', 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      safePipe(fs.createReadStream(resolved, { start, end }), res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileStat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      safePipe(fs.createReadStream(resolved), res);
    }
    return;
  }

  res.writeHead(200, {
    'Content-Length': fileStat.size,
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600',
  });
  safePipe(fs.createReadStream(resolved), res);
});

// ─── Course Progress (local, no auth) ───

app.get('/api/courses/:id/progress', async (_req, res) => {
  const courseId = _req.params.id;
  const all = await getCourseProgressData();
  res.json(all[courseId] || {});
});

app.put('/api/courses/:id/progress', async (req, res) => {
  const courseId = req.params.id;
  const { filePath, watched } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  const all = await getCourseProgressData();
  if (!all[courseId]) all[courseId] = {};
  if (watched) all[courseId][filePath] = true;
  else delete all[courseId][filePath];
  await saveCourseProgressData(all);
  res.json(all[courseId]);
});

// ─── SPA fallback ───
app.get('*', (_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Run: npm run build');
  }
});

// ─── Start ───
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nest] Server running on http://localhost:${PORT}`);
  console.log(`[Nest] Data dir: ${DATA_DIR}`);
  if (IS_TUNNEL) console.log(`[Nest] Tunnel mode: enabled`);
});

// ─── Graceful Shutdown ───
const shutdown = (signal: string) => {
  console.log(`\n[Nest] ${signal} received — shutting down...`);
  // Stop tunnel on shutdown
  if (tunnelChild) {
    try { tunnelChild.kill('SIGTERM'); } catch {}
    tunnelChild = null;
    tunnelPublicUrl = null;
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
