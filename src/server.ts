import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { COURSES_PATH, COURSE_PROGRESS_PATH, DATA_DIR } from './config.js';
import type { Course, CourseWithVideos, FileItem, DirectoryScanResult } from './types.js';

const app = express();
const httpServer = createServer(app);

const PORT = Number(process.env.PORT) || 6969;

app.use(cors());
app.use(express.json());

// ─── Serve static frontend ───
const publicDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'frontend', 'dist');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ─── Helpers ───

const getCourses = (): Course[] => {
  if (!fs.existsSync(COURSES_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(COURSES_PATH, 'utf-8')); } catch { return []; }
};

const saveCourses = (courses: Course[]) => {
  fs.writeFileSync(COURSES_PATH, JSON.stringify(courses, null, 2));
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

const getFileType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const hiddenExts = ['.srt', '.sub', '.ass', '.ssa', '.idx', '.vtt'];
  if (hiddenExts.includes(ext)) return 'hidden';
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

const scanDirectory = (dirPath: string, relativeTo: string): DirectoryScanResult => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const folders: FileItem[] = [];
  const files: FileItem[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      const children = scanDirectory(fullPath, relativeTo);
      folders.push({
        name: entry.name,
        type: 'folder',
        path: relPath,
        children: children.items,
        totalVideos: children.totalVideos,
      });
    } else {
      const fileType = getFileType(entry.name);
      if (fileType === 'hidden') continue;
      const stat = fs.statSync(fullPath);
      files.push({
        name: entry.name,
        type: fileType,
        path: relPath,
        size: stat.size,
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

const countVideoFiles = (dirPath: string): number => {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) count += countVideoFiles(path.join(dirPath, entry.name));
      else if (videoExts.includes(path.extname(entry.name).toLowerCase())) count++;
    }
  } catch {}
  return count;
};

const getCourseProgressData = (): Record<string, Record<string, boolean>> => {
  if (!fs.existsSync(COURSE_PROGRESS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(COURSE_PROGRESS_PATH, 'utf-8')); } catch { return {}; }
};

const saveCourseProgressData = (data: Record<string, Record<string, boolean>>) => {
  fs.writeFileSync(COURSE_PROGRESS_PATH, JSON.stringify(data));
};

// ─── Course Routes (no auth — local only) ───

app.get('/api/courses', (_req, res) => {
  const courses = getCourses();
  const enriched: CourseWithVideos[] = courses.map((c) => ({
    ...c,
    totalVideos: countVideoFiles(c.localPath),
  }));
  res.json(enriched);
});

app.post('/api/courses', (req, res) => {
  const { name, localPath, icon, subtitle } = req.body;
  if (!name || !localPath) return res.status(400).json({ error: 'Name and localPath are required' });

  const resolved = path.resolve(localPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ error: 'Path does not exist or is not a directory' });
  }

  const courses = getCourses();
  const course = {
    id: crypto.randomUUID(),
    name,
    subtitle: subtitle || '',
    localPath: resolved,
    icon: icon || 'BookOpen',
    createdAt: new Date().toISOString(),
  };
  courses.push(course);
  saveCourses(courses);
  console.log(`[Courses] Added "${name}" → ${resolved}`);
  res.json({ success: true, course });
});

app.delete('/api/courses/:id', (req, res) => {
  const courses = getCourses();
  const filtered = courses.filter((c) => c.id !== req.params.id);
  if (filtered.length === courses.length) return res.status(404).json({ error: 'Course not found' });
  saveCourses(filtered);
  console.log(`[Courses] Removed course ${req.params.id}`);
  res.json({ success: true });
});

app.get('/api/courses/:id/browse', (req, res) => {
  const courses = getCourses();
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  if (!fs.existsSync(course.localPath)) {
    return res.status(404).json({ error: 'Course directory not found on disk' });
  }

  try {
    const result = scanDirectory(course.localPath, course.localPath);
    res.json({ ...course, ...result });
  } catch (err: unknown) {
    console.error('[Courses] Browse error:', err);
    res.status(500).json({ error: 'Failed to scan directory' });
  }
});

app.get('/api/courses/:id/file', (req, res) => {
  const courses = getCourses();
  const course = courses.find((c) => c.id === req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'File path required' });

  const resolved = path.resolve(course.localPath, filePath);
  if (!resolved.startsWith(path.resolve(course.localPath))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const fileType = getFileType(path.basename(resolved));

  if (fileType === 'text' || fileType === 'code') {
    const content = fs.readFileSync(resolved, 'utf-8');
    return res.json({ type: fileType, content, name: path.basename(resolved) });
  }

  if (fileType === 'link') {
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
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
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': contentType,
      });
      safePipe(fs.createReadStream(resolved, { start, end }), res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      safePipe(fs.createReadStream(resolved), res);
    }
    return;
  }

  res.writeHead(200, {
    'Content-Length': stat.size,
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600',
  });
  safePipe(fs.createReadStream(resolved), res);
});

// ─── Course Progress (local, no auth) ───

app.get('/api/courses/:id/progress', (_req, res) => {
  const courseId = _req.params.id;
  const all = getCourseProgressData();
  res.json(all[courseId] || {});
});

app.put('/api/courses/:id/progress', (req, res) => {
  const courseId = req.params.id;
  const { filePath, watched } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  const all = getCourseProgressData();
  if (!all[courseId]) all[courseId] = {};
  if (watched) all[courseId][filePath] = true;
  else delete all[courseId][filePath];
  saveCourseProgressData(all);
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
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[Nest] Server running on http://localhost:${PORT}`);
  console.log(`[Nest] Data dir: ${DATA_DIR}`);
});

// ─── Graceful Shutdown ───
const shutdown = (signal: string) => {
  console.log(`\n[Nest] ${signal} received — shutting down...`);
  httpServer.close(() => process.exit(0));
  // Force exit after 5s if connections don't drain
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
