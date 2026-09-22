// ─── File-tree helpers (single source; used by App) ───
import type { FileItem } from "../types";

export function countVideos(items: FileItem[]): number {
  return items.reduce(
    (n, i) => n + (i.type === "video" ? 1 : 0) + (i.children ? countVideos(i.children) : 0),
    0,
  );
}
export function countWatched(items: FileItem[], w: Record<string, boolean>): number {
  return items.reduce(
    (n, i) => n + (i.type === "video" && w[i.path] ? 1 : 0) + (i.children ? countWatched(i.children, w) : 0),
    0,
  );
}
export function flattenVideos(items: FileItem[]): FileItem[] {
  const out: FileItem[] = [];
  for (const item of items) {
    if (item.type === "folder" && item.children) out.push(...flattenVideos(item.children));
    else if (item.type !== "folder") out.push(item);
  }
  return out;
}
export function findFile(nodes: FileItem[], target: string): FileItem | undefined {
  for (const n of nodes) {
    if (n.path === target) return n;
    if (n.children) {
      const f = findFile(n.children, target);
      if (f) return f;
    }
  }
  return undefined;
}
export function parentChain(nodes: FileItem[], target: string, chain: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.path === target) return chain;
    if (n.children) {
      const r = parentChain(n.children, target, [...chain, n.path]);
      if (r) return r;
    }
  }
  return null;
}
export function getLastResume(): { courseId: string; path: string } | null {
  try {
    const raw = localStorage.getItem("nest_last_resume");
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d?.courseId && d?.path) return d;
  } catch { /* corrupt: ignore */ }
  return null;
}
// ponytail: localStorage only; move to server when multi-device resume is wanted.
export function setLastResume(courseId: string, filePath: string): void {
  try {
    localStorage.setItem(`nest_last_played_${courseId}`, filePath);
    localStorage.setItem("nest_last_resume", JSON.stringify({ courseId, path: filePath }));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("nest:resume"));
}
