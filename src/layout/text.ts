const ASCII_EM = 0.6;
const WIDE_EM = 1.0;

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
    const code = char.codePointAt(0) ?? 0;
    em += isWideGlyph(code) ? WIDE_EM : ASCII_EM;
  }
  return em * fontSize;
}

function minGlyphWidth(fontSize: number): number {
  return ASCII_EM * fontSize;
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
