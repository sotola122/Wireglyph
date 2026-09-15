// normalized-adapter.ts — Convert NormalizedPacket to NormalizedPacketDiagram

import type { NormalizedPacket } from "../ast/packet.ts";
import type {
  NormalizedPacketDiagram,
  NormalizedPacketField,
  NormalizedPacketDetail,
  NormalizedPacketBit,
  ByteRange,
  BitsView,
  ConnectorKind,
  PresetName,
} from "../model/packet-diagram.ts";

function parseByteRange(range: string): ByteRange {
  const match = range.match(/^(?:B|Byte)(\d+)(?:-(\d+))?$/i);
  if (!match) {
    throw new Error(`Invalid byte range "${range}"`);
  }
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  return { start, end };
}

function toBitsView(kind: string | undefined): BitsView {
  if (kind === "detail" || kind === "stack" || kind === "grid") return kind;
  return "detail";
}

function toConnectorKind(kind: string | undefined): ConnectorKind {
  if (kind === "dotted" || kind === "dashed") return kind;
  return "none";
}

function toPresetName(presetName: string): PresetName {
  const validPresets: PresetName[] = [
    "accent",
    "data",
    "muted",
    "fixed",
    "note",
    "warn",
    "error",
    "blank",
  ];
  if (validPresets.includes(presetName as PresetName)) {
    return presetName as PresetName;
  }
  return "data";
}

function buildConnectorMap(
  normalized: NormalizedPacket,
): Map<string, ConnectorKind> {
  const map = new Map<string, ConnectorKind>();
  for (const lg of normalized.lineGroups) {
    if (lg.connector) {
      map.set(lg.connector.sourceRange, lg.connector.kind);
    }
  }
  return map;
}

function buildDetailMap(normalized: NormalizedPacket): Map<
  string,
  {
    detailRange: string;
    kind: string;
    bits: NormalizedPacket["lineGroups"][0]["details"][0]["bits"];
  }
> {
  const map = new Map<
    string,
    {
      detailRange: string;
      kind: string;
      bits: NormalizedPacket["lineGroups"][0]["details"][0]["bits"];
    }
  >();
  for (const lg of normalized.lineGroups) {
    for (const detail of lg.details) {
      map.set(detail.sourceRange, {
        detailRange: detail.detailRange,
        kind: detail.kind,
        bits: detail.bits,
      });
    }
  }
  return map;
}

function bitSortKey(range: string): { byte: number; bit: number } | null {
  const qualified = range.match(/^B(\d+)\.b(\d+)/i);
  if (qualified) {
    return { byte: Number(qualified[1]), bit: Number(qualified[2]) };
  }
  const indexed = range.match(/^bit\[(\d+)/i);
  if (indexed) {
    return { byte: 0, bit: Number(indexed[1]) };
  }
  const local = range.match(/^b(\d+)/i);
  if (local) {
    return { byte: 0, bit: Number(local[1]) };
  }
  return null;
}

function orderBits(
  bits: NormalizedPacketBit[],
  bitOrder?: "msb0" | "lsb0",
): NormalizedPacketBit[] {
  if (!bitOrder) return bits;
  const keyed = bits.map((bit) => ({ bit, key: bitSortKey(bit.range) }));
  if (keyed.some((entry) => entry.key === null)) return bits;
  const domains = new Set(keyed.map((entry) => (entry.key!.byte > 0 ? "qualified" : "local")));
  if (domains.size > 1) return bits;
  const sign = bitOrder === "lsb0" ? 1 : -1;
  return [...keyed]
    .sort((a, b) => {
      const left = a.key!;
      const right = b.key!;
      if (left.byte !== right.byte) return sign * (left.byte - right.byte);
      return sign * (left.bit - right.bit);
    })
    .map((entry) => entry.bit);
}

function adaptBit(
  bit: NormalizedPacket["lineGroups"][0]["details"][0]["bits"][0],
): NormalizedPacketBit {
  return {
    range: bit.bitLabel,
    label: bit.label,
    value: bit.value,
    preset: toPresetName(bit.presetName),
    role: bit.role ?? "",
    widthLabel:
      typeof bit.width === "number" && bit.width > 1
        ? `${bit.width}bit`
        : undefined,
  };
}

export function adaptToNormalizedPacketDiagram(
  normalized: NormalizedPacket,
): NormalizedPacketDiagram {
  const { ast } = normalized;
  const connectorMap = buildConnectorMap(normalized);
  const detailMap = buildDetailMap(normalized);

  const fields: NormalizedPacketField[] = [];

  for (const field of ast.fields) {
    const range = parseByteRange(field.range);
    const detailEntry = detailMap.get(field.range);
    let detail: NormalizedPacketDetail | undefined;

    if (detailEntry) {
      detail = {
        bitsView: toBitsView(detailEntry.kind),
        detailRange: parseByteRange(detailEntry.detailRange),
        connector: toConnectorKind(
          connectorMap.get(field.range) ?? field.connector,
        ),
        bits: orderBits(detailEntry.bits.map(adaptBit), field.bitOrder),
        bitsColumns: field.bitsColumns,
        bitOrder: field.bitOrder,
      };
    }

    fields.push({
      range,
      label: field.label,
      value: field.value,
      preset: toPresetName(field.preset),
      role: field.role,
      detail,
    });
  }

  return {
    title: ast.title,
    meta: ast.meta,
    cols: ast.cols,
    wrap: ast.wrap,
    ruler: ast.ruler as "field" | "byte" | "none" | undefined,
    diagramRenderer:
      ast.diagramRenderer === "svg-parity" ? "svg-parity" : undefined,
    fields,
  };
}
