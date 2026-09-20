import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { type Change, testsToProve, violations } from "../src/guard";

// A synthetic repository shape. Nothing here names a real project, because a fixture that needs
// one repository's directory layout is that repository's knowledge hiding in a test suite.
const config = parseConfig(
  JSON.stringify({
    agentAuthor: "agent[bot]",
    botAuthor: "bumper[bot]",
    maxLines: 400,
    forbidden: ["apps/*/deploy.jsonc", "apps/*/migrations/**"],
    apps: [{ path: "apps/one", tests: ["tests/**/*.test.ts"], unitTests: ["tests/unit/**/*.test.ts"], run: ["npx", "vitest", "run"] }],
  }),
);

const change = (over: Partial<Change> = {}): Change => ({
  author: "agent[bot]",
  status: "M",
  path: "apps/one/src/a.ts",
  added: 1,
  removed: 0,
  addedLines: [],
  ...over,
});

// The green baseline every case below is measured against: an ordinary fix plus the unit test
// that proves it. If this ever fails, the reds below prove nothing.
const fix = [change(), change({ status: "A", path: "apps/one/tests/unit/a.test.ts" })];

describe("violations", () => {
  it("passes a fix that brings its own unit test", () => {
    expect(violations(fix, config)).toEqual([]);
  });

  it("stops the agent editing a caller-forbidden path", () => {
    expect(violations([...fix, change({ path: "apps/one/deploy.jsonc" })], config)).toEqual(["agent[bot] may not touch apps/one/deploy.jsonc"]);
    expect(violations([...fix, change({ path: "apps/one/migrations/001.sql" })], config)).toEqual([
      "agent[bot] may not touch apps/one/migrations/001.sql",
    ]);
  });

  it("stops the agent editing what is forbidden everywhere, whatever the config says", () => {
    expect(violations([...fix, change({ path: ".github/workflows/ci.yml" })], config)).toContain("agent[bot] may not touch .github/workflows/ci.yml");
    expect(violations([...fix, change({ path: "package.json" })], config)).toContain("agent[bot] may not touch package.json");
  });

  it("holds the bot to manifests and workflow pins", () => {
    const bump = change({ author: "bumper[bot]", path: "package-lock.json" });
    expect(violations([bump], config)).toEqual([]);
    expect(violations([bump, change({ author: "bumper[bot]", path: "apps/one/src/a.ts" })], config)).toEqual([
      "bumper[bot] may not touch apps/one/src/a.ts",
    ]);
  });

  it("stops the agent deleting, shrinking or weakening a test", () => {
    expect(violations([...fix, change({ status: "D", path: "apps/one/tests/unit/b.test.ts" })], config)).toContain(
      "apps/one/tests/unit/b.test.ts: deletes a test file",
    );
    expect(violations([...fix, change({ path: "apps/one/tests/unit/b.test.ts", removed: 7 })], config)).toContain(
      "apps/one/tests/unit/b.test.ts: removes 7 existing test lines",
    );
    expect(
      violations([...fix, change({ path: "apps/one/tests/unit/b.test.ts", addedLines: ["  it.skip('x', () => {})"] })], config),
    ).toContain("apps/one/tests/unit/b.test.ts: adds it.skip('x', () => {})");
  });

  it("caps the agent's diff", () => {
    // `fix` is 2 lines, so these land on either side of the cap rather than near it.
    expect(violations([...fix, change({ added: 300, removed: 99 })], config)).toContain("agent diff is 401 lines (cap 400)");
    expect(violations([...fix, change({ added: 300, removed: 98 })], config)).toEqual([]);
  });

  it("requires a unit test of an agent fix, but not of a dependency repair", () => {
    expect(violations([change()], config)).toEqual(["agent[bot] fix adds no unit test"]);
    expect(violations([change(), change({ author: "bumper[bot]", path: "package-lock.json" })], config)).toEqual([]);
  });

  it("does not accept a non-unit test as the proof", () => {
    expect(violations([change(), change({ status: "A", path: "apps/one/tests/e2e/a.test.ts" })], config)).toEqual([
      "agent[bot] fix adds no unit test",
    ]);
  });

  it("ignores changes by anyone else, who is gated by review instead", () => {
    expect(violations([change({ author: "a person", path: "apps/one/deploy.jsonc" })], config)).toEqual([]);
  });
});

describe("testsToProve", () => {
  it("names each unit test the agent added, once, and never a deleted one", () => {
    const changes = [
      change({ status: "A", path: "apps/one/tests/unit/a.test.ts" }),
      change({ status: "M", path: "apps/one/tests/unit/a.test.ts" }),
      change({ status: "D", path: "apps/one/tests/unit/gone.test.ts" }),
      change({ status: "A", path: "apps/one/tests/e2e/a.test.ts" }),
    ];
    expect(testsToProve(changes, config)).toEqual(["apps/one/tests/unit/a.test.ts"]);
  });
});
