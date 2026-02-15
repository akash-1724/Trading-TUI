export function createSparkline(values: readonly number[], width = 20): string {
  const chars = " .:-=+*#%@";
  if (values.length === 0) return ".".repeat(Math.max(1, width));

  const window = values.length <= width ? [...values] : values.slice(values.length - width);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of window) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;

  const out = window.map((value) => {
    const normalized = (value - min) / range;
    const idx = Math.min(chars.length - 1, Math.floor(normalized * chars.length));
    return chars[idx] ?? chars[0];
  });

  if (out.length < width) {
    return ".".repeat(width - out.length) + out.join("");
  }
  return out.join("");
}
