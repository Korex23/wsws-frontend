import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The trade client sits in the first-load payload of /meme and /spot, which
// carry a 1650 kB budget (scripts/first-load-budget.json). Its response
// mappers run the route schemas through zod, and a static import put zod and
// every schema into that payload: /meme went 1648 → 1714 kB and failed CI.
// The mappers are loaded when a trade request runs, never on first paint.
const source = readFileSync(resolve(__dirname, "api.ts"), "utf8");

describe("lib/meme/api.ts first-load weight", () => {
  it("does not statically import the zod-backed response mappers", () => {
    expect(source).not.toMatch(/^import\s+\{[^}]*\}\s+from\s+"@\/lib\/meme\/parse";?$/m);
    expect(source).not.toMatch(/^import\s+[^"]*from\s+"zod";?$/m);
    expect(source).not.toMatch(/^import\s+(?!type\b)[^"]*from\s+"@\/lib\/api\/schemas\/trade";?$/m);
  });

  it("loads the mappers on demand", () => {
    expect(source).toMatch(/await import\("@\/lib\/meme\/parse"\)/);
  });
});
