import { execFileSync, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import type { App, Config } from "./config";
import { dirOf, relativeTo, within } from "./config";
import { matchesAny } from "./glob";

// Enforced in CI rather than in the agent's prompt: a prompt can be talked out of a rule, a check cannot.
export type Change = {
  author: string;
  status: "A" | "M" | "D" | "R";
  path: string;
  added: number;
  removed: number;
  addedLines: string[];
};

// Forbidden to the agent in every repository, whatever the caller's config says. A change here
// rewrites the rules the agent is judged by, so it is never the agent's to make.
const ALWAYS_FORBIDDEN = [".github/**", "**/package.json", "**/package-lock.json"];
// A dependency bot's whole job is manifests and workflow pins; anything else is not a bump.
const BOT_ALLOWED = ["**/package.json", "**/package-lock.json", ".github/workflows/*.yml", ".github/workflows/*.yaml"];
const WEAKENER = /\b(it|test|describe)\.(skip|only|todo)\b|\bx(it|describe)\(/;

export const isTest = (path: string, config: Config): boolean =>
  config.apps.some((a) => matchesAny(path, within(a, a.tests)));

const unitTestsOf = (path: string, config: Config): App | undefined =>
  config.apps.find((a) => matchesAny(path, within(a, a.unitTests)));

export function violations(changes: Change[], config: Config): string[] {
  const agent = changes.filter((c) => c.author === config.agentAuthor);
  const bot = changes.filter((c) => c.author === config.botAuthor);
  const out: string[] = [];
  const forbidden = [...ALWAYS_FORBIDDEN, ...config.forbidden];

  for (const c of agent) if (matchesAny(c.path, forbidden)) out.push(`${config.agentAuthor} may not touch ${c.path}`);
  for (const c of bot) if (!matchesAny(c.path, BOT_ALLOWED)) out.push(`${config.botAuthor} may not touch ${c.path}`);

  for (const c of agent.filter((c) => isTest(c.path, config))) {
    if (c.status === "D") out.push(`${c.path}: deletes a test file`);
    else if (c.status !== "A" && c.removed > 0) out.push(`${c.path}: removes ${c.removed} existing test lines`);
    for (const line of c.addedLines.filter((l) => WEAKENER.test(l))) out.push(`${c.path}: adds ${line.trim()}`);
  }

  const lines = agent.reduce((n, c) => n + c.added + c.removed, 0);
  if (lines > config.maxLines) out.push(`agent diff is ${lines} lines (cap ${config.maxLines})`);

  // A dependency repair is proven by CI going green on the bump itself; a bug fix has no such
  // witness, so it must bring a test that was red without it.
  if (agent.length && !bot.length && !testsToProve(changes, config).length) out.push(`${config.agentAuthor} fix adds no unit test`);
  return out;
}

export const testsToProve = (changes: Change[], config: Config): string[] => [
  ...new Set(changes.filter((c) => c.author === config.agentAuthor && c.status !== "D" && unitTestsOf(c.path, config)).map((c) => c.path)),
];

// Rewinds the whole tree to `base` except for `tests`, runs each owning app's suite, then restores
// HEAD. True iff some suite fails there — which is what makes the new test evidence of the fix
// rather than decoration. Removes only paths git tracks, so untracked local work survives.
export function redOnBase(repo: string, base: string, tests: string[], config: Config, spawn = spawnSync): boolean {
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  const baseOnly = git("diff", "--name-only", "--no-renames", "--diff-filter=A", "HEAD", base).split("\n").filter(Boolean);
  git("restore", `--source=${base}`, "--worktree", "--", ".", ...tests.map((t) => `:!${t}`));
  try {
    return config.apps.some((app) => {
      const mine = tests.filter((t) => matchesAny(t, within(app, app.unitTests)));
      if (!mine.length) return false;
      const [cmd, ...args] = app.run;
      return spawn(cmd!, [...args, ...mine.map((t) => relativeTo(app, t))], { cwd: dirOf(repo, app), stdio: "inherit" }).status !== 0;
    });
  } finally {
    git("restore", "--source=HEAD", "--worktree", "--", ".");
    for (const p of baseOnly) rmSync(`${repo}/${p}`, { force: true });
  }
}

export function changesSince(repo: string, base: string, config: Config): Change[] {
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  return git("log", "--no-merges", "--format=%H %an", `${base}..HEAD`)
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [sha, ...name] = line.split(" ");
      const author = name.join(" ");
      const statuses = new Map(
        git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--name-status", sha!)
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => l.split("\t") as [Change["status"], string])
          .map(([s, p]) => [p, s] as const),
      );
      return git("diff-tree", "--no-commit-id", "-r", "--no-renames", "--numstat", sha!)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l): Change => {
          const [a, r, path] = l.split("\t");
          const addedLines = isTest(path!, config)
            ? git("show", "--format=", "-U0", sha!, "--", path!)
                .split("\n")
                .filter((d) => d.startsWith("+") && !d.startsWith("+++"))
                .map((d) => d.slice(1))
            : [];
          return { author, status: statuses.get(path!) ?? "M", path: path!, added: Number(a) || 0, removed: Number(r) || 0, addedLines };
        });
    });
}
