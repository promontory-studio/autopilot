import { describe, expect, it } from "vitest";
import { parseConfig, within } from "../src/config";

const minimal = JSON.stringify({ agentAuthor: "a[bot]" });

describe("parseConfig", () => {
  it("requires agentAuthor, because every default is 'allow'", () => {
    expect(() => parseConfig("{}")).toThrow(/agentAuthor/);
    expect(() => parseConfig(JSON.stringify({ agentAuthor: "" }))).toThrow(/agentAuthor/);
  });

  it("fills the rest with defaults", () => {
    expect(parseConfig(minimal)).toMatchObject({ botAuthor: "dependabot[bot]", maxLines: 400, forbidden: [], apps: [] });
  });

  it("requires a path and a runner for each app", () => {
    expect(() => parseConfig(JSON.stringify({ agentAuthor: "a", apps: [{ run: ["x"] }] }))).toThrow(/apps\[0\]\.path/);
    expect(() => parseConfig(JSON.stringify({ agentAuthor: "a", apps: [{ path: "p" }] }))).toThrow(/apps\[0\]\.run/);
  });

  it("strips a trailing slash so app-relative globs do not double it", () => {
    const [app] = parseConfig(JSON.stringify({ agentAuthor: "a", apps: [{ path: "apps/x/", run: ["t"] }] })).apps;
    expect(app!.path).toBe("apps/x");
    expect(within(app!, ["tests/**"])).toEqual(["apps/x/tests/**"]);
  });

  it("reads an empty or dotted path as the repository root, so a single-package repo is one app", () => {
    const apps = parseConfig(JSON.stringify({ agentAuthor: "a", apps: [{ path: "", run: ["t"] }, { path: ".", run: ["t"] }] })).apps;
    expect(apps.map((a) => a.path)).toEqual(["", ""]);
    expect(within(apps[0]!, ["tests/**"])).toEqual(["tests/**"]);
  });

  it("refuses a config that is not JSON rather than falling back to permissive defaults", () => {
    expect(() => parseConfig("not json")).toThrow();
  });
});
