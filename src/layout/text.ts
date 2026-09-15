export function wrapPacketText(
  text: string,
  width: number,
  fontSize: number,
): string[] {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0 ||
    width < fontSize
  ) {
    throw new Error(
      "PKT_E_TEXT_WIDTH: packet text needs at least one glyph of usable width; increase the field/detail width or reduce columns per line.",
    );
  }
  const capacity = Math.floor(width / fontSize);
  return text.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const points = Array.from(paragraph);
    if (points.length === 0) return [""];
    const lines: string[] = [];
    for (let i = 0; i < points.length; i += capacity) {
      lines.push(points.slice(i, i + capacity).join(""));
    }
    return lines;
  });
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
