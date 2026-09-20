import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny } from "../src/glob";

describe("globToRegExp", () => {
  it("stops a single star at a separator", () => {
    expect(globToRegExp("apps/*/wrangler.jsonc").test("apps/one/wrangler.jsonc")).toBe(true);
    expect(globToRegExp("apps/*/wrangler.jsonc").test("apps/one/two/wrangler.jsonc")).toBe(false);
  });

  it("crosses separators with a double star, including zero of them", () => {
    expect(globToRegExp("apps/**/migrations/*").test("apps/one/two/migrations/001.sql")).toBe(true);
    expect(globToRegExp("apps/**/migrations/*").test("apps/migrations/001.sql")).toBe(true);
  });

  it("treats a dot as a literal, not as any character", () => {
    expect(globToRegExp("*.jsonc").test("wrangler.jsonc")).toBe(true);
    expect(globToRegExp("*.jsonc").test("wranglerXjsonc")).toBe(false);
  });

  it("anchors, so a pattern does not match a longer path that merely contains it", () => {
    expect(globToRegExp("src/index.ts").test("other/src/index.ts")).toBe(false);
  });

  it("matches one non-separator character with a question mark", () => {
    expect(globToRegExp("v?.yml").test("v1.yml")).toBe(true);
    expect(globToRegExp("v?.yml").test("v12.yml")).toBe(false);
  });

  it("reports whether any pattern in a list matches", () => {
    expect(matchesAny("docs/a.md", ["src/**", "docs/*.md"])).toBe(true);
    expect(matchesAny("docs/a.md", ["src/**"])).toBe(false);
  });
});
