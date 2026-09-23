# Changelog

All notable changes to these workflows are documented here. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**A tag here is a marker, not a distribution.** Nothing is published to a registry; callers pin a
full commit SHA and a tag exists only so that SHA has a human-readable name. So there is no release
job and no release automation — a version is cut by hand at the end of a change, and this file is
where a caller finds out what moving their pin would get them.

Breaking changes are named as such. A workflow input is a public API: renaming or removing one
breaks every caller on the bump they had no reason to read carefully, so it happens in a major
version and is announced here first.

## [Unreleased]

## [1.3.0] — 2026-09-23

### Added

- `review.yml` gains `no-review-update-types` and `no-review-branch-prefixes`. A dependency bump
  whose every commit is the bot's own signed work, and whose update types are all named in the
  first input — or whose branch matches the second — merges on green CI with no model review at
  all. Both default to `""`, which reviews every bump exactly as before, so moving a pin to this
  tag changes nothing until a caller opts in.
- `src/bump.ts` decides it, from the `updated-dependencies:` trailers the bot signs into each
  commit. Not the branch name (which carries no *old* version), not the title (a grouped bump's
  has no versions at all), and not a third-party action. It fails closed in three directions:
  unknown metadata, an update type nobody exempted, and — ahead of the branch exemption — any
  commit that is not the pull request author's own signed work, which is what an agent's repair
  of a bump looks like.

### Fixed

- **The promotion gate no longer deadlocks on a report that was triaged.** It asked for error
  reports with `state=all` while filtering on `since`, and GitHub's `since` filters on
  `updated_at` — so *closing* a report bumped it back into the window, where it blocked forever,
  and the only thing that could have cleared the window was the promotion it was blocking. It now
  counts open reports only, skips the pull requests the issues endpoint also returns, and reads
  comments per surviving report instead of sweeping the whole repository unfiltered.
- **`promote.yml` says why it did not promote.** A refusal is the gate working, so the step is
  still green — but it printed only into a log nobody opens, which is how a jammed gate goes
  unnoticed. The blockers are now notices and a step summary. A gate that could not reach the API
  exits 3 and fails the step, so a broken gate no longer reads as a healthy refusal.
- **The guard no longer makes every dependency repair unmergeable.** `package-lock.json` was
  forbidden to the agent unconditionally, while repairing a bump requires writing it; the
  regenerated lines also counted against the diff cap. Both are now exempt on a branch that
  already carries a bot commit. `package.json` and `.github/**` stay forbidden there — which
  version to declare is the bot's call, and the rules the agent is judged by are never its own.

## [1.2.0] — 2026-09-22

Documentation only. **No workflow, action, input, default, secret or behaviour changed** — moving a
pin to this tag changes nothing about what runs. A minor bump rather than a patch because two new
files exist that callers may link to.

### Added

- `USAGE.md` — everything a caller pastes: the five getting-started steps, the permissions table
  and the pin-by-SHA form, moved verbatim out of `README.md`.
- `REFERENCE.md` — every input, secret and default, moved verbatim out of `README.md`'s
  **Reference: every input**.

### Changed

- `README.md` is now the argument rather than the manual: why each check exists and why re-running
  CI does not make it, a section per workflow named for what it refuses, and a
  **What it has actually caught** section carrying real counts and the negatives with them.
- `package.json`'s `description` and the repository's GitHub About now say what the workflows
  check rather than what kind of thing they are, and are once again identical to each other.
- Inbound references in `ARCHITECTURE.md`, `SECURITY.md`, `CONTRIBUTING.md`, the pull request
  template and the bug report template now point at whichever of the three documents holds the
  thing they meant.

## [1.1.0] — 2026-09-21

### Added

- `ARCHITECTURE.md` — the contract behind the workflows: the reusable/local split, why the job id
  becomes the required check name, how the host locates itself with `job.workflow_repository`,
  `promote.yml`'s token precedence, and the four behaviours that look like bugs and are deliberate.
- `CHANGELOG.md` — this file. `CONTRIBUTING.md` promises a deprecation window for a renamed input
  and there was previously nowhere to serve it.
- `README.md` gains **Reference: every input** — a table per reusable workflow and per composite
  action. 18 inputs and 6 secrets were previously documented nowhere, including all 11 on
  `setup-node-ci` and `codeql-scan`.
- `package.json` gains `version`, `description`, `repository` and `license`, none of which existed.

### Fixed

- **`README.md`'s three caller examples now carry the `permissions:` block** the Permissions section
  immediately below them declares mandatory. A reader who copy-pasted any of them hit the exact
  failure that section warns about — a called job asking for a permission the caller never granted
  fails the whole caller workflow before any job starts.
- **"What the guard actually checks" under-reported the guard by four behaviours**: deleting a test
  file, removing existing test lines, an agent fix that adds no unit test at all (which fails
  outright, rather than merely skipping the base-commit proof), and the dependency bot's allow-list
  being an inverse rule — it may touch *only* manifests and workflow files. `schema/autopilot.schema.json`
  stated the same rule permissively and now states it as implemented.
- `SECURITY.md` said "There are no releases", which the `v1.0.0` tag made false.
- `schema/autopilot.schema.json`'s `$id` was the literal placeholder `.../OWNER/REPO/...` and 404ed,
  while `README.md` linked the file as resolvable.
- Private vulnerability reporting was disabled while `SECURITY.md` directed reporters to
  `/security/advisories/new` — a link that 404s for anyone who is not a maintainer, leaving the
  public issue tracker as the only working route, which is what the policy tells them to avoid.
- `CONTRIBUTING.md` listed three pre-push commands where CI runs five, never named
  `scripts/no-entity-leak.test.sh` at all, and stated no required Node version.

### Changed

- `package.json`'s `name` was `autopilot` — the repository's pre-rename name, and the only place the
  manifest named the repository at all.
- `scripts/no-entity-leak.sh` now also fails on private repository names, not only week codes and
  plan-shaped paths. `.gitignore` carried one; the check that exists to prevent exactly that did not
  look for it. `scripts/no-entity-leak.test.sh` plants the case that proves the new pattern can fail.
- `.autopilot-host` → `.pedalion-host`, the host checkout path inside `guard.yml` and `promote.yml`.
  Job-internal; no caller sees it.
- `actions/permissions` now sets `sha_pinning_required`. Every `uses:` here was already a full SHA,
  so this changes no behaviour — it refuses a tag at the API, which is the one place a hand-edit or
  a pasted snippet gets in.

## [1.0.0] — 2026-09-21

First release, under the name the repository carried before `pedalion-ci`.

### Added

- `guard.yml` — refuses an automated pull request that touches a forbidden path, weakens or deletes
  a test, exceeds a line cap, or fixes a bug without bringing a test that is red at the base commit.
  Self-locating, so the caller pins one SHA and never names the host twice.
- `review.yml` — a model review, then a merge, with vetoing labels, a bot allow-list, base
  retargeting, and a `repository_dispatch` escape hatch to a repair repository.
- `promote.yml` — opens a promotion pull request once a soak window has passed with no new error
  reports, reading the report repository through a token that outranks the App's.
- `notify-failure.yml` — files or updates a single issue for a failed run, deduplicating rather than
  filing one per failure.
- `actions/setup-node-ci` and `actions/codeql-scan` — the composite steps the four workflows share.
- `scripts/no-entity-leak.sh` and its test — CI fails on anything tying this repository to one
  estate: a literal repository slug, an unvetted action owner, a `uses:` that is not a full SHA.

[Unreleased]: https://github.com/promontory-studio/pedalion-ci/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/promontory-studio/pedalion-ci/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/promontory-studio/pedalion-ci/releases/tag/v1.0.0
