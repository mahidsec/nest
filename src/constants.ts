// ─── Shared backend constants (hoisted lookups + limits) ───

export const VALID_ICONS = new Set([
  "Zap", "Music", "Languages", "BookOpen", "DollarSign", "Code",
  "Paintbrush", "Microscope", "BarChart3", "Dumbbell", "Camera",
  "Gamepad2", "Brain", "Scale", "HeartPulse", "Wrench",
  "GraduationCap", "Briefcase",
]);

const VIDEO = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v"]);
const IMAGE = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
const CODE = new Set([
  ".js", ".ts", ".py", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs",
  ".rb", ".php", ".swift", ".kt", ".html", ".css", ".scss", ".json", ".xml",
  ".yaml", ".yml", ".sh", ".bash", ".sql", ".r", ".jsx", ".tsx", ".vue", ".svelte",
]);
const DOC = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt"]);
const TEXT = new Set([".txt", ".md", ".rtf", ".log", ".csv"]);
const LINK = new Set([".url", ".webloc", ".desktop", ".lnk"]);

export type FileKind = "video" | "text" | "code" | "document" | "link" | "image" | "other";

export const fileKind = (ext: string): FileKind => {
  if (VIDEO.has(ext)) return "video";
  if (IMAGE.has(ext)) return "image";
  if (CODE.has(ext)) return "code";
  if (DOC.has(ext)) return "document";
  if (TEXT.has(ext)) return "text";
  if (LINK.has(ext)) return "link";
  return "other";
};

export const VIDEO_EXTS = VIDEO;
export const HIDDEN_EXTS = new Set([".srt", ".sub", ".ass", ".ssa", ".idx", ".vtt"]);

export const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".svg": "image/svg+xml", ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const JSON_LIMIT = "1mb";
export const TEXT_FILE_CAP = 2 * 1024 * 1024;
export const AI_TIMEOUT_MS = 60_000;
export const TUNNEL_WAIT_MS = 15_000;
export const VIDEO_COUNT_TTL = 30_000;
export const VIDEO_COUNT_MAX = 200;
