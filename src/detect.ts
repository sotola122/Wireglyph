export type WireglyphKind = "packet" | "registermap" | "memorymap";

function firstKeywordLine(text: string): string {
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("%%")) continue;
    return trimmed;
  }
  return "";
}

export function detectWireglyphKind(text: string): WireglyphKind | null {
  const first = firstKeywordLine(text);
  const lower = first.toLowerCase();
  if (/^register(map)?(\s|$)/.test(lower)) return "registermap";
  if (/^memory[-_]?map(\s|$)/.test(lower)) return "memorymap";
  if (/^packet-beta(\s|$)/.test(lower)) return "packet";
  if (/^packet(\s|$)/.test(lower)) return "packet";
  if (/^\[0x[0-9a-f]+/i.test(first) || /^0x[0-9a-f]+\s*-/i.test(first)) {
    return "memorymap";
  }
  if (/^\[\d+(?::\d+)?\]/.test(first)) return "registermap";
  if (
    /^(title|cols|wrap|ruler)\s*:/i.test(first) ||
    /^(?:B|Byte)\d+/i.test(first)
  ) {
    return "packet";
  }
  return null;
}
