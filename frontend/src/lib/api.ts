// ─── Tiny fetch wrapper: same fetch, throws on !ok, AbortSignal-ready ───
export const API = window.location.origin;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try {
      const d = await r.json();
      if (d?.error) msg = d.error;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}
