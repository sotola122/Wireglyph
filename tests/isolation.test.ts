import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

describe("wireglyph bundle isolation", () => {
  test("source tree does not import elkjs or mermaid packages", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".ts")) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/elkjs/);
      expect(source, file).not.toMatch(/beautiful-mermaid/);
      expect(source, file).not.toMatch(/from ["']yoga/);
    }
  });

  test("dist does not import elkjs when built", () => {
    const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
    let source = "";
    try {
      source = readFileSync(dist, "utf8");
    } catch {
      source = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../src/index.ts"),
        "utf8",
      );
    }
    expect(source).not.toMatch(/elkjs/);
    expect(source).not.toMatch(/from ["']\.\.\/index/);
  });
});
