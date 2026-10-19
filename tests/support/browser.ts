import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((value): value is string => typeof value === "string" && value.length > 0);

/**
 * Path to a Chromium-based browser, or undefined when the environment has none.
 *
 * The text-containment regression measures rendered glyph boxes with
 * `getBBox()`, which needs a real layout engine. Tests that use this skip when
 * no browser is installed instead of failing on a missing host dependency; the
 * estimate-based tests in the same area still run everywhere.
 */
export function findBrowserExecutable(): string | undefined {
  return CANDIDATES.find((candidate) => existsSync(candidate));
}
