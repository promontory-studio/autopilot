# Reference

Every input, every secret, every default. [`USAGE.md`](USAGE.md) is what you paste;
[`README.md`](README.md) is why any of it exists.

Required inputs have no default. Everything else is optional and behaves as listed when omitted.

## `guard.yml`

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

## `review.yml`

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
| `no-review-update-types` | | `""` | Update types (`minor,patch`) that may merge on green CI with no model review. Empty reviews every bump. |
| `no-review-branch-prefixes` | | `""` | Head-branch prefixes whose bumps skip the review whatever the update type. Empty exempts nothing. |

| Secret | Required | What it does |
|---|---|---|
| `anthropic-api-key` | yes | The review model's key. |
| `app-key` | | Private key for `app-id`. Both or neither. |
| `repair-token` | | Used for the repair dispatch when no App is configured. |

## `promote.yml`

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

## `notify-failure.yml`

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

## `actions/setup-node-ci`

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

## `actions/codeql-scan`

| Input | Default | What it does |
|---|---|---|
| `language` | `javascript-typescript` | CodeQL language. |
| `queries` | `""` | Extra query suites, e.g. `security-extended`. |
| `build-mode` | `none` | CodeQL build mode. |
