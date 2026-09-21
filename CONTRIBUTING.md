# Contributing

Node 22 or newer (`engines.node` in `package.json`). `npm ci`, then the four things the `check`
job runs on every pull request:

```bash
npm run typecheck
npm test
./scripts/no-entity-leak.sh
./scripts/no-entity-leak.test.sh
```

CI also runs the guard against this repository's own pull request, and CodeQL. Neither has anything
to run by hand.

[ARCHITECTURE.md](ARCHITECTURE.md) is the contract behind the workflows: read it before changing
one. [CHANGELOG.md](CHANGELOG.md) gets an entry under `[Unreleased]` for anything a caller would
notice.

## A workflow input is a public API

Callers pin a full commit SHA and bump it on their own schedule, so a removed or renamed input
does not break anyone today — it breaks them on the bump they had no reason to read carefully.
**Add inputs; do not rename or remove one without a deprecation window in which both names work.**
The same goes for an input's default: changing it changes behaviour in every repository that never
set it.

## `./scripts/no-entity-leak.sh` must stay green

It runs as a step inside the required `check` job, and it fails the build on anything that ties
this repository to one particular estate: a literal `repository:`, `owner:` or `repositories:`
value under `.github/`, a `uses:` from an owner outside `actions`, `github` and `anthropics`, a
`uses:` not pinned to a full 40-character SHA, or planning shorthand and private repository names
carried in from a private tree.

`./scripts/no-entity-leak.test.sh` plants one of each violation to prove the check can fail, and
asserts this repository passes. Change the script and run both, or CI reddens on something the
pull request template never asked you to check.

A reusable workflow that knows who calls it is not reusable. If you need to name a repository, it
belongs in an input.

## Things that look like bugs and are deliberate

A pull request that "fixes" one of these needs to argue with the reason, not just the code. The
implementation-side ones — the `npm ci` fallback, `redOnBase` rewinding the tree, the inverse bot
allow-list, and an agent fix with no test failing outright — are in
[ARCHITECTURE.md](ARCHITECTURE.md#5-four-things-that-look-like-bugs), along with the job-id rule
(§2) and the self-locating checkout (§3). The caller-facing ones:

- **Applicability is an input, never a job-level `if:`.** A job skipped by a job-level `if:`
  reports SKIPPED, and a *required* check that reports SKIPPED blocks the merge forever. That is
  why `guard.yml` takes `authors` and `skip-branch-prefixes` and keeps running.
- **`review.yml` triggers from `workflow_run`, not from inside CI.** A job that waits on the
  checks of the run it belongs to is waiting on itself, and the pull request never merges.
- **Every secret is a named input, and `mode` is an input too.** `secrets: inherit` does not cross
  owners, and `vars.*` are not inherited by a called workflow. The caller reads the variable;
  these workflows are told the answer.
- **The merge decision is the shell's, not the model's.** `review.yml` re-reads the pull request
  and requires an approval that still sits at the head CI tested. Moving that decision into the
  prompt is the one change this repository will not take.

## Style

- No comments explaining *what* code does — name things so the code reads on its own. A comment
  earns its place only by explaining a non-obvious *why*.
- New or changed behaviour arrives with the test that pins it, in the same pull request. A test
  that passes whether or not the property holds is not a test.
- No new dependencies without discussion first. The guard's value is partly that it is small
  enough to audit in one sitting.

## Reporting a security issue instead of filing a pull request

See [SECURITY.md](SECURITY.md) — vulnerabilities go through GitHub's private vulnerability
reporting, not a public issue or pull request, until triaged.
