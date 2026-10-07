// Pure Zen (OpenCode free-tier) request-shape helpers — no server side effects,
// so tests can import this without binding a port. Adapted from 9router #4132.
import crypto from "crypto";

export const OPENCODE_UA = "opencode/1.18.31";
export const ZEN_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
export const ZEN_RESPONSES_URL = "https://opencode.ai/zen/v1/responses";
export const ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";
export const OPENCODE_ID_RE = /^(ses|msg)_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Canonical ID: 12-hex time part + 14-char base62 random part (Node stdlib only).
export const zenId = (prefix: "ses_" | "msg_") => {
  const time = Date.now().toString(16).slice(-12).padStart(12, "0");
  const rand = Array.from(
    crypto.getRandomValues(new Uint8Array(14)),
    (b) => BASE62[b % 62],
  ).join("");
  return `${prefix}${time}${rand}`;
};

export const zenHeaders = (session: string) => ({
  "Content-Type": "application/json",
  Authorization: "Bearer public",
  "User-Agent": OPENCODE_UA,
  Accept: "text/event-stream",
  "x-opencode-client": "desktop",
  "x-opencode-session": session,
  "x-opencode-request": zenId("msg_"),
  "x-opencode-project": "global",
});

// Upstream rejects tool-less free-tier requests — merge the missing quartet
// names as no-op declarations (caller tools preserved verbatim).
export const FINGERPRINT_TOOLS = ["bash", "glob", "grep", "read"];
export const ensureFingerprintTools = (body: Record<string, unknown>) => {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const present = new Set(
    tools.map((t) => {
      const rec = t as { name?: unknown; function?: { name?: unknown } };
      const n = rec?.name ?? rec?.function?.name;
      return typeof n === "string" ? n.trim() : "";
    }),
  );
  for (const name of FINGERPRINT_TOOLS) {
    if (present.has(name)) continue;
    tools.push({
      type: "function",
      function: {
        name,
        description: `OpenCode built-in ${name} tool`,
        parameters: { type: "object", properties: {} },
      },
    });
  }
  body.tools = tools;
};

export const buildChatBody = (
  model: string,
  systemMsg: unknown,
  messages: unknown,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model,
    messages: [systemMsg, ...(messages as unknown[])],
    stream: true,
  };
  ensureFingerprintTools(body);
  return body;
};

// ─── Model registry (single source; replaces scattered name checks) ───
// Upstream /models entries carry no free/API capability flags (id/created
// only), so classification is convention + probe-derived overrides, kept here
// in one place. Convention: `-free` suffix. Overrides below are the only
// hardcoded names; everything else flows from the live /models list.
export const FREE_MODEL_SUFFIX = "-free";
// Free but not suffixed upstream (single override, not per-route checks).
export const EXTRA_FREE_MODEL_IDS = new Set(["big-pickle"]);
// Families only serving via /responses — chat/completions 500s upstream for
// them (probed). Flat tool shape + instructions/input required there.
export const RESPONSES_MODEL_PREFIXES = ["muse-spark"];
// Upstream deprecations observed in the wild (410 + replacement metadata).
export const MODEL_ALIASES: Record<string, string> = {
  "mimo-v2.5-free": "mimo-v2.6-flash-free",
};

export const isFreeModel = (id: string): boolean =>
  !!id && (id.endsWith(FREE_MODEL_SUFFIX) || EXTRA_FREE_MODEL_IDS.has(id));

// Follow alias chain (loop-guarded) so deprecated ids resolve to replacements.
export const resolveModelId = (id: string): string => {
  let cur = id;
  const seen = new Set([cur]);
  while (MODEL_ALIASES[cur] && !seen.has(MODEL_ALIASES[cur])) {
    cur = MODEL_ALIASES[cur];
    seen.add(cur);
  }
  return cur;
};

export type ZenApi = "chat" | "responses";
export const apiForModel = (id: string): ZenApi =>
  RESPONSES_MODEL_PREFIXES.some((p) => resolveModelId(id).startsWith(p))
    ? "responses"
    : "chat";

// Responses endpoint wants the flat tool shape: { type, name, ... }.
// The nested chat-completions shape 400s with "Missing required parameter: tools[0].name".
export const ensureResponsesFingerprintTools = (body: Record<string, unknown>) => {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const present = new Set(
    tools.map((t) => {
      const rec = t as { name?: unknown };
      const n = rec?.name;
      return typeof n === "string" ? n.trim() : "";
    }),
  );
  for (const name of FINGERPRINT_TOOLS) {
    if (present.has(name)) continue;
    tools.push({
      type: "function",
      name,
      description: `OpenCode built-in ${name} tool`,
      parameters: { type: "object", properties: {} },
    });
  }
  body.tools = tools;
};

export const buildResponsesBody = (
  model: string,
  systemMsg: { content?: unknown } | unknown,
  messages: unknown,
): Record<string, unknown> => {
  const sys = systemMsg as { content?: unknown } | null;
  const input = ((messages as Array<{ role?: unknown; content?: unknown }>) || []).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: typeof m?.content === "string" ? m.content : String(m?.content ?? ""),
  }));
  const body: Record<string, unknown> = {
    model,
    instructions: typeof sys?.content === "string" ? sys.content : "",
    input,
    stream: true,
  };
  ensureResponsesFingerprintTools(body);
  return body;
};

// Transient provider outages (503 endpoint unavailable, 500s, 429s) should
// cascade to the next free model instead of surfacing as a dead error.
// Permanent failures (4xx except 429, auth, bad request) stop the cascade.
export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
export const isRetryableUpstream = (status: number): boolean =>
  RETRYABLE_STATUS.has(status);

// Ordered candidates for a chat request. Explicit model: itself (resolved)
// first, then the rest of the free list as fallback. Auto: sticky winner
// first, then free list order. Responses-API models sort after chat-API ones
// so a mid-cascade switch never mixes stream shapes in one relay.
export const buildCandidates = (
  model: string,
  autoWinner: string | null,
  free: string[],
): string[] => {
  const pick = model === "auto" ? autoWinner : resolveModelId(model);
  const base = model === "auto"
    ? [pick, ...free]
    : [pick, ...free.map(resolveModelId).filter((m) => m !== pick)];
  const deduped = base.filter((m, i, a): m is string => !!m && a.indexOf(m) === i);
  // Group by API so a mid-cascade switch never mixes stream shapes
  const firstResponses = deduped.length > 0 && apiForModel(deduped[0]) === "responses";
  const sameApi = deduped.filter((m) => (apiForModel(m) === "responses") === firstResponses);
  const otherApi = deduped.filter((m) => (apiForModel(m) === "responses") !== firstResponses);
  return [...sameApi, ...otherApi];
};

// ─── Upstream health (production-style: behavior-driven, not name-driven) ───
// Consecutive-failure breaker + success reset. Breaker failures skip that
// model for the cooldown; every other error class still cascades normally.
export const MODEL_BREAKER_THRESHOLD = 2;
export const MODEL_BREAKER_COOLDOWN_MS = 5 * 60_000;
const modelHealth = new Map<string, { fails: number; blockedUntil: number }>();
export const recordModelResult = (id: string, ok: boolean, retryable: boolean): void => {
  if (ok) {
    modelHealth.delete(id);
    return;
  }
  if (!retryable) return; // permanent errors don't count against health
  const h = modelHealth.get(id) ?? { fails: 0, blockedUntil: 0 };
  h.fails += 1;
  if (h.fails >= MODEL_BREAKER_THRESHOLD) h.blockedUntil = Date.now() + MODEL_BREAKER_COOLDOWN_MS;
  modelHealth.set(id, h);
};
export const isModelBlocked = (id: string): boolean =>
  (modelHealth.get(id)?.blockedUntil ?? 0) > Date.now();
// Test seam (timers unobservable otherwise).
export const resetModelHealth = (): void => {
  modelHealth.clear();
};
// Translate one responses-stream event into chat-completions SSE lines the
// frontend parser already understands. [] = skip (lifecycle/keepalive).
export const translateResponsesEvent = (eventType: string, data: unknown): string[] => {
  const rec = (data ?? {}) as { delta?: unknown; error?: unknown; response?: { error?: unknown } };
  if (eventType === "response.output_text.delta" && typeof rec.delta === "string" && rec.delta) {
    return [`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: rec.delta } }] })}`];
  }
  if (
    (eventType === "response.reasoning_text.delta" ||
      eventType === "response.reasoning_summary_text.delta") &&
    typeof rec.delta === "string" &&
    rec.delta
  ) {
    return [`data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning: rec.delta } }] })}`];
  }
  if (eventType === "response.completed") return ["data: [DONE]"];
  if (eventType === "response.failed" || eventType === "response.incomplete" || eventType === "error") {
    const errRec = (rec.response?.error ?? rec.error ?? {}) as { message?: unknown };
    const msg = typeof errRec.message === "string" && errRec.message ? errRec.message : "Upstream error";
    return [`data: ${JSON.stringify({ error: msg })}`, "data: [DONE]"];
  }
  return [];
};
