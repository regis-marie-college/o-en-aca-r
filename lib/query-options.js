"use strict";

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseLimit(value, fallback = 200, max = 500) {
  return parsePositiveInt(value, fallback, max);
}

module.exports = {
  parseLimit,
};
