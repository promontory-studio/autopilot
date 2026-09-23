import { execFileSync } from "node:child_process";
import { arg } from "./argv";
import { buildsNamedIn, promotionBlockers, type Report, reportedBodies } from "./promotion-gate";

const repo = arg("repo");
const base = arg("base");
const head = arg("head");
if (!repo || !base || !head) {
  console.error("usage: promotion-gate-main.ts --repo <owner/name> --base <ref> --head <ref> [--dir <path>] [--soak-hours N] [--report-repo <owner/name>] [--report-label L] [--canary-label L] [--canary-max-age-hours N]");
  process.exit(2);
}

// A gate that cannot reach the API and a gate that is refusing both exited 1, so a broken gate
// read as a healthy refusal — indefinitely, and silently. Blocked is 1; unable to decide is 3.
process.on("uncaughtException", (e: Error) => {
  console.error(`promotion gate failed to reach a verdict: ${e.message}`);
  process.exit(3);
});

const dir = arg("dir") ?? process.cwd();
const run = (cmd: string, ...args: string[]) =>
  execFileSync(cmd, args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 }).trim();
const range = run("git", "rev-list", `${base}..${head}`).split("\n").filter(Boolean);
const tip = range[0] ?? "";
const since = range.length ? run("git", "show", "-s", "--format=%cI", range[range.length - 1]!) : new Date().toISOString();

const conclusions: (string | null)[] = tip
  ? JSON.parse(run("gh", "api", `repos/${repo}/commits/${tip}/check-runs?per_page=100`, "-q", "[.check_runs[].conclusion]"))
  : [];

const reportRepo = arg("report-repo");
const reportLabel = arg("report-label") ?? "client-error";
const api = <T>(path: string): T[] => (JSON.parse(run("gh", "api", "--paginate", "--slurp", path)) as T[][]).flat();

const reportedBuilds = reportRepo
  ? buildsNamedIn(
      reportedBodies(
        // `since` is sound on the reports themselves — a report cannot name a build older than
        // itself — and wrong on their comments, where an older comment on an in-window report can
        // still be naming an in-range build.
        api<Report>(`repos/${reportRepo}/issues?state=open&labels=${reportLabel}&per_page=100&since=${since}`),
        (n) => api<{ body: string | null }>(`repos/${reportRepo}/issues/${n}/comments?per_page=100`),
      ),
      repo,
    )
  : [];

// The canary's closed issues are included, sorted by update: a canary is closed by hand once its
// comment list is long, and the run that closed it still proved the pipeline alive.
const canaryLabel = arg("canary-label");
let canaryAt: number | null | undefined;
if (canaryLabel && reportRepo) {
  const found = JSON.parse(
    run("gh", "api", `repos/${reportRepo}/issues?state=all&sort=updated&direction=desc&per_page=1&labels=${canaryLabel}`),
  ) as { updated_at: string }[];
  canaryAt = found[0] ? Date.parse(found[0].updated_at) : null;
}

const blockers = promotionBlockers({
  range,
  tipTime: tip ? Date.parse(run("git", "show", "-s", "--format=%cI", tip)) : 0,
  now: Date.now(),
  soakHours: Number(arg("soak-hours") ?? 24),
  ciGreen: conclusions.length > 0 && conclusions.every((c) => c === "success" || c === "skipped" || c === "neutral"),
  reportedBuilds,
  canaryAt,
  canaryMaxAgeHours: Number(arg("canary-max-age-hours") ?? 8),
});

if (blockers.length) {
  console.log(`not promoting:\n${blockers.join("\n")}`);
  process.exit(1);
}
console.log(`promoting ${range.length} commits`);
