## What changed and why

## Checklist

- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md), and if this changes a workflow input — its name,
      whether it is required, or its default — said so above and kept the old name working.
- [ ] `npm test` and `npm run typecheck` pass locally.
- [ ] `./scripts/no-entity-leak.sh` passes locally.
- [ ] If this "fixes" one of the deliberate designs in CONTRIBUTING.md — applicability as an input
      rather than a job-level `if:`, `workflow_run` rather than an in-CI wait, named secrets and
      `mode` as an input, the shell rather than the model deciding the merge — argued with the
      reason rather than only changing the code.
- [ ] A changed input is documented in the README.
