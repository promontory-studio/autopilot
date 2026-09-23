const HOUR = 3_600_000;

export type Soak = {
  range: string[];
  tipTime: number;
  now: number;
  soakHours: number;
  ciGreen: boolean;
  // Builds named by error reports raised during the soak, as bare SHAs. Empty when the caller
  // configured no report source.
  reportedBuilds: string[];
  // When the report pipeline last proved itself alive, or null if it never has. `undefined` means
  // the caller asked for no liveness check, which is the right answer for a repo with no pipeline.
  canaryAt?: number | null;
  canaryMaxAgeHours: number;
};

export function promotionBlockers({ range, tipTime, now, soakHours, ciGreen, reportedBuilds, canaryAt, canaryMaxAgeHours }: Soak): string[] {
  if (!range.length) return ["the head branch has nothing the base lacks"];
  const out: string[] = [];
  const age = Math.floor((now - tipTime) / HOUR);
  if (age < soakHours) out.push(`head tip is ${age}h old; soak is ${soakHours}h`);
  if (!ciGreen) out.push("CI is not green on the head tip");

  // Checked BEFORE the reports below, because it decides what their absence means: a dead sink and
  // a clean week are the same empty list, and a gate that cannot tell them apart promotes on the
  // first one.
  if (canaryAt === null) out.push("the error pipeline has never proved itself alive; a quiet soak is not evidence");
  else if (canaryAt !== undefined && now - canaryAt > canaryMaxAgeHours * HOUR)
    out.push(`the error pipeline last proved itself alive ${Math.floor((now - canaryAt) / HOUR)}h ago; a quiet soak is not evidence`);

  for (const b of new Set(reportedBuilds))
    if (range.some((sha) => sha.startsWith(b) || b.startsWith(sha))) out.push(`error reported from build ${b}, which is in the range`);
  return out;
}

export type Report = {
  number: number;
  state: string;
  body?: string | null;
  // Present only on a pull request. The issues endpoint returns those too, and a pull request is
  // not an error report.
  pull_request?: unknown;
};

// The bodies that count against a promotion. Closed reports are dropped: closing one bumps the
// `updated_at` that the caller's `since` window filters on, so a triaged report would sit in the
// window forever and the only thing that could clear it is the promotion it is blocking.
//
// `commentsOf` is injected and called lazily, for surviving reports only — a recurrence arrives as
// a comment, so comments must still be read, but reading them for every report in the backlog is
// what made this a repository-wide sweep.
export const reportedBodies = (reports: Report[], commentsOf: (issue: number) => { body?: string | null }[]): string[] =>
  reports
    .filter((r) => r.state === "open" && !r.pull_request)
    .flatMap((r) => [r as { body?: string | null }, ...commentsOf(r.number)])
    .map((i) => i.body ?? "");

// Reports name their build as `<owner>/<repo>@<sha>`; the repository is an input because this
// utility has no idea which one it is gating.
export const buildsNamedIn = (bodies: string[], repo: string): string[] => {
  const re = new RegExp(`${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@([0-9a-f]{7,40})`, "g");
  return bodies.flatMap((b) => [...b.matchAll(re)].map((m) => m[1]!));
};
