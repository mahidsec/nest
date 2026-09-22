// ─── Crash-proof localStorage (private mode / corrupt data safe) ───
export const safeGet = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
export const safeSet = (k: string, v: string): void => {
  try { localStorage.setItem(k, v); } catch { /* storage full/blocked: ignore */ }
};
export const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};
