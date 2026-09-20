import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { changesSince, redOnBase } from "../src/guard";

// A real repository built for each case, because these two functions are almost entirely git
// behaviour: a stub would assert what we believe git does, not what it does.
const config = parseConfig(
  JSON.stringify({
    agentAuthor: "agent[bot]",
    apps: [{ path: "apps/one", tests: ["tests/**/*.test.ts"], unitTests: ["tests/unit/**/*.test.ts"], run: ["true"] }],
  }),
);

let repo = "";
afterEach(() => repo && rmSync(repo, { recursive: true, force: true }));

const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

function write(path: string, body: string) {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), body);
}

function commit(author: string, message: string) {
  git("add", "-A");
  git("-c", `user.name=${author}`, "-c", "user.email=a@b.c", "commit", "-q", "-m", message);
}

function newRepo() {
  repo = mkdtempSync(join(tmpdir(), "autopilot-"));
  git("init", "-q", "-b", "main");
  write("apps/one/src/a.ts", "export const a = 1;\n");
  commit("a person", "base");
  return git("rev-parse", "HEAD").trim();
}

describe("changesSince", () => {
  it("attributes each file to the author of the commit that touched it", () => {
    const base = newRepo();
    write("apps/one/src/a.ts", "export const a = 2;\n");
    commit("agent[bot]", "fix");
    const changes = changesSince(repo, base, config);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ author: "agent[bot]", status: "M", path: "apps/one/src/a.ts", added: 1, removed: 1 });
  });

  it("collects added lines for a test file, so a weakener can be seen", () => {
    const base = newRepo();
    write("apps/one/tests/unit/a.test.ts", "it.skip('x', () => {});\n");
    commit("agent[bot]", "test");
    const [change] = changesSince(repo, base, config);
    expect(change!.status).toBe("A");
    expect(change!.addedLines).toEqual(["it.skip('x', () => {});"]);
  });

  it("collects no lines for a non-test file, which is the cheap path", () => {
    const base = newRepo();
    write("apps/one/src/b.ts", "export const b = 1;\n");
    commit("agent[bot]", "add");
    expect(changesSince(repo, base, config)[0]!.addedLines).toEqual([]);
  });
});

describe("redOnBase", () => {
  const withRunner = (status: number) =>
    redOnBase(repo, git("rev-parse", "HEAD~1").trim(), ["apps/one/tests/unit/a.test.ts"], config, (() => ({ status })) as never);

  function repoWithNewTest() {
    newRepo();
    write("apps/one/src/a.ts", "export const a = 2;\n");
    write("apps/one/tests/unit/a.test.ts", "// proves the fix\n");
    commit("agent[bot]", "fix + test");
  }

  it("is red when the new test fails against the base tree", () => {
    repoWithNewTest();
    expect(withRunner(1)).toBe(true);
  });

  it("is green when the new test passes without the fix, which means it proves nothing", () => {
    repoWithNewTest();
    expect(withRunner(0)).toBe(false);
  });

  it("restores the working tree afterwards, including files the base does not have", () => {
    repoWithNewTest();
    withRunner(1);
    expect(git("status", "--porcelain")).toBe("");
    expect(readFileSync(join(repo, "apps/one/src/a.ts"), "utf8")).toBe("export const a = 2;\n");
    expect(existsSync(join(repo, "apps/one/tests/unit/a.test.ts"))).toBe(true);
  });
});
