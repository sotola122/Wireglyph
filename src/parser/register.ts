import type { PacketDSLAst, PacketFieldAst, SourcePosition } from "../ast/packet.ts";
import { WireglyphError } from "../errors.ts";

export interface RegisterMapParseResult {
  readonly ast: PacketDSLAst;
  readonly width: number;
  readonly offset?: string;
}

const FIELD_RE =
  /^\[(\d+)(?::(\d+))?\]\s+([^@]+?)(?:\s+=\s+(\S+))?(?:\s+@(\S+))?(?:\s+role=(\S+))?\s*$/;

function sourcePosition(blockIndex: number, line: number): SourcePosition {
  return { line, column: 0, blockIndex };
}

function stripKindHeader(source: string): string {
  return source.replace(/^\s*register(?:map)?[ \t]*\r?\n/i, "");
}

function parseRange(range: string): { start: number; end: number } {
  const match = range.match(/^B(\d+)(?:-(\d+))?$/i);
  const start = Number(match?.[1] ?? 0);
  const end = match?.[2] ? Number(match[2]) : start;
  return { start, end };
}

function fillReservedGaps(
  fields: PacketFieldAst[],
  width: number,
  blockIndex: number,
  line: number,
): PacketFieldAst[] {
  const sorted = [...fields].sort(
    (a, b) => parseRange(a.range).start - parseRange(b.range).start,
  );
  const filled: PacketFieldAst[] = [];
  let next = 1;
  for (const field of sorted) {
    const { start, end } = parseRange(field.range);
    if (start > next) {
      filled.push({
        sourcePosition: sourcePosition(blockIndex, line),
        range: next === start - 1 ? `B${next}` : `B${next}-${start - 1}`,
        label: "Reserved",
        preset: "muted",
        role: "rsvd",
      });
    }
    filled.push(field);
    next = end + 1;
  }
  if (next <= width) {
    filled.push({
      sourcePosition: sourcePosition(blockIndex, line),
      range: next === width ? `B${next}` : `B${next}-${width}`,
      label: "Reserved",
      preset: "muted",
      role: "rsvd",
    });
  }
  return filled;
}

export function parseRegisterMapDSL(
  source: string,
  context: { readonly blockIndex?: number; readonly lineOffset?: number } = {},
): RegisterMapParseResult {
  const blockIndex = context.blockIndex ?? 0;
  const lineOffset = context.lineOffset ?? 1;
  const text = stripKindHeader(source);
  let title = "Register";
  let meta: string | undefined;
  let width = 32;
  let offset: string | undefined;
  const fields: PacketFieldAst[] = [];

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
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
    if (/^width\s*:/i.test(trimmed)) {
      width = Number(trimmed.replace(/^width\s*:/i, "").trim());
      continue;
    }
    if (/^offset\s*:/i.test(trimmed)) {
      offset = trimmed.replace(/^offset\s*:/i, "").trim();
      continue;
    }
    const match = trimmed.match(FIELD_RE);
    if (!match) {
      throw new WireglyphError(`registermap: invalid field line: ${trimmed}`, [
        {
          code: "WG_E_REGISTER_FIELD",
          severity: "error",
          message: `invalid field line: ${trimmed}`,
          line,
        },
      ]);
    }
    const msb = Number(match[1]);
    const lsb = match[2] !== undefined ? Number(match[2]) : msb;
    const hi = Math.max(msb, lsb);
    const lo = Math.min(msb, lsb);
    const label = (match[3] ?? "").trim();
    const value = match[4];
    const preset = match[5] ?? "data";
    const role = match[6] ?? "field";
    const start = width - hi;
    const end = width - lo;
    if (start < 1 || end > width) {
      throw new WireglyphError(
        `registermap: bit range [${hi}:${lo}] exceeds width ${width}`,
        [
          {
            code: "WG_E_REGISTER_RANGE",
            severity: "error",
            message: `bit range [${hi}:${lo}] exceeds width ${width}`,
            line,
          },
        ],
      );
    }
    const field: PacketFieldAst = {
      sourcePosition: sourcePosition(blockIndex, line),
      range: start === end ? `B${start}` : `B${start}-${end}`,
      label,
      preset,
      role,
    };
    if (value !== undefined) field.value = value;
    fields.push(field);
  }

  const filled = fillReservedGaps(fields, width, blockIndex, lineOffset);

  if (!Number.isInteger(width) || width <= 0) {
    throw new WireglyphError("registermap: width must be a positive integer", [
      { code: "WG_E_REGISTER_WIDTH", severity: "error", message: "invalid width" },
    ]);
  }
  if (fields.length === 0) {
    throw new WireglyphError("registermap: at least one field is required", [
      { code: "WG_E_REGISTER_EMPTY", severity: "error", message: "no fields" },
    ]);
  }

  const ast: PacketDSLAst = {
    blockIndex,
    sourcePosition: sourcePosition(blockIndex, lineOffset),
    title,
    cols: width,
    wrap: "none",
    ruler: "field",
    diagramRenderer: "svg-parity",
    fields: filled,
  };
  if (meta || offset) {
    ast.meta = [meta, offset ? `offset ${offset}` : undefined]
      .filter(Boolean)
      .join(" · ");
  }
  return { ast, width, offset };
}
