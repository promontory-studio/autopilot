# pedalion-ci

**A green build means the tests that arrived with the change pass.** That was close enough for as
long as a person wrote the change and, separately, thought about how to catch themselves being
wrong — and a second person read both. An agent writes the fix and its test in one pass and does
not get tired, so the question every branch ruleset answers by running CI — *is this diff safe to
merge?* — is now being answered by the diff.

The usual substitutes are a required human approval that is a rubber stamp by the third pull
request of the morning, a `CODEOWNERS` entry naming whoever is least likely to refuse, or leaving
the agent in `dry-run` forever and merging by hand — which is the honest one, and is why most
agents never leave it.

> **Here to use it?** [USAGE.md](USAGE.md) is what you paste into your own repository.
> [REFERENCE.md](REFERENCE.md) is every input, every secret and every default.

## What this is for

A change you cannot check by reading it is one you cannot safely merge. Reading is the part that
does not scale — not the writing, and not the CI.

> An **automated pull request** is one whose author cannot be argued with: a coding agent, or a
> dependency bot. It differs from a person's in exactly one way that matters — it is not
> rate-limited by the author's attention, so every safeguard that worked only because someone
> would eventually have noticed has quietly stopped working.

These are four reusable GitHub Actions workflows. Each makes a check a reader would have made, in a
place the thing being checked cannot reach:

| The check a reader would have made | Why re-running CI does not make it | Where it is made instead |
|---|---|---|
| Does this test actually prove the fix? | The test arrived with the fix and they pass together | **`guard.yml`** rewinds the tree to the base commit, keeps only the new tests, and runs them. They must be **red** there. |
| Did it widen what it is allowed to change? | The diff includes the file that says what it may change | **`guard.yml`** — `.github/**` and package manifests are forbidden to the agent in every repository, whatever the config says. |
| Did anything that is not a model agree to this? | The reviewer is the same kind of thing as the author | **`review.yml`** decides the merge in the shell, on an approval that still sits at the head CI tested, with no vetoing label. |
| Is this shipping because it is good, or because nobody has complained yet? | Silence and a broken error pipeline produce identical evidence | **`promote.yml`** requires a soak window, a green tip, no error report naming a build in the range, and a canary proving the report pipeline is still alive. |

None of the four is sufficient alone, and that is the argument for the set. A proved test says
nothing about whether the same change rewrote the rules it is judged by. A clean guard says nothing
about who agreed to merge. An approved merge says nothing about whether what it merged into is fit
to release. Together they say one sentence that no single check says: *this diff was proved, did
not widen its own permissions, was agreed to by something that is not a model, and has since sat in
front of real users without complaint.*

## Proving the fix — `guard.yml`

> Enforced in CI rather than in the agent's prompt: a prompt can be talked out of a rule, a check
> cannot. — [`src/guard.ts:7`](src/guard.ts)

That sentence is the whole design. Everything a well-behaved agent would do anyway is a rule a
badly-behaved one can be argued out of, so none of it lives in the prompt.

**The test must have been red.** A fix and its test arriving together prove nothing: the test may
assert what the code now does rather than what it should do, and it passes either way. So the guard
restores the base commit over the whole tree *except* the new tests, runs each owning app's suite,
and requires a failure. A test that passes without its fix is not evidence of the fix; it is
decoration, and this is the only check here that can tell the difference. It restores `HEAD` in a
`finally` and removes only paths git tracks, so untracked local work survives a run.

**A bump is exempt; a bug fix is not.** A dependency repair is proven by CI going green on the bump
itself — that *is* the witness. A bug fix has no such witness, which is why it, and only it, fails
outright for bringing no test. Not "its proof is skipped": it fails.

**The allow-list is inverse.** A dependency bot's whole job is manifests and workflow pins, so
those are the only paths it may touch; anything else is not a bump, including paths the agent is
free to edit. The agent gets the opposite treatment: `.github/**`, `package.json` and
`package-lock.json` are forbidden to it unconditionally. A change to `.github/**` rewrites the
rules the agent is judged by, and is never the agent's to make — which is precisely the rule a
prompt would be most useful for talking its way out of.

**A disabled test is a deleted test.** `.skip`, `.only`, `.todo`, `xit(`, `xdescribe(` added to a
test file, a test file deleted, or assertions removed from one that already existed — all fail the
guard. An agent that can quiet the suite can pass every other check in this list.

Also checked: a cap on the agent's diff size, and your own `forbidden` globs. The full contract is
in [ARCHITECTURE.md](ARCHITECTURE.md).

Applicability is an input (`authors`, `skip-branch-prefixes`), never a job-level `if:`. A job
skipped by an `if:` reports SKIPPED, and a *required* check that reports SKIPPED blocks the merge
forever — so the guard always runs and decides for itself whether it has anything to say.

## Deciding the merge — `review.yml`

A model writes the review. The shell decides the merge, and the two are not the same step. The
merge step re-reads the pull request from the API and requires that the head is still the SHA CI
tested, that an approval matching `reviewer-pattern` sits at that head, and that no `hold-labels`
label is present. A review that approved, and a head that has moved since, is not an approval of
what would merge.

Moving that decision into the prompt is the one change this repository will not take.

Without an App id the merge is skipped entirely, because a merge nobody can attribute is worse than
one that did not happen. An unconfident verdict takes a third path: the reviewer labels the pull
request for a human and stops.

**`retarget-base`** exists for a failure that is otherwise silent. A security update is *always*
raised against the default branch, whatever `dependabot.yml` says. In a repository that promotes
its integration branch to the default branch whole, merging a bump at the default branch diverges
the very branch that is supposed to receive it — and nothing announces this until the next
promotion conflicts. So a bot's pull request raised against the default branch is moved onto the
integration branch before it is reviewed. The default branch is asked of the API rather than read
off `github.event`, whose shape depends on the caller's trigger: an absent property interpolates to
the empty string, and every base would then look like the default branch.

It triggers from `workflow_run`, not from inside CI. A job that waits on the checks of the run it
belongs to is waiting on itself, and the pull request never merges.

## Earning the release — `promote.yml`

A soak window is a claim that time in front of users is evidence. It is — but only if you would
have heard about it. **"No errors reported" and "the error reporter is down" are the same
observation**, and a gate that cannot tell them apart promotes on the second one:

> Checked BEFORE the reports below, because it decides what their absence means: a dead sink and a
> clean week are the same empty list, and a gate that cannot tell them apart promotes on the first
> one. — [`src/promotion-gate.ts:24`](src/promotion-gate.ts)

So a caller can nominate a **canary**: a labelled issue in the report repository whose last update
proves the pipeline is alive. Stale beyond `canary-max-age-hours`, or never updated at all, and the
promotion is blocked with the reason spelled out — *a quiet soak is not evidence*. A caller with no
error pipeline leaves the input empty and gets no liveness check, which is the right answer for
that repository rather than a check that always passes.

The other blockers are ordinary: the head tip has to be older than `soak-hours`, CI has to be green
on it, and no error report may name a build inside the range being promoted.

`keep-paths` covers files the base branch owns and the head branch must not overwrite — a
production config that legitimately differs. They are restored from the base *in* the promotion
pull request rather than excluded from the merge, so the diff a person reads is the diff that
lands.

This is the half of the repository with the least production history. See below.

## Noticing the silence — `notify-failure.yml`

An unattended workflow fails unattended. The obvious fix — file an issue — produces an inbox that
files the same issue nightly and is therefore read by nobody, which is the same outcome as filing
nothing.

So the first failure of a given title opens an issue and every recurrence comments on it. One
thread per broken thing, carrying its own history, closing when it is fixed. This is the cheapest
workflow here and the one with the most observable record.

## What it has actually caught

The first commit here is 2026-09-20. The first time another repository called it was 2026-09-21.
Everything below happened inside **25 hours**, and nothing below is a trend.

| | |
|---|---|
| Caller repositories, across 3 owners | **5** (15 workflow files), plus this one calling itself |
| Workflow runs since wiring | **372** |
| Bot pull requests the guard actually evaluated | **8** |
| …of those, blocked | **2** |
| Pull requests approved and merged with no human in the path | **7** |
| Failure issues filed | **4**, from **7** filings |
| Promotion pull requests opened | **0** |

The two blocks were dependency bumps that reached into WebAuthn credential code and a unit test —
outside the blast radius a bump declares. Both are still open. The four issues came from seven
filings because three recurrences became comments on an existing thread, which is the dedupe above,
observable in the timestamps.

Three things the table would otherwise let you believe:

- **Most guard "successes" are nothing.** The job gates on `authors` at the step level, so on a
  human pull request it runs, exits immediately, and reports success. Forty-six executions in the
  largest caller; eight real evaluations. Any count that does not separate bot from human
  overstates this by roughly 13×.
- **The promotion half has never fired in production.** Nine soak-gate runs, nine times the
  pull-request step was skipped. Every promotion branch in every caller was raised by a person.
- **The reviewer itself broke three times in thirty-eight attempts on its first day** — two action
  failures and a checkout failure. Which is the argument for `notify-failure.yml`, and is how three
  of those four issues got filed.

The expensive check is the base-commit re-run, and it is the one the whole argument rests on: that
a test which passes without its fix is worth failing a build over. **It has not yet fired in
anger.** Every block so far has been a path violation, which is the cheap check. Until the rewind
rejects something real, what is above is an argument, not a result.

Not claimed, because nothing here measures it: time saved, review latency, cost, pull requests per
hour. Nor that either blocked bump was actually harmful — only that it was out of bounds.

## On the name

**Pedalion** (πηδάλιον) is the steering-oar of an ancient ship: the blade over the stern, not the
hand on it. It names the part and not the pilot, which is the design position rather than a
flourish — your repository holds the helm. Every policy arrives as a `with:` input, a named
`secrets:` input, or your own `.github/autopilot.json`. Nothing here knows who is calling it, and
`scripts/no-entity-leak.sh` is a required check that fails the build if that stops being true.

Its one famous prior use is *The Rudder* (Πηδάλιον), the 1800 Greek Orthodox canon collection,
which also gives it "the authority you steer by".

Cost accepted: no outsider guesses it, so the name needs a one-line gloss wherever it is pinned.
Callers pin by SHA, so the name is read by people, not machines.

## Two things that bite silently

**`secrets: inherit` does not cross owners**, and `vars.*` are not inherited by a called workflow.
Every secret here is a named input and `mode` is an input too: your caller reads its own variable
and tells these workflows the answer. A workflow that read `vars.AUTOPILOT` itself would read an
empty string in every caller outside its own owner, and silently do nothing.

**A change here reaches nobody until a pin moves.** Callers pin a full commit SHA, so releasing is
not deploying — the bump arrives later as an ordinary Dependabot pull request and goes through the
caller's own gate, guard included. Which is also why a renamed input breaks people not today but on
the bump they had no reason to read carefully.

Copy CI into five repositories instead and you have five copies that disagree within a month. A
caller here is about ten lines with no logic in it, so a diff across repositories stays legible.
[USAGE.md](USAGE.md) has those ten lines; [REFERENCE.md](REFERENCE.md) has every input.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — how to run the suite and why a workflow input is a public
API — and [ARCHITECTURE.md](ARCHITECTURE.md) for the contract behind these workflows, including the
designs that look like bugs and are deliberate. [CHANGELOG.md](CHANGELOG.md) is what moving a pin
gets you. [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies here. Vulnerabilities go through
[SECURITY.md](SECURITY.md), not a public issue.

MIT licensed.
