// normalizer.ts — Packet DSL normalizer
//
// Converts a validated AST into a normalized model with line-groups,
// details, bits, and logical anchors (no absolute coordinates).

import type {
  PacketDSLAst,
  NormalizedPacket,
  NormalizedLineGroup,
  NormalizedField,
  NormalizedDetail,
  NormalizedBit,
  NormalizedConnector,
  ByteRange,
  PacketDslDiagnostic,
  PacketFieldAst,
  PacketPreset,
} from "../ast/packet.ts";
import { makeWarning, DiagnosticCodes } from "../diagnostics.ts";

const STANDARD_PRESETS: Record<string, PacketPreset> = {
  accent: { fill: "#e3f2fd", stroke: "#1976d2", text: "#0d47a1" },
  data: { fill: "#f5f5f5", stroke: "#616161", text: "#212121" },
  muted: { fill: "#fafafa", stroke: "#bdbdbd", text: "#757575" },
  fixed: { fill: "#fff8e1", stroke: "#f9a825", text: "#e65100" },
  note: { fill: "#e8f5e9", stroke: "#388e3c", text: "#1b5e20" },
  warn: { fill: "#fff3e0", stroke: "#f57c00", text: "#bf360c" },
  error: { fill: "#fce4ec", stroke: "#d32f2f", text: "#c62828" },
  blank: { fill: "#ffffff", stroke: "#e0e0e0", text: "#212121" },
};

/**
 * Convert a validated Packet DSL AST into a normalized model.
 *
 * The normalizer resolves byte ranges, segments fields into line-groups
 * based on `wrap`, assigns detail panels to the same line-group as their
 * source field, normalizes bit entries, creates connector metadata, and
 * resolves preset tokens. No absolute coordinates are calculated.
 *
 * Warnings (e.g. long labels) are appended to the supplied diagnostics array.
 */
export function normalizePacket(
  ast: PacketDSLAst,
  diagnostics: PacketDslDiagnostic[],
): NormalizedPacket {
  const blockIndex = ast.blockIndex;

  const parsedFields = ast.fields.map((field) => ({
    field,
    byteRange: parseByteRangeStrict(field.range),
  }));

  const normalizedFields: NormalizedField[] = parsedFields.map((pf) => ({
    sourceField: pf.field,
    byteRange: pf.byteRange,
    size: pf.byteRange.end - pf.byteRange.start + 1,
    label: pf.field.label,
    value: pf.field.value,
    presetName: pf.field.preset,
  }));

  const lineGroups = buildLineGroups(ast, normalizedFields);
  assignDetails(ast, normalizedFields, lineGroups);

  const presets = resolvePresets(ast);

  for (const field of ast.fields) {
    if (field.label.length > 30) {
      diagnostics.push(
        makeWarning(
          DiagnosticCodes.LONG_LABEL,
          blockIndex,
          field.sourcePosition.line,
          `Field label "${field.label}" exceeds recommended 30 character limit (${field.label.length} chars)`,
        ),
      );
    }
  }

  return {
    ast,
    byteRanges: normalizedFields,
    lineGroups,
    presets,
  };
}

function parseByteRangeStrict(range: string): ByteRange {
  const match = range.match(/^(?:B|Byte)(\d+)(?:-(\d+))?$/i);
  const start = parseInt(match![1], 10);
  const end = match![2] ? parseInt(match![2], 10) : start;
  return { start, end };
}

function buildLineGroups(
  ast: PacketDSLAst,
  normalizedFields: NormalizedField[],
): NormalizedLineGroup[] {
  if (ast.wrap === "none" || ast.wrap === undefined) {
    return [
      {
        lineRange: `B1-${ast.cols}`,
        byteRange: { start: 1, end: ast.cols },
        fields: [...normalizedFields],
        details: [],
      },
    ];
  }

  const wrap = ast.wrap as number;
  const numGroups = Math.ceil(ast.cols / wrap);
  const groups: NormalizedLineGroup[] = [];

  for (let i = 0; i < numGroups; i++) {
    const groupStart = i * wrap + 1;
    const groupEnd = Math.min((i + 1) * wrap, ast.cols);
    const lineRange = `B${groupStart}-${groupEnd}`;

    const groupFields = normalizedFields.filter((nf) =>
      rangesOverlap(nf.byteRange, { start: groupStart, end: groupEnd }),
    );

    groups.push({
      lineRange,
      byteRange: { start: groupStart, end: groupEnd },
      fields: groupFields,
      details: [],
    });
  }

  return groups;
}

function assignDetails(
  ast: PacketDSLAst,
  normalizedFields: NormalizedField[],
  lineGroups: NormalizedLineGroup[],
): void {
  for (let i = 0; i < ast.fields.length; i++) {
    const field = ast.fields[i];
    const nf = normalizedFields[i];

    // bitsView none または bits なし → detail を生成しない
    if (!field.bits || field.bits.length === 0 || field.bitsView === "none")
      continue;

    const detailRange = field.detailRange ?? field.range;

    const groupIndex = lineGroups.findIndex((lg) =>
      rangesOverlap(nf.byteRange, lg.byteRange),
    );

    if (groupIndex === -1) continue;

    const bits = normalizeBits(field);

    const kind: "detail" | "stack" | "grid" =
      field.bitsView === "detail" ||
      field.bitsView === "stack" ||
      field.bitsView === "grid"
        ? field.bitsView
        : "detail";

    const detail: NormalizedDetail = {
      sourceRange: field.range,
      detailRange,
      fields: [],
      bits,
      kind,
    };

    lineGroups[groupIndex].details.push(detail);

    if (field.connector && field.connector !== "none") {
      lineGroups[groupIndex].connector = {
        sourceRange: field.range,
        kind: field.connector as "dotted" | "dashed",
      };
    }
  }
}

function normalizeBits(field: PacketFieldAst): NormalizedBit[] {
  if (!field.bits) return [];

  return field.bits.map((bit) => ({
    bitLabel: bit.bitRange,
    width: parseBitWidth(bit.bitRange),
    label: bit.label,
    value: bit.value,
    role: bit.role,
    presetName: bit.preset,
  }));
}

/**
 * Parse a bit range string to determine its width in bits.
 *
 * - "b7" → width=1 (single bit)
 * - "b0-b3" / "b0-3" → width=4
 * - "bit[15-1]" → width=15 (|15-1| + 1)
 * - "bit[0]" → width=1 (single bit)
 * Cross-byte forms keep no numeric width.
 */
function parseBitWidth(bitRange: string): number | undefined {
  const rangeMatch = bitRange.match(/^bit\[(\d+)-(\d+)\]$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return Math.abs(start - end) + 1;
  }
  if (/^bit\[\d+\]$/.test(bitRange)) return 1;
  const local = bitRange.match(/^b(\d+)(?:-b?(\d+))?$/i);
  if (local) {
    if (local[2] === undefined) return 1;
    return Math.abs(parseInt(local[1], 10) - parseInt(local[2], 10)) + 1;
  }
  return undefined;
}

function resolvePresets(ast: PacketDSLAst): Record<string, PacketPreset> {
  if (ast.presets && Object.keys(ast.presets).length > 0) {
    return { ...STANDARD_PRESETS, ...ast.presets };
  }
  return { ...STANDARD_PRESETS };
}

function rangesOverlap(a: ByteRange, b: ByteRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}
