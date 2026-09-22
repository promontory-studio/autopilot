---
name: Bug report
about: A workflow here isn't behaving as documented
title: ""
labels: bug
---

**Describe the bug**
A clear description of what's wrong, and which workflow or action is involved (`guard.yml`,
`review.yml`, `promote.yml`, `notify-failure.yml`, `setup-node-ci`, or `codeql-scan`).

**To reproduce**
The calling job, trimmed to the smallest version that still shows it — the `uses:` line, its
`with:` inputs, and the permissions the caller grants.

**Expected behavior**
What you expected to happen instead.

**Where it ran**
- Pinned SHA (the `@...` on your `uses:` line):
- Runner (`ubuntu-latest`, self-hosted, …):
- A link to the failing run, if it is public:

**Is this a security vulnerability?**
If this is a way to get a change past `guard.yml` or `review.yml` without a human deciding to let
it, **do not** file it here — see [SECURITY.md](../../SECURITY.md) for private disclosure instead.
