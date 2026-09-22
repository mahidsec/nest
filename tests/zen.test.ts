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
