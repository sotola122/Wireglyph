// parser.ts — Packet DSL fence extraction and AST parser
//
// Exports:
//   extractPacketBlocks(markdown) — low-level fence extraction
//   parsePacketDsl(dslText, blockIndex, lineOffset) — DSL text → AST
//   parsePacketBlocks(markdown) — combined extract + parse

import type {
  PacketDSLAst,
  PacketFieldAst,
  PacketBitAst,
  PacketDslDiagnostic,
} from "../ast/packet.ts";
import { makeError, DiagnosticCodes } from "../diagnostics.ts";

// === Local Types ===

export interface PacketBlock {
  /** 0-based block index in the source document */
  blockIndex: number;
  /** 1-based line number of the opening fence */
  lineStart: number;
  /** 1-based line number of the closing fence */
  lineEnd: number;
  /** Opening fence line text (e.g. "```packet") */
  rawFence: string;
  /** Content between fences (excluding fence markers) */
  dslText: string;
}

export interface PacketParseResult {
  blocks: PacketBlock[];
  asts: PacketDSLAst[];
  diagnostics: PacketDslDiagnostic[];
}

// === Constants ===

/** Matches opening ```packet fence — NOT ```packet-table or ```packet-something */
const PACKET_FENCE_REGEX = /^```packet[ \t]*$/gm;

/** Matches closing ``` fence */
const CLOSING_FENCE_REGEX = /^```[ \t]*$/gm;

/** Known top-level DSL keys (order-independent) */
const TOP_LEVEL_KEYS = new Set([
  "title",
  "meta",
  "cols",
  "wrap",
  "ruler",
  "presets",
  "diagramRenderer",
]);

// === Low-Level Fence Extraction ===

export function extractPacketBlocks(markdown: string): PacketBlock[] {
  const blocks: PacketBlock[] = [];
  let blockIndex = 0;
  let searchStart = 0;

  while (searchStart < markdown.length) {
    PACKET_FENCE_REGEX.lastIndex = searchStart;
    const openMatch = PACKET_FENCE_REGEX.exec(markdown);
    if (!openMatch) break;

    const fenceStart = openMatch.index;
    const beforeFence = markdown.substring(0, fenceStart);
    const lineStart = beforeFence.split("\n").length; // 1-based

    const afterOpen = fenceStart + openMatch[0].length;

    // Find the closing ``` fence
    CLOSING_FENCE_REGEX.lastIndex = afterOpen;
    const closeMatch = CLOSING_FENCE_REGEX.exec(markdown);
    if (!closeMatch) break; // unclosed fence — stop

    const fenceEnd = closeMatch.index + closeMatch[0].length;
    const beforeClose = markdown.substring(0, fenceEnd);
    const lineEnd = beforeClose.split("\n").length; // 1-based

    const rawFence = markdown.substring(fenceStart, closeMatch.index).trimEnd();
    const dslText = markdown.substring(afterOpen, closeMatch.index).trim();

    blocks.push({
      blockIndex,
      lineStart,
      lineEnd,
      rawFence,
      dslText,
    });

    blockIndex++;
    searchStart = fenceEnd;
  }

  return blocks;
}

// === DSL Text → AST ===

export function parsePacketDsl(
  dslText: string,
  blockIndex: number,
  lineOffset: number,
  diagnostics?: PacketDslDiagnostic[],
): PacketDSLAst {
  const lines = dslText.split("\n");
  const fields: PacketFieldAst[] = [];

  // -- First pass: identify top-level key lines --
  const isTopLevelLine = new Array<boolean>(lines.length).fill(false);
  const topLevel: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;

    const key = trimmed.substring(0, colonIdx).trim();
    if (TOP_LEVEL_KEYS.has(key)) {
      topLevel[key] = trimmed.substring(colonIdx + 1).trim();
      isTopLevelLine[i] = true;
    }
  }

  // -- Second pass: state-machine over remaining lines --
  //
  // Indentation rules:
  //   0 spaces   → field line (or top-level, already consumed)
  //   2+ spaces  → field child (bitsView, detailPlacement, …)
  //   Inside bits: marker, 4+ spaces → bit entry (b7: …)
  //
  let currentField: PacketFieldAst | null = null;
  let inBits = false;

  for (let i = 0; i < lines.length; i++) {
    if (isTopLevelLine[i]) continue;

    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    const indent = raw.length - raw.trimStart().length;

    // -- Non-indented lines → field line --
    if (indent < 2) {
      inBits = false;
      currentField = parseFieldLine(trimmed, blockIndex, lineOffset + i);
      fields.push(currentField);
      continue;
    }

    // -- Indented lines (field children) --
    if (!currentField) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue; // malformed child, skip

    const key = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim();

    if (inBits) {
      // Bit entry under bits:
      const bit = parseBitEntry(trimmed, blockIndex, lineOffset + i);
      if (!currentField.bits) currentField.bits = [];
      currentField.bits.push(bit);
      continue;
    }

    // bits: marker → enter bit-entry mode
    if (key === "bits") {
      inBits = true;
      continue;
    }

    // Regular field child key — returns false if unknown
    const recognized = applyFieldChild(currentField, key, value);
    if (!recognized && diagnostics) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.UNKNOWN_FIELD_KEY,
          blockIndex,
          lineOffset + i,
          `Unknown field key: ${key}`,
        ),
      );
    }
  }

  // -- Build AST node --
  const ast: PacketDSLAst = {
    blockIndex,
    sourcePosition: { line: lineOffset, column: 0, blockIndex },
    title: topLevel["title"] ?? "",
    cols: topLevel["cols"] ? Number(topLevel["cols"]) : 0,
    fields,
  };

  if (topLevel["meta"] !== undefined) {
    ast.meta = topLevel["meta"];
  }
  if (topLevel["wrap"] !== undefined) {
    ast.wrap = topLevel["wrap"] === "none" ? "none" : Number(topLevel["wrap"]);
  }
  if (topLevel["ruler"] !== undefined) {
    ast.ruler = topLevel["ruler"] as "field" | "byte" | "none";
  }
  if (topLevel["diagramRenderer"] !== undefined) {
    ast.diagramRenderer = topLevel["diagramRenderer"];
  }
  // presets: deferred to validator/normalizer

  return ast;
}

// === Combined Entry-Point ===

export function parsePacketBlocks(markdown: string): PacketParseResult {
  const blocks = extractPacketBlocks(markdown);
  const asts: PacketDSLAst[] = [];
  const diagnostics: PacketDslDiagnostic[] = [];

  for (const block of blocks) {
    const ast = parsePacketDsl(
      block.dslText,
      block.blockIndex,
      block.lineStart + 1,
      diagnostics,
    );
    asts.push(ast);
  }

  return { blocks, asts, diagnostics };
}

// === Field Line Parser ===

/**
 * Parse a single field line of the form:
 *   Range: Label [= Value] @Preset role=Role
 *
 * Range examples: B1, B2-17, Byte1, Byte2-17
 */
function parseFieldLine(
  trimmed: string,
  blockIndex: number,
  lineNumber: number,
): PacketFieldAst {
  const firstColon = trimmed.indexOf(":");
  const range =
    firstColon >= 0 ? trimmed.substring(0, firstColon).trim() : trimmed;
  const rest = firstColon >= 0 ? trimmed.substring(firstColon + 1).trim() : "";

  let label = "";
  let value: string | undefined;
  let preset = "";
  let role = "";

  if (rest) {
    // Split on ' @' to separate label+value from preset+role
    const atIdx = rest.indexOf(" @");
    if (atIdx >= 0) {
      const labelValuePart = rest.substring(0, atIdx).trim();
      const presetRolePart = rest.substring(atIdx + 2).trim();

      // Parse optional = Value
      const eqIdx = labelValuePart.indexOf(" = ");
      if (eqIdx >= 0) {
        label = labelValuePart.substring(0, eqIdx).trim();
        value = labelValuePart.substring(eqIdx + 3).trim();
      } else {
        label = labelValuePart;
      }

      // Parse preset and role
      const roleIdx = presetRolePart.indexOf("role=");
      if (roleIdx >= 0) {
        preset = presetRolePart.substring(0, roleIdx).trim();
        role = presetRolePart.substring(roleIdx + 5).trim();
      } else {
        preset = presetRolePart;
      }
    } else {
      // No @ — just label and optional value
      const eqIdx = rest.indexOf(" = ");
      if (eqIdx >= 0) {
        label = rest.substring(0, eqIdx).trim();
        value = rest.substring(eqIdx + 3).trim();
      } else {
        label = rest;
      }
    }
  }

  const field: PacketFieldAst = {
    sourcePosition: { line: lineNumber, column: 0, blockIndex },
    range,
    label,
    preset,
    role,
  };
  if (value !== undefined) field.value = value;

  return field;
}

// === Bit Entry Parser ===

/**
 * Parse a single bit entry line of the form:
 *   b7: Label @preset role=role
 *
 * Bit range examples: b7, b0, bit[15-1], bit[0], B15.b7-B16.b1
 */
function parseBitEntry(
  trimmed: string,
  blockIndex: number,
  lineNumber: number,
): PacketBitAst {
  const firstColon = trimmed.indexOf(":");
  const bitRange =
    firstColon >= 0 ? trimmed.substring(0, firstColon).trim() : trimmed;
  const rest = firstColon >= 0 ? trimmed.substring(firstColon + 1).trim() : "";

  let label = "";
  let value: string | undefined;
  let preset = "";
  let role = "";

  if (rest) {
    const atIdx = rest.indexOf(" @");
    if (atIdx >= 0) {
      let labelValuePart = rest.substring(0, atIdx).trim();
      const presetRolePart = rest.substring(atIdx + 2).trim();

      // Split optional = Value from label
      const eqIdx = labelValuePart.indexOf(" = ");
      if (eqIdx >= 0) {
        label = labelValuePart.substring(0, eqIdx).trim();
        value = labelValuePart.substring(eqIdx + 3).trim();
      } else {
        label = labelValuePart;
      }

      const roleIdx = presetRolePart.indexOf("role=");
      if (roleIdx >= 0) {
        preset = presetRolePart.substring(0, roleIdx).trim();
        role = presetRolePart.substring(roleIdx + 5).trim();
      } else {
        preset = presetRolePart;
      }
    } else {
      const eqIdx = rest.indexOf(" = ");
      if (eqIdx >= 0) {
        label = rest.substring(0, eqIdx).trim();
        value = rest.substring(eqIdx + 3).trim();
      } else {
        label = rest;
      }
    }
  }

  const result: PacketBitAst = {
    sourcePosition: { line: lineNumber, column: 0, blockIndex },
    bitRange,
    label,
    preset,
    role,
  };
  if (value !== undefined) result.value = value;

  return result;
}

// === Field Child Key Applier ===

/**
 * Apply a recognized child key/value to a PacketFieldAst.
 * Returns true if the key was recognized, false if unknown.
 */
function applyFieldChild(
  field: PacketFieldAst,
  key: string,
  value: string,
): boolean {
  switch (key) {
    case "bitsView":
      field.bitsView = value as
        | "compact"
        | "detail"
        | "stack"
        | "grid"
        | "none";
      return true;
    case "detailPlacement":
      field.detailPlacement = value as "below";
      return true;
    case "detailRange":
      field.detailRange = value;
      return true;
    case "connector":
      field.connector = value as "dotted" | "dashed" | "none";
      return true;
    case "bitsColumns":
      field.bitsColumns = Number(value);
      return true;
    case "bitOrder":
      field.bitOrder = value as "msb0" | "lsb0";
      return true;
    // bits: is handled separately in the state machine
    default:
      return false;
  }
}
