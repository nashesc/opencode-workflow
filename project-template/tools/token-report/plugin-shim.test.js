const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SHIM = pathToFileURL(path.join(__dirname, "..", "..", ".opencode", "plugins", "token-report.js")).href;

function withTempVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shim-vault-"));
  process.env.TOKEN_USAGE_PATH = path.join(dir, "TokenUsage.md");
  return dir;
}

const assistantEvent = (tokens, time = { created: 1, completed: 2 }) => ({ event: {
  type: "message.updated",
  properties: { info: {
    id: "msg_def", sessionID: "ses_abc", role: "assistant",
    modelID: "gpt-5", providerID: "openai", cost: 0.001,
    time, tokens,
  } } } });

const TOKENS_1234 = { input: 800, output: 300, reasoning: 100, cache: { read: 30, write: 4 } };

test("tokened message.updated writes exactly one vault line with totals", async () => {
  const dir = withTempVault();
  try {
    const logs = [];
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async (e) => logs.push(e) } }, project: {}, directory: process.cwd() });
    await plugin.event(assistantEvent(TOKENS_1234));
    const text = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8");
    const lines = text.split("\n").filter((l) => l.includes("msg_def"));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("total:1234"), `got: ${lines[0]}`);
    assert.ok(logs.some((e) => e && e.body && /tokens:1234/.test(e.body.message || "")));
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("interim and missing-tokens events write nothing and never throw", async () => {
  const dir = withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    await plugin.event(null); // must not throw
    await plugin.event(assistantEvent(undefined)); // missing tokens
    await plugin.event(assistantEvent(
      { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      { created: 1 } // no completed -> interim
    ));
    const vaultFile = path.join(dir, "TokenUsage.md");
    if (fs.existsSync(vaultFile)) {
      const lines = fs.readFileSync(vaultFile, "utf8").split("\n").filter((l) => l.includes("msg_def"));
      assert.equal(lines.length, 0);
    }
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("hook surface is vault-only: no text.complete export", async () => {
  withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    assert.equal(typeof plugin.event, "function");
    assert.equal(typeof plugin["message.updated"], "function");
    assert.equal(plugin["experimental.text.complete"], undefined);
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("identical redelivery (dual subscription) writes exactly one vault line", async () => {
  const dir = withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    const ev = assistantEvent({ input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } });
    await plugin.event(ev);
    await plugin.event(ev);
    const lines = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8").split("\n").filter((l) => l.includes("msg_def"));
    assert.equal(lines.length, 1);
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("app.log uses body-nested payload per AppLogData (else server 400s)", async () => {
  withTempVault();
  try {
    const calls = [];
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async (e) => calls.push(e) } }, project: {}, directory: process.cwd() });
    await plugin.event(assistantEvent({ input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } }));
    assert.ok(calls.length > 0, "expected at least one app.log call");
    for (const c of calls) {
      assert.ok(c && c.body && c.body.service === "token-report", `not body-nested: ${JSON.stringify(c)}`);
      assert.ok(["debug", "info", "warn", "error"].includes(c.body.level), `bad level: ${JSON.stringify(c)}`);
      assert.equal(typeof c.body.message, "string");
    }
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

const evWithId = (id, total) => ({ event: {
  type: "message.updated",
  properties: { info: {
    id, sessionID: "ses_abc", role: "assistant",
    modelID: "gpt-5", providerID: "openai", cost: 0.001,
    time: { created: 1, completed: 2 },
    tokens: { input: total, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  } } } });

test("interim then final for one message leaves exactly one vault line", async () => {
  const dir = withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    await plugin.event(evWithId("msg_stream", 650)); // non-zero interim records
    await plugin.event(evWithId("msg_stream", 720)); // final overwrites in place
    const lines = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8").split("\n").filter((l) => l.includes("msg_stream"));
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("total:720"), "final total wins");
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("dedupe survives past 1000 entries (bounded LRU, no map wipe)", async () => {
  const dir = withTempVault();
  try {
    const infos = [];
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async (e) => infos.push(e) } }, project: {}, directory: process.cwd() });
    for (let i = 0; i < 1001; i++) await plugin.event(evWithId(`msg_${i}`, 1000 + i));
    await plugin.event(evWithId("msg_1000", 2000)); // identical redelivery of the newest
    // A wiped map would re-record (second info log + second vault write);
    // the bounded LRU retains the newest entry, so redelivery is skipped.
    const replays = infos.filter((e) => e?.body?.message?.includes("msg=msg_1000"));
    assert.equal(replays.length, 1);
    const lines = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8").split("\n").filter((l) => l.includes("msg_1000"));
    assert.equal(lines.length, 1);
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

const userEvent = (id) => ({ event: {
  type: "message.updated",
  properties: { info: {
    id, sessionID: "ses_abc", role: "user",
    modelID: "gpt-5", providerID: "openai",
    time: { created: 1, completed: 2 },
  } } } });

test("user prompt stamps subsequent assistant lines; user writes nothing", async () => {
  const dir = withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    await plugin.event(userEvent("msg_user_7"));
    const vaultFile = path.join(dir, "TokenUsage.md");
    assert.ok(!fs.existsSync(vaultFile) || !fs.readFileSync(vaultFile, "utf8").includes("msg_user_7"), "user prompt never written");
    await plugin.event(evWithId("msg_a1", 500));
    await plugin.event(evWithId("msg_a2", 600));
    const text = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8");
    const lines = text.split("\n").filter((l) => l.includes("prompt:msg_user_7"));
    assert.equal(lines.length, 2, "both assistant steps stamped");
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});

test("assistant without a preceding user prompt lands in prompt:unknown", async () => {
  const dir = withTempVault();
  try {
    const mod = await import(SHIM);
    const plugin = await mod.TokenReport({ client: { app: { log: async () => {} } }, project: {}, directory: process.cwd() });
    await plugin.event(evWithId("msg_solo", 500));
    const text = fs.readFileSync(path.join(dir, "TokenUsage.md"), "utf8");
    assert.ok(text.split("\n").some((l) => l.includes("msg_solo") && l.includes("prompt:unknown")));
  } finally { delete process.env.TOKEN_USAGE_PATH; }
});
