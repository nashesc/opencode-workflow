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

// Split-view helpers (exact SDK fields only, no approximations):
// context = fresh input + cache read (what the model actually saw);
// hitRate = share of context served from cache (1 = full reuse, 0 = full miss).
function contextTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return null;
  const { input, cache } = tokens;
  if (!isFiniteNumber(input)) return null;
  if (!cache || typeof cache !== "object" || !isFiniteNumber(cache.read)) return null;
  return input + cache.read;
}

function cacheHitRate(tokens) {
  const ctx = contextTokens(tokens);
  if (ctx === null || ctx === 0) return null;
  return tokens.cache.read / ctx;
}

module.exports = { totalTokens, formatTotalLine, contextTokens, cacheHitRate };
