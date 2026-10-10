const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { totalTokens, formatTotalLine } = require("./tokens");

const REAL = { input: 800, output: 300, reasoning: 100, cache: { read: 30, write: 4 } }; // total 1234

test("sums all five SDK fields", () => {
  assert.equal(totalTokens(REAL), 1234);
});

test("zero cache still sums", () => {
  assert.equal(totalTokens({ input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } }), 15);
});

test("missing tokens returns null (never estimates)", () => {
  assert.equal(totalTokens(undefined), null);
  assert.equal(totalTokens(null), null);
  assert.equal(totalTokens({}), null);
});

test("non-finite field returns null", () => {
  assert.equal(totalTokens({ input: NaN, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }), null);
  assert.equal(totalTokens({ input: 1, output: 1, reasoning: 0, cache: {} }), null);
});

test("formats the per-response TOTAL-only line", () => {
  assert.equal(formatTotalLine(1234), "`tokens: 1234`");
  assert.equal(formatTotalLine(null), "`tokens unavailable`");
});

test("no estimation terms anywhere in product code", () => {
  const src = fs.readFileSync(__dirname + "/tokens.js", "utf8");
  for (const banned of ["charsPerToken", "text.length", "heuristic", "estimate", "/ 4", "* 0.25", "length *"]) {
    assert.ok(!src.toLowerCase().includes(banned.toLowerCase()), `banned term present: ${banned}`);
  }
});
