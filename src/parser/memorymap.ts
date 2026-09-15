import type { PacketDSLAst, PacketFieldAst, SourcePosition } from "../ast/packet.ts";
import { WireglyphError } from "../errors.ts";

export interface MemoryMapRegion {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly preset: string;
  readonly role: string;
}

export interface MemoryMapParseResult {
  readonly ast: PacketDSLAst;
  readonly regions: readonly MemoryMapRegion[];
}

const BRACKET_RE =
  /^\[(0x[0-9a-fA-F]+|\d+)\s*-\s*(0x[0-9a-fA-F]+|\d+)\]\s+([^@]+?)(?:\s+@(\S+))?(?:\s+role=(\S+))?\s*$/;
const COLON_RE =
  /^(0x[0-9a-fA-F]+|\d+)\s*-\s*(0x[0-9a-fA-F]+|\d+)\s*:\s*([^@]+?)(?:\s+@(\S+))?(?:\s+role=(\S+))?\s*$/;

function sourcePosition(blockIndex: number, line: number): SourcePosition {
  return { line, column: 0, blockIndex };
}

function parseAddr(value: string): number {
  return value.startsWith("0x") || value.startsWith("0X")
    ? Number.parseInt(value, 16)
    : Number.parseInt(value, 10);
}

function stripKindHeader(source: string): string {
  return source.replace(/^\s*memory[-_]?map[ \t]*\r?\n/i, "");
}

function allocateColumns(
  regions: readonly MemoryMapRegion[],
  cols: number,
): { start: number; end: number }[] {
  const sizes = regions.map((region) => region.end - region.start + 1);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const raw = sizes.map((size) => Math.max(1, Math.round((size / total) * cols)));
  let diff = cols - raw.reduce((sum, size) => sum + size, 0);
  let index = 0;
  while (diff !== 0 && raw.length > 0) {
    const next = index % raw.length;
    if (diff > 0) {
      raw[next] += 1;
      diff -= 1;
    } else if (raw[next]! > 1) {
      raw[next] -= 1;
      diff += 1;
    }
    index += 1;
    if (index > cols * 4) break;
  }
  const spans: { start: number; end: number }[] = [];
  let cursor = 1;
  for (const width of raw) {
    spans.push({ start: cursor, end: cursor + width - 1 });
    cursor += width;
  }
  return spans;
}

export function parseMemoryMapDSL(
  source: string,
  context: { readonly blockIndex?: number; readonly lineOffset?: number } = {},
): MemoryMapParseResult {
  const blockIndex = context.blockIndex ?? 0;
  const lineOffset = context.lineOffset ?? 1;
  const text = stripKindHeader(source);
  let title = "Memory Map";
  let meta: string | undefined;
  let cols = 16;
  const regions: MemoryMapRegion[] = [];

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    const line = lineOffset + i;
    if (/^title\s*:/i.test(trimmed)) {
      title = trimmed.replace(/^title\s*:/i, "").trim();
      continue;
    }
    if (/^meta\s*:/i.test(trimmed)) {
      meta = trimmed.replace(/^meta\s*:/i, "").trim();
      continue;
    }
    if (/^cols\s*:/i.test(trimmed)) {
      cols = Number(trimmed.replace(/^cols\s*:/i, "").trim());
      continue;
    }
    const match = trimmed.match(BRACKET_RE) ?? trimmed.match(COLON_RE);
    if (!match) {
      throw new WireglyphError(`memorymap: invalid region line: ${trimmed}`, [
        {
          code: "WG_E_MEMORY_REGION",
          severity: "error",
          message: `invalid region line: ${trimmed}`,
          line,
        },
      ]);
    }
    const start = parseAddr(match[1] ?? "0");
    const end = parseAddr(match[2] ?? "0");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new WireglyphError(`memorymap: invalid address range ${start}-${end}`, [
        {
          code: "WG_E_MEMORY_RANGE",
          severity: "error",
          message: `invalid address range ${match[1]}-${match[2]}`,
          line,
        },
      ]);
    }
    regions.push({
      start,
      end,
      label: (match[3] ?? "").trim(),
      preset: match[4] ?? "data",
      role: match[5] ?? "region",
    });
  }

  if (!Number.isInteger(cols) || cols <= 0) {
    throw new WireglyphError("memorymap: cols must be a positive integer", [
      { code: "WG_E_MEMORY_COLS", severity: "error", message: "invalid cols" },
    ]);
  }
  if (regions.length === 0) {
    throw new WireglyphError("memorymap: at least one region is required", [
      { code: "WG_E_MEMORY_EMPTY", severity: "error", message: "no regions" },
    ]);
  }

  const spans = allocateColumns(regions, cols);
  const fields: PacketFieldAst[] = regions.map((region, index) => {
    const span = spans[index]!;
    const field: PacketFieldAst = {
      sourcePosition: sourcePosition(blockIndex, lineOffset),
      range: span.start === span.end ? `B${span.start}` : `B${span.start}-${span.end}`,
      label: region.label,
      value: `0x${region.start.toString(16)}-0x${region.end.toString(16)}`,
      preset: region.preset,
      role: region.role,
    };
    return field;
  });

  const ast: PacketDSLAst = {
    blockIndex,
    sourcePosition: sourcePosition(blockIndex, lineOffset),
    title,
    cols,
    wrap: "none",
    ruler: "field",
    diagramRenderer: "svg-parity",
    fields,
  };
  if (meta) ast.meta = meta;
  return { ast, regions };
}
