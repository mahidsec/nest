import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OPENCODE_ID_RE,
  OPENCODE_UA,
  FINGERPRINT_TOOLS,
  zenId,
  zenHeaders,
  ensureFingerprintTools,
  buildChatBody,
  apiForModel,
  isFreeModel,
  resolveModelId,
  buildResponsesBody,
  ensureResponsesFingerprintTools,
  translateResponsesEvent,
  buildCandidates,
  isRetryableUpstream,
  recordModelResult,
  isModelBlocked,
  resetModelHealth,
} from "../src/zen.js";

const toolNames = (body: Record<string, unknown>) =>
  ((body.tools as Array<{ function?: { name?: string } }>) || []).map(
    (t) => t.function?.name,
  );

describe("zenId", () => {
  it("matches canonical ses_/msg_ format at length 30", () => {
    for (let i = 0; i < 20; i++) {
      const s = zenId("ses_");
      const m = zenId("msg_");
      assert.match(s, OPENCODE_ID_RE);
      assert.match(m, OPENCODE_ID_RE);
      assert.equal(s.length, 30);
      assert.equal(m.length, 30);
    }
  });
  it("rejects the old UUID shape", () => {
    assert.doesNotMatch(
      "ses_" + "9b2f4a1c".repeat(4),
      OPENCODE_ID_RE,
    );
  });
  it("mints unique ids", () => {
    assert.notEqual(zenId("ses_"), zenId("ses_"));
  });
});

describe("zenHeaders", () => {
  it("sends versioned UA and Bearer public", () => {
    const h = zenHeaders(zenId("ses_"));
    assert.equal(h["User-Agent"], OPENCODE_UA);
    assert.match(h["User-Agent"], /opencode\/1\.(1[7-9]|[2-9]\d)/);
    assert.equal(h.Authorization, "Bearer public");
  });
  it("uses canonical session + request ids", () => {
    const h = zenHeaders(zenId("ses_"));
    assert.match(h["x-opencode-session"], OPENCODE_ID_RE);
    assert.match(h["x-opencode-request"], OPENCODE_ID_RE);
  });
});

describe("ensureFingerprintTools", () => {
  it("injects the quartet into a tool-less body", () => {
    const body: Record<string, unknown> = {};
    ensureFingerprintTools(body);
    assert.deepEqual(toolNames(body).sort(), [...FINGERPRINT_TOOLS].sort());
  });
  it("preserves caller tools first, appends only missing names", () => {
    const body: Record<string, unknown> = {
      tools: [
        {
          type: "function",
          function: {
            name: "my_tool",
            description: "m",
            parameters: { type: "object", properties: {} },
          },
        },
        {
          type: "function",
          function: { name: "read", parameters: { type: "object" } },
        },
      ],
    };
    ensureFingerprintTools(body);
    const names = toolNames(body);
    assert.equal(names[0], "my_tool");
    assert.equal(names[1], "read");
    for (const n of FINGERPRINT_TOOLS) assert.ok(names.includes(n), n);
    assert.equal(names.length, 5); // no duplicate "read"
  });
  it("recognizes flat {name} tool shape", () => {
    const body: Record<string, unknown> = {
      tools: [{ type: "function", name: "bash" }],
    };
    ensureFingerprintTools(body);
    assert.equal(toolNames(body).length, 4);
  });
});

describe("buildChatBody", () => {
  it("forces stream:true with system message first", () => {
    const sys = { role: "system", content: "s" };
    const msgs = [{ role: "user", content: "hi" }];
    const body = buildChatBody("m", sys, msgs);
    assert.equal(body.stream, true);
    assert.equal(body.model, "m");
    assert.deepEqual(body.messages, [sys, ...msgs]);
    for (const n of FINGERPRINT_TOOLS)
      assert.ok(toolNames(body).includes(n), n);
  });
});

describe("model registry", () => {
  it("classifies free models by convention + override", () => {
    assert.equal(isFreeModel("exo-free"), true);
    assert.equal(isFreeModel("big-pickle"), true); // override, not suffixed
    assert.equal(isFreeModel("gpt-5"), false);
    assert.equal(isFreeModel(""), false);
  });
  it("resolves deprecated aliases", () => {
    assert.equal(resolveModelId("mimo-v2.5-free"), "mimo-v2.6-flash-free");
    assert.equal(resolveModelId("exo-free"), "exo-free");
  });
  it("routes responses families by prefix, not per-model ifs", () => {
    assert.equal(apiForModel("muse-spark-1.3-contributor-free"), "responses");
    assert.equal(apiForModel("muse-spark-9"), "responses"); // future-proof
    assert.equal(apiForModel("exo-free"), "chat");
    assert.equal(apiForModel("big-pickle"), "chat");
  });
});

describe("buildResponsesBody", () => {
  it("uses instructions+input with the flat tool shape", () => {
    const sys = { role: "system", content: "be nice" };
    const msgs = [{ role: "user", content: "hi" }];
    const body = buildResponsesBody("muse-spark-1.3-contributor-free", sys, msgs);
    assert.equal(body.model, "muse-spark-1.3-contributor-free");
    assert.equal(body.instructions, "be nice");
    assert.equal(body.stream, true);
    assert.deepEqual(body.input, [{ role: "user", content: "hi" }]);
    // Flat {type, name} shape — nested function.name 400s upstream
    const tools = body.tools as Array<{ type?: string; name?: string; function?: unknown }>;
    assert.equal(tools.length, FINGERPRINT_TOOLS.length);
    for (const t of tools) {
      assert.equal(t.type, "function");
      assert.ok(typeof t.name === "string" && t.name);
      assert.equal(t.function, undefined);
    }
  });
  it("merges flat-shape caller tools without duplicates", () => {
    const body: Record<string, unknown> = {
      tools: [{ type: "function", name: "bash" }],
    };
    ensureResponsesFingerprintTools(body);
    const tools = body.tools as Array<{ name?: string }>;
    assert.equal(tools.length, 4);
  });
});

describe("translateResponsesEvent", () => {
  it("maps output_text deltas to chat-completions SSE", () => {
    const out = translateResponsesEvent("response.output_text.delta", { delta: "Hello" });
    assert.equal(out.length, 1);
    const payload = JSON.parse(out[0].slice(6));
    assert.equal(payload.choices[0].delta.content, "Hello");
  });
  it("maps reasoning deltas to the reasoning field", () => {
    const out = translateResponsesEvent("response.reasoning_text.delta", { delta: "thinking" });
    assert.equal(out.length, 1);
    const payload = JSON.parse(out[0].slice(6));
    assert.equal(payload.choices[0].delta.reasoning, "thinking");
  });
  it("emits [DONE] on completion", () => {
    assert.deepEqual(translateResponsesEvent("response.completed", {}), ["data: [DONE]"]);
  });
  it("skips lifecycle and keepalive events", () => {
    for (const ev of ["response.created", "response.in_progress", "response.output_item.added", "response.content_part.added", "ping"]) {
      assert.deepEqual(translateResponsesEvent(ev, {}), [], ev);
    }
  });
});

describe("isRetryableUpstream", () => {
  it("retries transient outages, stops on permanent failures", () => {
    for (const s of [408, 429, 500, 502, 503, 504]) assert.equal(isRetryableUpstream(s), true, String(s));
    for (const s of [400, 401, 403, 404, 410]) assert.equal(isRetryableUpstream(s), false, String(s));
  });
});

describe("buildCandidates", () => {
  it("puts the explicit model first with free-list fallback", () => {
    const out = buildCandidates("exo-free", null, ["exo-free", "big-pickle", "mimo-v2.6-flash-free"]);
    assert.equal(out[0], "exo-free");
    assert.ok(out.includes("big-pickle"));
    assert.ok(out.includes("mimo-v2.6-flash-free"));
    assert.equal(out.length, 3); // deduped
  });
  it("keeps auto winner-first ordering", () => {
    const out = buildCandidates("auto", "big-pickle", ["exo-free", "big-pickle"]);
    assert.equal(out[0], "big-pickle");
  });
  it("sorts responses-API models after chat-API ones", () => {
    const out = buildCandidates("muse-spark-1.3-contributor-free", null, ["exo-free", "muse-spark-1.3-contributor-free"]);
    assert.equal(out[0], "muse-spark-1.3-contributor-free");
    assert.equal(out[out.length - 1], "exo-free");
  });
  it("resolves aliases before ordering", () => {
    const out = buildCandidates("mimo-v2.5-free", null, ["mimo-v2.5-free", "exo-free"]);
    assert.equal(out[0], "mimo-v2.6-flash-free");
  });
});

describe("model health breaker", () => {
  it("blocks after consecutive retryable failures, resets on success", () => {
    resetModelHealth();
    assert.equal(isModelBlocked("exo-free"), false);
    recordModelResult("exo-free", false, true);
    assert.equal(isModelBlocked("exo-free"), false); // 1 fail: still eligible
    recordModelResult("exo-free", false, true);
    assert.equal(isModelBlocked("exo-free"), true); // threshold hit
    recordModelResult("exo-free", true, false);
    assert.equal(isModelBlocked("exo-free"), false); // success resets
  });
  it("ignores permanent errors for health", () => {
    resetModelHealth();
    recordModelResult("exo-free", false, false);
    recordModelResult("exo-free", false, false);
    assert.equal(isModelBlocked("exo-free"), false);
  });
});
