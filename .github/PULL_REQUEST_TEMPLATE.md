## What changed and why

## Checklist

- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md), and if this changes a workflow input — its name,
      whether it is required, or its default — said so above and kept the old name working.
- [ ] `npm test` and `npm run typecheck` pass locally.
- [ ] `./scripts/no-entity-leak.sh` and `./scripts/no-entity-leak.test.sh` pass locally.
- [ ] If this "fixes" one of the deliberate designs in
      [ARCHITECTURE.md](../ARCHITECTURE.md#5-four-things-that-look-like-bugs), argued with the
      reason rather than only changing the code.
- [ ] A changed input is documented in the README's **Reference: every input**.
- [ ] Anything a caller would notice has an entry under `[Unreleased]` in
      [CHANGELOG.md](../CHANGELOG.md).
