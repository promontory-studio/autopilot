# pedalion

πηδάλιον — the steering-oar of an ancient ship. It names the part, not the pilot: your
repository holds the helm and steers through this one.

[![CI](https://github.com/promontory-studio/pedalion/actions/workflows/ci.yml/badge.svg)](https://github.com/promontory-studio/pedalion/actions/workflows/ci.yml)
[![Community Health](https://img.shields.io/badge/dynamic/json?url=https://api.github.com/repos/promontory-studio/pedalion/community/profile&query=$.health_percentage&suffix=%25&label=community%20health)](https://github.com/promontory-studio/pedalion/community)

Reusable GitHub Actions workflows for letting an agent and a dependency bot open pull requests
against your repository without letting them quietly widen what they are allowed to change.

Four workflows and two composite actions, each callable from any repository under any owner:

| | What it does |
|---|---|
| `guard.yml` | Fails an automated pull request that touches a forbidden path, exceeds a diff cap, weakens a test, or adds a test that passes without its own fix |
| `review.yml` | Reviews a pull request once its CI has finished, approves it when clean, and merges it only when the shell — not the model — agrees |
| `promote.yml` | Opens the integration → release pull request once the integration branch has soaked quietly |
| `notify-failure.yml` | Files (or comments on) one issue per failing unattended workflow |
| `setup-node-ci` | checkout + Node + install, pinned once |
| `codeql-scan` | CodeQL init + analyze, pinned once |

Nothing here knows anything about the repository calling it. Everything specific to you arrives as
a `with:` input, a named `secrets:` input, or your own `.github/autopilot.json`. `scripts/no-entity-leak.sh`
is a required check on this repository and fails the build if that stops being true.

## Why a called workflow, and not a file you copy

Copy CI into five repositories and you have five copies that disagree within a month. A caller
here is about ten lines with no logic in it, so a diff across repositories stays legible.

Two constraints shape the design, and both bite silently if ignored:

- **`secrets: inherit` does not cross owners.** Every secret below is named and passed explicitly.
- **`vars.*` are not inherited by a called workflow.** That is why `mode` is an input rather than
  something read from `vars.AUTOPILOT` inside these files. Your caller reads the variable; these
  workflows are told the answer.

## Pin by SHA

```yaml
uses: OWNER/pedalion/.github/workflows/review.yml@<full-40-char-sha>
```

A change here reaches nobody until a pin moves, and the pin bump arrives as an ordinary Dependabot
pull request through your ordinary gate. That is what keeps pins fresh without anyone remembering to.

## Getting started

### 1. `.github/autopilot.json`

Only the guard reads it, and it is read from your repository at run time.

```json
{
  "agentAuthor": "my-agent[bot]",
  "botAuthor": "dependabot[bot]",
  "maxLines": 400,
  "forbidden": ["**/*.env", "apps/*/deploy.json", "**/migrations/**"],
  "apps": [
    {
      "path": "apps/web",
      "run": ["npx", "vitest", "run"],
      "tests": ["tests/**", "src/**/*.test.ts"],
      "unitTests": ["tests/unit/**"]
    }
  ]
}
```

- `agentAuthor` — the login whose commits are constrained. Required; a config that does not parse
  stops the run, because every default here is "allow".
- `botAuthor` — the dependency bot. It may touch manifests and workflow files, and it is not asked
  to prove its tests: it is reconciling a bump, not writing a feature.
- `forbidden` — extra globs on top of the ones that are always forbidden to the agent:
  `.github/**`, `**/package.json`, `**/package-lock.json`.
- `apps[].run` — argv that runs the named test files. The guard appends paths relative to `path`
  and runs it there.
- `apps[].unitTests` — the subset cheap enough to re-run at the base commit. That run is how a new
  test is proved to be a test: if it passes *without* the change, it proves nothing.

The JSON Schema is in [`schema/autopilot.schema.json`](schema/autopilot.schema.json).

### 2. Guard the automated pull requests

```yaml
# .github/workflows/ci.yml
  guard:
    if: github.event_name == 'pull_request'
    uses: OWNER/pedalion/.github/workflows/guard.yml@<sha>
    with:
      base-ref: ${{ github.base_ref }}
      head-sha: ${{ github.event.pull_request.head.sha }}
      authors: dependabot[bot],my-agent[bot]
      pr-author: ${{ github.event.pull_request.user.login }}
      head-branch: ${{ github.head_ref }}
      skip-branch-prefixes: promote/
```

**Filter by author with the `authors` input, never with a job-level `if:`.** A job skipped by a
job-level `if:` reports SKIPPED, and a *required* check that reports SKIPPED blocks the merge
forever. `authors` keeps the job running and lets it pass. `skip-branch-prefixes` is the same
escape for a branch: an automated pull request that is not an agent's work, such as a whole-branch
promotion, is exempted by head-branch prefix rather than by skipping the job.

### 3. Review and merge

```yaml
# .github/workflows/autopilot.yml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]

jobs:
  review:
    if: >
      vars.AUTOPILOT != 'off' &&
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.pull_requests[0] != null
    uses: OWNER/pedalion/.github/workflows/review.yml@<sha>
    with:
      mode: ${{ vars.AUTOPILOT }}
      pr-number: ${{ github.event.workflow_run.pull_requests[0].number }}
      head-sha: ${{ github.event.workflow_run.head_sha }}
      ci-conclusion: ${{ github.event.workflow_run.conclusion }}
      head-branch: ${{ github.event.workflow_run.head_branch }}
      app-id: ${{ vars.AUTOPILOT_APP_ID }}
    secrets:
      anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
      app-key: ${{ secrets.AUTOPILOT_APP_KEY }}
```

**Trigger it from `workflow_run`, not from inside CI.** A job that waits on the checks of the run
it belongs to is waiting on itself, and the pull request never merges.

`mode` is the whole kill switch: `off` does nothing, `dry-run` reviews and approves, `on` also
enables auto-merge. The merge is decided by the shell, not the model — it re-reads the pull
request and requires an approval that still sits at the head CI tested, with no vetoing label.

**`retarget-base` moves a dependency bot's pull request off the default branch.** Security updates
are always raised against the default branch, whatever `dependabot.yml` targets — and a repository
that promotes its integration branch whole cannot take a merge there without diverging the branch
that is supposed to receive it. Set it to the integration branch; empty (the default) leaves every
base alone.

Two things make it safe, and both are load-bearing:

- It is keyed on `bot-branch-prefix`, not on the author, because the App opens the daily promotion
  pull request too — from the default branch, into the default branch. Moving that one would stop
  promotion arriving, with nothing to see.
- It asks for a rebase as well as changing the base. The branch was cut from the default branch, so
  a base change alone leaves the pull request reading as *everything the default branch has that the
  target does not*, including whatever `keep-paths` deliberately holds back on it.

**A merge needs a GitHub App.** Without `app-id` and `app-key` the merge step is skipped, because
a merge pushed with `GITHUB_TOKEN` starts no downstream workflow — your release job would never
fire. Everything else works with `GITHUB_TOKEN` alone.

### 4. Promote on a soak

```yaml
  promote:
    uses: OWNER/pedalion/.github/workflows/promote.yml@<sha>
    with:
      mode: ${{ vars.AUTOPILOT_PROMOTE }}
      base-branch: main
      head-branch: dev
      soak-hours: 24
      keep-paths: |
        apps/web/deploy.json
      app-id: ${{ vars.AUTOPILOT_APP_ID }}
    secrets:
      app-key: ${{ secrets.AUTOPILOT_APP_KEY }}
```

The gate blocks unless the head branch has commits to promote, its tip is older than `soak-hours`,
CI is green on that tip, and — if you point `report-repo` at wherever runtime errors are filed — no
report since the base names a build in the range. Set `canary-label` as well and the gate also
refuses to promote while the report pipeline itself has gone quiet, which is the failure that makes
"no errors reported" meaningless.

`keep-paths` are restored from the base branch, for the files that are deliberately different
there. A promotion opens a pull request; it never pushes to the base branch.

### 5. Hear about failures

```yaml
  notify-failure:
    needs: [build, deploy]
    if: always() && contains(needs.*.result, 'failure')
    uses: OWNER/pedalion/.github/workflows/notify-failure.yml@<sha>
    with:
      title: Nightly backup failed
      context: There is no verified recent snapshot until this passes.
```

It files on the calling repository by default. Point `issue-repo` (plus `app-id`) somewhere else if
your failures belong in a different tracker.

## Permissions

A called job that asks for a permission the caller did not grant fails the **whole caller
workflow** before any job starts, so what each one needs is part of its contract:

| Workflow | What the calling job must grant |
|---|---|
| `guard.yml` | nothing |
| `notify-failure.yml` | nothing, unless it files on the calling repository — then `issues: write` |
| `review.yml` | `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write` |
| `promote.yml` | `contents: write`, `pull-requests: write` |

Grant them on the calling job rather than the whole workflow, so a sibling job does not inherit a
token it has no use for.

## What the guard actually checks

Against the base branch, for commits authored by `agentAuthor`:

1. **Forbidden paths** — `.github/**` and package manifests always, plus your `forbidden` globs.
   The dependency bot is exempt for manifests and workflow files.
2. **Diff cap** — total changed lines over `maxLines`.
3. **Weakened tests** — `.skip`, `.only`, `.todo`, `xit(`, `xdescribe(` added to a test file.
4. **Tests that prove nothing** — every new or changed unit test is re-run at the base commit. If
   they all pass there, the change is not proved by them.

Point 4 is the expensive one and the one worth having: it is the difference between "a test was
added" and "the bug could have been caught".

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — how to run the suite, which designs here look like bugs
and are deliberate, and why a workflow input is a public API. Vulnerabilities go through
[SECURITY.md](SECURITY.md), not a public issue.

MIT licensed.
