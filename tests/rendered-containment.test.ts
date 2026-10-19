import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { renderPacketSVG, renderRegisterMapSVG } from "../src/index.ts";
import { findBrowserExecutable } from "./support/browser.ts";

const root = dirname(fileURLToPath(import.meta.url));
const browserPath = findBrowserExecutable();

/**
 * Rendered-geometry containment probe.
 *
 * The estimate-based tests can only prove what the estimator believes. This
 * one compares the boxes the engine actually paints: every field label, size
 * caption, and value must stay inside its own cell, and two runs on the same
 * baseline must not touch.
 */
const PROBE = `
(() => {
  const svgEl = document.querySelector("svg");
  const bbox = (el) => el.getBBox();
  const texts = [...svgEl.querySelectorAll("text")].map((el) => {
    const b = bbox(el);
    return { text: el.textContent || "", x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const rects = [...svgEl.querySelectorAll("rect")].map((el) => {
    const b = bbox(el);
    return { x: b.x, y: b.y, w: b.width, h: b.height, fill: el.getAttribute("fill") || "" };
  });
  const cells = rects.filter((r) => r.fill === "#f4f5f7");
  const centreY = (t) => t.y + t.h / 2;
  const outside = [];
  for (const t of texts) {
    if (!t.text.trim()) continue;
    const host = cells.find(
      (c) => centreY(t) >= c.y && centreY(t) <= c.y + c.h && t.x + t.w / 2 >= c.x && t.x + t.w / 2 <= c.x + c.w,
    );
    if (!host) continue;
    if (t.x < host.x - 0.5 || t.x + t.w > host.x + host.w + 0.5) {
      outside.push(t.text + " " + t.x.toFixed(1) + ".." + (t.x + t.w).toFixed(1) + " cell " + host.x.toFixed(1) + ".." + (host.x + host.w).toFixed(1));
    }
  }
  const lines = new Map();
  for (const t of texts) {
    if (!t.text.trim()) continue;
    const key = Math.round(centreY(t) / 4) * 4;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(t);
  }
  const overlaps = [];
  for (const group of lines.values()) {
    group.sort((a, b) => a.x - b.x);
    for (let i = 1; i < group.length; i += 1) {
      const a = group[i - 1];
      const b = group[i];
      const gap = b.x - (a.x + a.w);
      if (gap < -0.5) overlaps.push(a.text + " n " + b.text + " " + (-gap).toFixed(1));
    }
  }
  const viewBox = svgEl.getAttribute("viewBox").split(/\\s+/).map(Number);
  const clipped = texts
    .filter((t) => t.text.trim())
    .filter((t) => t.x < viewBox[0] - 0.5 || t.x + t.w > viewBox[0] + viewBox[2] + 0.5 || t.y < viewBox[1] - 0.5 || t.y + t.h > viewBox[1] + viewBox[3] + 0.5)
    .map((t) => t.text);
  return { outside, overlaps, clipped };
})()
`;

type ProbeResult = {
  outside: string[];
  overlaps: string[];
  clipped: string[];
};

const cases: { label: string; svg: string }[] = [
  ...readdirSync(join(root, "../examples/register"))
    .filter((name) => name.endsWith(".register"))
    .sort()
    .map((name) => ({
      label: `register/${name}`,
      svg: renderRegisterMapSVG(
        readFileSync(join(root, "../examples/register", name), "utf8"),
        { standalone: true },
      ),
    })),
  ...readdirSync(join(root, "../examples/packet"))
    .filter((name) => name.endsWith(".packet"))
    .sort()
    .map((name) => ({
      label: `packet/${name}`,
      svg: renderPacketSVG(
        readFileSync(join(root, "../examples/packet", name), "utf8"),
        { standalone: true, paginate: false },
      ),
    })),
];

describe.skipIf(!browserPath)("rendered text containment", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: browserPath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const testCase of cases) {
    test(`${testCase.label} keeps every run inside its cell`, async () => {
      await page.setContent(
        `<html><body style="margin:0">${testCase.svg}</body></html>`,
      );
      const result = (await page.evaluate(PROBE)) as ProbeResult;
      expect(result.outside, result.outside.join("; ")).toEqual([]);
      expect(result.overlaps, result.overlaps.join("; ")).toEqual([]);
      expect(result.clipped, result.clipped.join("; ")).toEqual([]);
    });
  }
});

if (!browserPath) {
  test.skip("rendered text containment requires a Chromium browser", () => {});
}
