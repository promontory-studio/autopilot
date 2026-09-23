import { execFileSync } from "node:child_process";
import { arg } from "./argv";
import { type Commit, reviewReason } from "./bump";

const repo = arg("repo");
const pr = arg("pr");
if (!repo || !pr) {
  console.error("usage: bump-main.ts --repo <owner/name> --pr <number> [--no-review-types a,b] [--no-review-branch-prefixes a,b]");
  process.exit(2);
}

const gh = (path: string, ...flags: string[]) => JSON.parse(execFileSync("gh", ["api", ...flags, path], { encoding: "utf8", maxBuffer: 1 << 26 }));
const list = (name: string): string[] =>
  (arg(name) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const pull = gh(`repos/${repo}/pulls/${pr}`) as { user: { login: string }; head: { ref: string } };
const commits = (gh(`repos/${repo}/pulls/${pr}/commits?per_page=100`, "--paginate", "--slurp") as {
  commit: { message: string; verification: { verified: boolean } };
  author: { login: string } | null;
}[][])
  .flat()
  .map((c): Commit => ({ author: c.author?.login ?? "", verified: c.commit.verification.verified, message: c.commit.message }));

// Prints the reason a model must look, or nothing at all. The caller reads an empty line as
// "nothing here needs judgement" — so an error, which prints to stderr and exits non-zero, can
// never be mistaken for one.
const reason = reviewReason({
  commits,
  author: pull.user.login,
  branch: pull.head.ref,
  noReviewTypes: list("no-review-types"),
  noReviewBranchPrefixes: list("no-review-branch-prefixes"),
});
if (reason) console.log(reason);
