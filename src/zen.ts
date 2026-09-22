// Pure Zen (OpenCode free-tier) request-shape helpers — no server side effects,
// so tests can import this without binding a port. Adapted from 9router #4132.
import crypto from "crypto";

export const OPENCODE_UA = "opencode/1.18.31";
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
