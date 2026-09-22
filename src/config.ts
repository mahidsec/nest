import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

const DATA_DIR = join(homedir(), '.nest', 'data');
const COURSES_PATH = join(DATA_DIR, 'courses.json');
const COURSE_PROGRESS_PATH = join(DATA_DIR, 'course_progress.json');

// Ensure data directory exists (best-effort: routes fall back to empty state)
try {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(COURSES_PATH)) writeFileSync(COURSES_PATH, '[]');
  if (!existsSync(COURSE_PROGRESS_PATH)) writeFileSync(COURSE_PROGRESS_PATH, '{}');
} catch { /* read-only home: server still boots, writes fail per-request */ }

export { DATA_DIR, COURSES_PATH, COURSE_PROGRESS_PATH };
