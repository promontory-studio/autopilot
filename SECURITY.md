# Security policy

## Reporting a vulnerability

Please use GitHub's [private vulnerability reporting](https://github.com/promontory-studio/pedalion-ci/security/advisories/new)
rather than opening a public issue. Include a description of the issue and, if you have one, a
caller workflow that demonstrates it.

We aim to acknowledge reports within 5 business days. There is no bug bounty; this is a
volunteer-maintained project.

## Scope

These workflows are what stands between an automated pull request and a merge, so in scope is
anything that gets a change past them without a human deciding to let it:

- A way for an automated author to touch a forbidden path — `.github/**`, a package manifest, or
  one of the caller's own `forbidden` globs — without `guard.yml` failing.
- A way to weaken or delete a test without `guard.yml` failing, or to satisfy its "the test must
  be red at the base commit" proof with a test that proves nothing.
- A way past the diff cap, or past `authors` / `skip-branch-prefixes`, that makes the guard report
  success having checked nothing.
- A way to make `review.yml` merge on a stale approval, on a head other than the one CI tested,
  or over a vetoing label — the shell re-check exists precisely because the model's approval is
  not the merge decision.
- Anything that lets a called workflow read a secret the caller did not pass it, or exfiltrate one
  it did.

Out of scope: a caller that grants a permission it did not have to (see the Permissions table in
the README — a called job cannot ask for more than the caller gave it), a caller that pins a
branch instead of a SHA, and the model's *judgement* in `review.yml`. The model is allowed to be
wrong; the shell re-check is what must not be.

## Supported versions

There are no releases. Callers pin a full commit SHA, so a fix reaches you when you move the pin —
which arrives as an ordinary dependency-bot pull request. Only `main` receives fixes.
