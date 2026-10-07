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
export function getLastPlayed(courseId: string): string | null {
  try {
    return localStorage.getItem(`nest_last_played_${courseId}`);
  } catch { return null; }
}
// Server is the single source of truth (shared across devices).
// localStorage stays as an instant cache so UI renders before fetch resolves.
export function setLastResume(courseId: string, filePath: string): void {
  try {
    localStorage.setItem(`nest_last_played_${courseId}`, filePath);
    localStorage.setItem("nest_last_resume", JSON.stringify({ courseId, path: filePath }));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("nest:resume"));
  // Write-through to server (fire-and-forget — optimistic cache already set)
  try {
    fetch(`${window.location.origin}/api/resume`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, path: filePath }),
    }).catch(() => {});
  } catch { /* offline: keep local cache */ }
}
// Pull server truth into the local cache. First-run migration: if the server
// is empty but this browser has a resume, push the local one up.
export async function syncResumeFromServer(): Promise<{ courseId: string; path: string } | null> {
  try {
    const r = await fetch(`${window.location.origin}/api/resume`);
    if (!r.ok) return getLastResume();
    const d = (await r.json()) as {
      resume?: { courseId?: string; path?: string } | null;
      perCourse?: Record<string, string>;
    };
    if (d?.resume?.courseId && d?.resume?.path) {
      try {
        if (d.perCourse && typeof d.perCourse === "object") {
          for (const [cid, fp] of Object.entries(d.perCourse)) {
            if (typeof fp === "string" && fp) localStorage.setItem(`nest_last_played_${cid}`, fp);
          }
        }
        localStorage.setItem("nest_last_resume", JSON.stringify({ courseId: d.resume.courseId, path: d.resume.path }));
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("nest:resume"));
      return { courseId: d.resume.courseId, path: d.resume.path };
    }
    // Server empty → migrate this device's cache up so other devices see it
    const local = getLastResume();
    if (local) {
      try {
        await fetch(`${window.location.origin}/api/resume`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: local.courseId, path: local.path }),
        }).catch(() => {});
      } catch { /* offline */ }
    }
    return local;
  } catch {
    return getLastResume();
  }
}
// ─── Theme: server is the single source of truth (shared across devices) ───
// localStorage stays as an instant cache so first paint uses it before fetch.
export interface ThemeState { name: string; dark: boolean }
export function getLocalTheme(): ThemeState {
  let name = "default";
  let dark = true;
  try {
    name = localStorage.getItem("nest_theme_name") || "default";
    const saved = localStorage.getItem("nest_theme_dark");
    dark = saved !== null ? saved === "true" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch { /* storage blocked: defaults */ }
  return { name, dark };
}
export function applyTheme(t: ThemeState): void {
  document.documentElement.setAttribute("data-theme", `${t.name}-${t.dark ? "dark" : "light"}`);
}
export function setThemeState(t: ThemeState): void {
  try {
    localStorage.setItem("nest_theme_name", t.name);
    localStorage.setItem("nest_theme_dark", String(t.dark));
  } catch { /* ignore */ }
  applyTheme(t);
  window.dispatchEvent(new CustomEvent("nest:theme"));
  // Write-through to server (fire-and-forget — optimistic cache already set)
  try {
    fetch(`${window.location.origin}/api/settings/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).catch(() => {});
  } catch { /* offline: keep local cache */ }
}
// Pull server truth into the local cache. First-run migration: if the server
// is empty but this browser has a non-default theme, push the local one up.
export async function syncThemeFromServer(): Promise<ThemeState | null> {
  try {
    const r = await fetch(`${window.location.origin}/api/settings/theme`);
    if (!r.ok) return null;
    const d = (await r.json()) as { theme?: { name?: string; dark?: boolean } | null };
    if (d?.theme && typeof d.theme.name === "string" && typeof d.theme.dark === "boolean") {
      const t = { name: d.theme.name, dark: d.theme.dark };
      try {
        localStorage.setItem("nest_theme_name", t.name);
        localStorage.setItem("nest_theme_dark", String(t.dark));
      } catch { /* ignore */ }
      applyTheme(t);
      window.dispatchEvent(new CustomEvent("nest:theme"));
      return t;
    }
    const local = getLocalTheme();
    if (local.name !== "default" || !local.dark) {
      try {
        await fetch(`${window.location.origin}/api/settings/theme`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(local),
        }).catch(() => {});
      } catch { /* offline */ }
    }
    return null;
  } catch {
    return null;
  }
}
