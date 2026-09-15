export interface FenceBlock {
  readonly kind: string;
  readonly blockIndex: number;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly rawFence: string;
  readonly dslText: string;
}

const CLOSING_FENCE_REGEX = /^```[ \t]*$/gm;

export function extractNamedFenceBlocks(
  markdown: string,
  names: readonly string[],
): FenceBlock[] {
  const namePattern = names.map(escapeRegExp).join("|");
  const openRegex = new RegExp(`^\\\`\\\`\\\`(?:${namePattern})[ \\t]*$`, "gm");
  const blocks: FenceBlock[] = [];
  let blockIndex = 0;
  let searchStart = 0;

  while (searchStart < markdown.length) {
    openRegex.lastIndex = searchStart;
    const openMatch = openRegex.exec(markdown);
    if (!openMatch) break;

    const fenceStart = openMatch.index;
    const beforeFence = markdown.substring(0, fenceStart);
    const lineStart = beforeFence.split("\n").length;
    const afterOpen = fenceStart + openMatch[0].length;
    CLOSING_FENCE_REGEX.lastIndex = afterOpen;
    const closeMatch = CLOSING_FENCE_REGEX.exec(markdown);
    if (!closeMatch) break;

    const fenceEnd = closeMatch.index + closeMatch[0].length;
    const beforeClose = markdown.substring(0, fenceEnd);
    const lineEnd = beforeClose.split("\n").length;
    const rawFence = markdown.substring(fenceStart, closeMatch.index).trimEnd();
    const dslText = markdown.substring(afterOpen, closeMatch.index).trim();
    const kind = (openMatch[0].match(/```(\S+)/)?.[1] ?? names[0] ?? "packet")
      .trim()
      .toLowerCase();

    blocks.push({
      kind,
      blockIndex,
      lineStart,
      lineEnd,
      rawFence,
      dslText,
    });
    blockIndex += 1;
    searchStart = fenceEnd;
  }

  return blocks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
