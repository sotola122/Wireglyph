/**
 * Advance widths in em for code points 0x20–0x7e.
 *
 * Measured in Chromium at weight 700 against `Noto Sans CJK JP`, the first
 * family of the default packet font stack, then padded by ~6% so the estimate
 * is an upper bound for the rendered run. Fit-then-wrap and every containment
 * check derive their geometry from this estimate, so under-reporting here is
 * what lets a label spill into the neighbouring cell.
 *
 * A flat 0.6em per ASCII character under-reports uppercase (measured average
 * 0.64em, up to 0.92em for `M`/`W`) and is the root cause of the register and
 * packet label collisions.
 */
const ASCII_EM_TABLE: readonly number[] = [
  0.300, 0.392, 0.612, 0.625, 0.625, 1.021, 0.784, 0.346, 0.401, 0.401,
  0.537, 0.625, 0.345, 0.392, 0.345, 0.410, 0.625, 0.625, 0.625, 0.625,
  0.625, 0.625, 0.625, 0.625, 0.625, 0.625, 0.345, 0.345, 0.625, 0.625,
  0.625, 0.545, 1.067, 0.680, 0.722, 0.695, 0.757, 0.652, 0.620, 0.760,
  0.802, 0.350, 0.602, 0.727, 0.613, 0.904, 0.794, 0.816, 0.707, 0.816,
  0.723, 0.662, 0.663, 0.793, 0.656, 0.970, 0.665, 0.615, 0.650, 0.401,
  0.410, 0.401, 0.625, 0.601, 0.664, 0.627, 0.683, 0.559, 0.683, 0.616,
  0.394, 0.633, 0.678, 0.322, 0.324, 0.640, 0.334, 1.022, 0.680, 0.664,
  0.683, 0.683, 0.462, 0.525, 0.446, 0.675, 0.611, 0.915, 0.596, 0.609,
  0.542, 0.401, 0.314, 0.401, 0.625,
];

const WIDE_EM = 1.0;
/** Non-ASCII glyphs without a measured advance (accented Latin, Greek, …). */
const FALLBACK_EM = 0.72;

function glyphEm(code: number): number {
  if (code >= 0x20 && code <= 0x7e) return ASCII_EM_TABLE[code - 0x20] ?? FALLBACK_EM;
  return isWideGlyph(code) ? WIDE_EM : FALLBACK_EM;
}

/** East_Asian_Width-style wide glyphs (CJK, Hangul, kana, fullwidth, emoji). */
function isWideGlyph(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2329 && code <= 0x232a) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  );
}

export function measureTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    em += glyphEm(char.codePointAt(0) ?? 0);
  }
  return em * fontSize;
}

/** Narrowest advance the estimator will ever assign, used as the glyph floor. */
const MIN_GLYPH_EM = 0.6;

function minGlyphWidth(fontSize: number): number {
  return MIN_GLYPH_EM * fontSize;
}

function tokenizePacketText(text: string): string[] {
  return (
    text.match(
      /bit\[[0-9]+\s*-\s*[0-9]+\]|b[0-9]+|0x[0-9A-Fa-f]+|[A-Za-z0-9_]+|\s+|./gu,
    ) ?? []
  );
}

function wrapTokenChars(token: string, width: number, fontSize: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of token) {
    const next = current + char;
    if (current && measureTextWidth(next, fontSize) > width) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function wrapOversizedToken(
  token: string,
  width: number,
  fontSize: number,
): { lines: string[]; last: string } {
  const pieces = wrapTokenChars(token, width, fontSize);
  return { lines: pieces.slice(0, -1), last: pieces[pieces.length - 1] ?? "" };
}

function wrapParagraph(text: string, width: number, fontSize: number): string[] {
  const tokens = tokenizePacketText(text);
  if (tokens.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  const flush = (): void => {
    lines.push(current);
    current = "";
  };
  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (!current) continue;
      const withSpace = current + token;
      if (measureTextWidth(withSpace, fontSize) <= width) {
        current = withSpace;
      } else {
        flush();
      }
      continue;
    }
    if (measureTextWidth(token, fontSize) > width) {
      if (current) flush();
      const split = wrapOversizedToken(token, width, fontSize);
      lines.push(...split.lines);
      current = split.last;
      continue;
    }
    const candidate = current + token;
    if (!current || measureTextWidth(candidate, fontSize) <= width) {
      current = candidate;
      continue;
    }
    flush();
    current = token;
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

export function wrapPacketText(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0 ||
    width < minGlyphWidth(fontSize)
  ) {
    throw new Error(
      "PKT_E_TEXT_WIDTH: packet text needs at least one glyph of usable width; increase the field/detail width or reduce columns per line.",
    );
  }
  return text.split(/\r\n|\r|\n/).flatMap((paragraph) =>
    wrapParagraph(paragraph, width, fontSize),
  );
}

/**
 * Prefer a single line at the authored size, then shrink toward minFontSize,
 * then wrap at the floor. Never drops below minFontSize.
 */
export function fitThenWrap(
  text: string,
  width: number,
  fontSize: number,
  minFontSize: number,
): { readonly lines: readonly string[]; readonly fontSize: number } {
  const floor = Math.min(fontSize, Math.max(minFontSize, minGlyphWidth(1)));
  if (measureTextWidth(text, fontSize) <= width) {
    return { lines: [text], fontSize };
  }
  if (floor < fontSize - 0.01 && measureTextWidth(text, floor) <= width) {
    let low = floor;
    let high = fontSize;
    for (let i = 0; i < 14; i += 1) {
      const mid = (low + high) / 2;
      if (measureTextWidth(text, mid) <= width) low = mid;
      else high = mid;
    }
    return { lines: [text], fontSize: Number(low.toFixed(4)) };
  }
  return { lines: wrapPacketText(text, width, floor), fontSize: floor };
}

export function textBoxWidth(
  boxWidth: number,
  fontSize: number,
  padding: number,
): number {
  if (boxWidth >= fontSize + padding) return boxWidth - padding;
  if (boxWidth >= fontSize) return boxWidth;
  return boxWidth;
}

export const packetTextBlockHeight = (
  lines: readonly string[],
  fontSize: number,
  lineHeight: number,
): number => fontSize * 1.25 + Math.max(0, lines.length - 1) * lineHeight;
