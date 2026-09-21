# Architecture

One sentence: **the caller owns the policy, this repository owns the enforcement, and neither is
allowed to know the other's name.** Everything below follows from that split, including the parts
that look like indirection and are not.

This is the contract, not a tour — `README.md` is where you learn what to paste into your own
repository. What follows is what you need in order to change something here safely, or to judge
whether a change someone else made is safe.

## 1. The shape

Six workflow files. **Four are reusable** — a caller names them in `uses:` — and two exist only to
run this repository's own CI:

```
   your repository                    this repository                 this repository's own CI
┌────────────────────┐          ┌───────────────────────┐          ┌──────────────────────┐
│ .github/           │          │  guard.yml            │          │ ci.yml               │
│   autopilot.json   │─────────▶│  review.yml           │          │   check              │
│ a caller workflow  │  uses:   │  promote.yml          │◀─────────│   guard  (dogfood)   │
│ vars + secrets     │          │  notify-failure.yml   │  local   │   codeql             │
└────────────────────┘          ├───────────────────────┤          │ autopilot.yml        │
                                │  actions/             │          └──────────────────────┘
                                │    setup-node-ci      │
                                │    codeql-scan        │
                                └───────────────────────┘
```

`src/` is the logic the workflows shell out to. `guard-main.ts` is the entry point `guard.yml`
invokes; `guard.ts` decides what counts as a violation; `config.ts` parses `.github/autopilot.json`;
`git.ts` is the diff reader. The split exists so the rules are unit-testable without a workflow run
— `tests/` hits those modules directly, never a mock of them.

## 2. The job id becomes the check name

A called workflow reports as `<your job id> / <its job id>`. That string, not the file name, is what
a branch ruleset requires.

This repository names its own dogfooding job `guard` (`.github/workflows/ci.yml`), so its required
check is `guard / guard`. A caller that names the job `autopilot-guard` gets `autopilot-guard /
guard` and must require *that*. Neither is more correct. What matters is that the job id and the
ruleset agree — rename the job and the old required check stops reporting, which does not fail the
merge, it **blocks it forever** on a context that will never arrive.

Two consequences worth knowing before you copy `README.md`'s example verbatim:

- Pick the job id first, then write the ruleset to match it.
- **Do not put a job-level `if:` on the guard.** A required check that reports `SKIPPED` is not
  satisfied. `guard.yml` is built to be called unconditionally: on a push, `pr-author` interpolates
  to the empty string, which is in nobody's `authors` list, so the job exits "nothing to check" and
  the check run still exists.

## 3. The host locates itself

`guard.yml` and `promote.yml` both need to check out *this* repository — the host — to run `src/`.
They do it without being told their own name:

```yaml
repository: ${{ job.workflow_repository }}
ref: ${{ job.workflow_sha }}
```

The `job` context describes the workflow **this job came from**; the `github` context describes the
**caller's**. Using `github.repository` would check the caller out as the host.

`github.job_workflow_ref` looks like the right field and is a trap: it does not exist, so it
silently interpolates to the empty string rather than erroring, and `actions/checkout` falls back to
the caller. That failure is silent and the guard then runs the caller's `src/`, or nothing at all.

This is also why a caller pins one SHA and not two: `job.workflow_sha` is the SHA the caller already
named in `uses:`.

## 4. Token precedence in `promote.yml`

`GH_TOKEN` resolves in this order, and the order is deliberate:

```
report-app token  →  secrets.report-token  →  App token  →  github.token
```

`report-token` outranks the App token because a caller only supplies it when the App **cannot reach
the report repository** — and the App token, scoped to the caller, cannot reach it either. Putting
the App first would mean a caller that correctly supplied the escape hatch never uses it.

## 5. Four things that look like bugs

**`npm ci || npm install`** (`.github/actions/setup-node-ci/action.yml`). `npm ci` refuses a lockfile
the manifest has outgrown — which is exactly the state a major dependency bump arrives in. The job
that exists to repair that bump has to be able to install first.

**`redOnBase` rewinds the whole tree** (`src/guard.ts`). To prove a new test is evidence of a fix
rather than decoration, the test must fail *without* the fix. So the tree is restored to the base
commit for everything except the new test files, the owning app's suite runs, and HEAD is restored
in a `finally`. It removes only paths git tracks, so a contributor's untracked local work survives a
guard run on their machine.

**The bot allow-list is inverse.** `ALWAYS_FORBIDDEN` lists what the *agent* may never touch.
`BOT_ALLOWED` lists the only things the *dependency bot* may touch — manifests and workflow files.
Anything outside that list is a violation. Read as an exemption it looks permissive; it is the
opposite.

**An agent fix with no unit test fails outright.** Not "its test is not checked" — it fails. A
dependency repair is proven by CI going green on the bump itself; a bug fix has no such witness, so
it must bring a test. The base-commit re-run is a *second* gate on top of that, not a substitute.

## 6. Why the host names nobody

`scripts/no-entity-leak.sh` runs in CI and fails the build on anything that ties this repository to
one particular estate: a literal `repository:`/`owner:` under `.github/`, a `uses:` from an owner
nobody vetted here, a `uses:` that is not a full 40-character SHA, or planning shorthand and private
repository names anywhere in the tree.

A reusable workflow that knows who calls it is not reusable, and the failure mode is not theoretical:
a hard-coded slug works perfectly in the estate that wrote it and breaks for everyone else, with no
signal until someone else adopts it. `scripts/no-entity-leak.test.sh` plants one of each violation
to prove the check can fail, and asserts this repository itself passes.

The script excludes itself from its own scan, which is what lets its comments name the things it
forbids.
