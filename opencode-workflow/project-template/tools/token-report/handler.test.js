const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handleMessageUpdated } = require("./handler");

const assistant = (tokens, time = { created: 1, completed: 2 }) => ({
  type: "message.updated",
  properties: { info: {
    id: "msg_def", sessionID: "ses_abc", role: "assistant",
    modelID: "gpt-5", providerID: "openai", cost: 0.0012,
    time, tokens,
  } },
});

test("assistant with full tokens → ok + total 1234 + TOTAL-only line", () => {
  const r = handleMessageUpdated(assistant({ input: 800, output: 300, reasoning: 100, cache: { read: 30, write: 4 } }));
  assert.equal(r.ok, true);
  assert.equal(r.total, 1234);
  assert.equal(r.sessionID, "ses_abc");
  assert.equal(r.messageID, "msg_def");
  assert.equal(r.model, "openai/gpt-5");
  assert.equal(r.line, "`tokens: 1234`");
  assert.deepEqual(r.vaultFields, { input: 800, output: 300, reasoning: 100, cacheRead: 30, cacheWrite: 4 });
});

test("user message → skip, flagged, never throws", () => {
  const ev = assistant({ input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } });
  ev.properties.info.role = "user";
  const r = handleMessageUpdated(ev);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "non-assistant");
  assert.equal(r.line, "`tokens unavailable`");
});

test("assistant with missing tokens → skip + flag (NEVER estimate)", () => {
  const ev = assistant(undefined);
  const r = handleMessageUpdated(ev);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing-tokens");
  assert.equal(r.line, "`tokens unavailable`");
  assert.ok(!JSON.stringify(r).match(/charsPerToken|heuristic/i), "must not estimate");
});

test("malformed event and throwing logger never propagate", () => {
  assert.doesNotThrow(() => handleMessageUpdated(null));
  assert.doesNotThrow(() => handleMessageUpdated({ bogus: true }));
  const badLog = () => { throw new Error("log is down"); };
  const r = handleMessageUpdated(assistant({ input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }), { log: badLog });
  assert.equal(r.ok, true); // logger failure must not break the report
});

test("non-zero total without completed time still records (finished marker optional)", () => {
  const ev = assistant({ input: 800, output: 300, reasoning: 100, cache: { read: 30, write: 4 } }, { created: 1 });
  const r = handleMessageUpdated(ev);
  assert.equal(r.ok, true);
  assert.equal(r.total, 1234);
  assert.equal(r.line, "`tokens: 1234`");
});

test("missing tokens without completed time → silent interim skip (no line)", () => {
  const ev = assistant(undefined, { created: 1 });
  const r = handleMessageUpdated(ev);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "interim");
  assert.ok(!("line" in r), "interim carries no display line");
});

test("finished event with zero total → visible missing-tokens flag (never 0 line)", () => {
  const r = handleMessageUpdated(assistant({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing-tokens");
  assert.equal(r.line, "`tokens unavailable`");
});
