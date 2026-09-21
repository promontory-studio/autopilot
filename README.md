# pedalion-ci

πηδάλιον — the steering-oar of an ancient ship. It names the part, not the pilot: your
repository holds the helm and steers through this one.

[![CI](https://github.com/promontory-studio/pedalion-ci/actions/workflows/ci.yml/badge.svg)](https://github.com/promontory-studio/pedalion-ci/actions/workflows/ci.yml)
[![Community Health](https://img.shields.io/badge/dynamic/json?url=https://api.github.com/repos/promontory-studio/pedalion-ci/community/profile&query=$.health_percentage&suffix=%25&label=community%20health)](https://github.com/promontory-studio/pedalion-ci/community)

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

The `AUTOPILOT` prefix on those variables and secrets names the capability, not this repository —
it is yours to rename, and nothing here reads it.

## Pin by SHA

```yaml
uses: OWNER/pedalion-ci/.github/workflows/review.yml@<full-40-char-sha>
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
- `apps[].path` — the app's directory. Empty (or `"."`) is the repository root, which is what a
  single-package repository wants.
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
    uses: OWNER/pedalion-ci/.github/workflows/guard.yml@<sha>
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

**The job id you pick becomes the check name.** A called workflow reports as `<your job id> /
<its job id>`, so the job above reports as `guard / guard` and that — not the file name — is the
string your branch ruleset must require. Name the job `autopilot-guard` and require
`autopilot-guard / guard` instead. See [ARCHITECTURE.md](ARCHITECTURE.md#2-the-job-id-becomes-the-check-name).

### 3. Review and merge

```yaml
# .github/workflows/autopilot.yml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

jobs:
  review:
    if: >
      vars.AUTOPILOT != 'off' &&
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.pull_requests[0] != null
    uses: OWNER/pedalion-ci/.github/workflows/review.yml@<sha>
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
    permissions:
      contents: write
      pull-requests: write
    uses: OWNER/pedalion-ci/.github/workflows/promote.yml@<sha>
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
    permissions:
      issues: write
    uses: OWNER/pedalion-ci/.github/workflows/notify-failure.yml@<sha>
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

## Reference: every input

Required inputs have no default. Everything else is optional and behaves as listed when omitted.

### `guard.yml`

| Input | Required | Default | What it does |
|---|---|---|---|
| `base-ref` | yes | | Branch the pull request merges into. The diff and the base-commit test re-run are both against it. |
| `head-sha` | yes | | Commit to check. The pull request head, not the merge commit. |
| `authors` | | `""` | Comma-separated logins the guard applies to. Empty applies it to everyone. |
| `pr-author` | | `""` | Login that opened the pull request. On a push it interpolates to empty, which is in nobody's `authors` list, so the job passes as "nothing to check". |
| `head-branch` | | `""` | Branch the pull request comes from. Only needed with `skip-branch-prefixes`. |
| `skip-branch-prefixes` | | `""` | Comma-separated head-branch prefixes the guard does not apply to. |
| `config-path` | | `.github/autopilot.json` | Where the caller's config lives. |
| `node-version` | | `22` | Node used to run `src/` and the caller's tests. |
| `install` | | `npm ci` | How to install the caller's dependencies so its tests can run. |

No secrets, and no permissions.

### `review.yml`

| Input | Required | Default | What it does |
|---|---|---|---|
| `mode` | | `dry-run` | `off` does nothing, `dry-run` reviews and approves, `on` also enables auto-merge. |
| `pr-number` | yes | | Pull request to review. |
| `head-sha` | yes | | Head the CI run tested. The merge refuses to fire at any other head. |
| `ci-conclusion` | yes | | Conclusion of that CI run. Anything but `success` skips the review and, on an automated branch, may dispatch a repair. |
| `head-branch` | | `""` | Branch the pull request comes from. Needed for `retarget-base` and the repair dispatch. |
| `reviewer-pattern` | | `claude` | Regex an approving review's author must match for the merge to fire. |
| `merge-method` | | `squash` | `squash`, `merge` or `rebase`. |
| `merge-method-by-base` | | `{}` | JSON overriding the method per base branch, e.g. `{"main":"merge"}`. |
| `hold-labels` | | `hold,autopilot:needs-human` | Comma-separated labels that veto the merge. |
| `needs-human-label` | | `autopilot:needs-human` | Label applied when the review declines to approve. |
| `allowed-bots` | | `dependabot[bot]` | Bot logins whose pull requests the review is allowed to act on at all. |
| `retarget-base` | | `""` | Branch to move a bot pull request onto when it was raised against the default branch. Empty leaves every base alone. |
| `model` | | `""` | Overrides the review model. Empty uses the action's default. |
| `app-id` | | `""` | GitHub App to merge as. Without one the merge is skipped, because a merge pushed with `GITHUB_TOKEN` starts no downstream workflow. |
| `repair-repo` | | `""` | `owner/name` to send a `repository_dispatch` to when CI failed on an automated branch. Empty sends nothing. |
| `repair-event` | | `autopilot-repair` | `event_type` of that dispatch. |
| `bot-branch-prefix` | | `dependabot/` | Prefix of the dependency bot's branches. Retarget and repair are keyed on it, not on the author. |

| Secret | Required | What it does |
|---|---|---|
| `anthropic-api-key` | yes | The review model's key. |
| `app-key` | | Private key for `app-id`. Both or neither. |
| `repair-token` | | Used for the repair dispatch when no App is configured. |

### `promote.yml`

| Input | Required | Default | What it does |
|---|---|---|---|
| `mode` | | `dry-run` | `off` does nothing; anything else opens the pull request. |
| `base-branch` | | `main` | Branch being promoted into. |
| `head-branch` | | `dev` | Branch being promoted. |
| `branch-prefix` | | `promote/` | Prefix of the branch the promotion is opened from. |
| `soak-hours` | | `24` | How long the head tip must have sat untouched and green. |
| `keep-paths` | | `""` | Newline-separated paths restored from the base branch, for files deliberately different there. |
| `report-repo` | | `""` | `owner/name` of where runtime error reports are filed. Empty skips that half of the gate. |
| `report-label` | | `client-error` | Label identifying those reports. |
| `canary-label` | | `""` | Label on the issue that proves the report pipeline is still alive. Empty skips the liveness check, which a caller with no pipeline wants. |
| `canary-max-age-hours` | | `8` | How stale that canary may be before "no errors reported" stops meaning anything. |
| `app-id` | | `""` | App to open the pull request as, so its checks actually run. |
| `node-version` | | `22` | Node used for the gate. |

| Secret | Required | What it does |
|---|---|---|
| `app-key` | | Private key for `app-id`. |
| `report-token` | | Reads `report-repo` when the App cannot. It outranks the App token, because a caller only supplies it when the App cannot reach that repository. |

### `notify-failure.yml`

| Input | Required | Default | What it does |
|---|---|---|---|
| `title` | yes | | Issue title. A recurrence comments on the open issue with this exact title rather than filing another. |
| `context` | | `""` | One line naming what failed, shown under the run link. |
| `issue-repo` | | `""` | Where to file. Empty files on the calling repository. |
| `label` | | `ci-failure` | Label applied to the issue. |
| `assignee` | | `""` | Login assigned to it. |
| `app-id` | | `""` | Needed only to file into another repository. |

| Secret | Required | What it does |
|---|---|---|
| `app-key` | | Private key for `app-id`. |
| `issue-token` | | Files into `issue-repo` when no App is configured. |

### `actions/setup-node-ci`

checkout + Node + install, pinned once. Used by every workflow here; usable directly with
`uses: OWNER/pedalion-ci/.github/actions/setup-node-ci@<sha>`.

| Input | Default | What it does |
|---|---|---|
| `repository` | `""` | Repository to check out. Empty is the one running the job. |
| `ref` | `""` | Ref or SHA to check out. |
| `path` | `""` | Directory to check out into. |
| `fetch-depth` | `1` | History depth. `0` fetches all of it, which a diff against a base branch needs. |
| `token` | `${{ github.token }}` | Token for the checkout. |
| `node-version` | `22` | Node to set up. |
| `install` | `npm ci` | Install command. Empty skips installation entirely. |
| `working-directory` | `.` | Where the install command runs. |

`npm ci` falls back to `npm install` on failure, deliberately — see
[ARCHITECTURE.md](ARCHITECTURE.md#5-four-things-that-look-like-bugs).

### `actions/codeql-scan`

| Input | Default | What it does |
|---|---|---|
| `language` | `javascript-typescript` | CodeQL language. |
| `queries` | `""` | Extra query suites, e.g. `security-extended`. |
| `build-mode` | `none` | CodeQL build mode. |

## What the guard actually checks

Against the base branch, for commits authored by `agentAuthor`:

1. **Forbidden paths** — `.github/**` and package manifests always, plus your `forbidden` globs.
   The dependency bot is exempt for manifests and workflow files.
2. **Diff cap** — total changed lines over `maxLines`.
3. **Weakened tests** — `.skip`, `.only`, `.todo`, `xit(`, `xdescribe(` added to a test file, a
   test file deleted, or existing test lines removed from one that already existed.
4. **A fix with no test at all** — an agent commit that is not a dependency bump and brings no new
   or changed unit test fails outright. Not "its proof is skipped": it fails.
5. **Tests that prove nothing** — every new or changed unit test is re-run at the base commit. If
   they all pass there, the change is not proved by them.

Point 1's bot exemption is an *inverse* rule and reads more permissively than it is: the dependency
bot may touch **only** package manifests and `.github/workflows/*.yml`. Anything else it touches is
a violation, including paths the agent is free to edit.

Point 5 is the expensive one and the one worth having: it is the difference between "a test was
added" and "the bug could have been caught".

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — how to run the suite and why a workflow input is a public
API — and [ARCHITECTURE.md](ARCHITECTURE.md) for the contract behind these workflows, including the
designs that look like bugs and are deliberate. [CHANGELOG.md](CHANGELOG.md) is what moving a pin
gets you. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies here. Vulnerabilities go through
[SECURITY.md](SECURITY.md), not a public issue.

MIT licensed.
