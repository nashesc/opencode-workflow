"use strict";

function isFiniteNumber(n) { return typeof n === "number" && Number.isFinite(n); }

function totalTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return null;
  const { input, output, reasoning, cache } = tokens;
  if (!isFiniteNumber(input) || !isFiniteNumber(output) || !isFiniteNumber(reasoning)) return null;
  if (!cache || typeof cache !== "object") return null;
  if (!isFiniteNumber(cache.read) || !isFiniteNumber(cache.write)) return null;
  return input + output + reasoning + cache.read + cache.write;
}

function formatTotalLine(total) {
  return typeof total === "number" && Number.isFinite(total) ? `\`tokens: ${total}\`` : "`tokens unavailable`";
}

module.exports = { totalTokens, formatTotalLine };
