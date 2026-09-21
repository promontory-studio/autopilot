#!/usr/bin/env bash
# A reusable workflow that knows who calls it is not reusable. This fails the build on anything
# that ties this repository to one particular estate: a hard-coded repository slug, a third-party
# action nobody vetted here, or planning shorthand carried in from a private tree.
#
# Usage: no-entity-leak.sh [dir]   (default: the repository root)
set -uo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$root"

# Owners of the third-party actions this repository pins. Anything else in a `uses:` is either a
# dependency nobody reviewed or a repository belonging to whoever wrote the caller.
ALLOWED_OWNERS="actions github anthropics"

fail=0
report() { fail=1; printf '%s\n' "$1"; }

files() {
  git ls-files -z 2>/dev/null | tr '\0' '\n' | grep -vE '^scripts/no-entity-leak' || true
}

# Planning shorthand: week and sub-phase codes, pointers to documents only the private tree has, and
# the names of the private repositories themselves -- which is how `plover-context` reached .gitignore.
while IFS= read -r f; do
  [ -f "$f" ] || continue
  hits=$(grep -nEI '\b(W[0-9]{2,3}|P[0-9][a-z]?)\b|monorepo|docs/cross-app|extraction plan|\bper doc [0-9]|\bplover[a-z-]*' "$f" || true)
  [ -z "$hits" ] || report "$f: planning reference$(printf '\n  %s' "$hits")"
done < <(files)

# Hard-coded repository slugs. `repository:` and `owner:` must come from an input or the context,
# never from a literal, or the workflow only works for one estate.
while IFS= read -r f; do
  case "$f" in .github/*) ;; *) continue ;; esac
  hits=$(grep -nE '^\s*(repository|owner|repositories):\s*[A-Za-z0-9]' "$f" | grep -v '\${{' || true)
  [ -z "$hits" ] || report "$f: literal repository reference$(printf '\n  %s' "$hits")"
done < <(files)

# Every `uses:` is either local, or a pinned action from a vetted owner.
while IFS= read -r ref; do
  case "$ref" in ./*) continue ;; esac
  owner="${ref%%/*}"
  case " $ALLOWED_OWNERS " in
    *" $owner "*) ;;
    *) report "unvetted action owner in \`uses: $ref\` (allowed: $ALLOWED_OWNERS)" ;;
  esac
  case "$ref" in
    *@????????????????????????????????????????) ;;
    *) report "\`uses: $ref\` is not pinned to a full commit SHA" ;;
  esac
done < <(grep -rhoE '^\s*(- )?uses:\s*\S+' .github 2>/dev/null | sed -E 's/^\s*(- )?uses:\s*//' | sort -u)

[ "$fail" = 0 ] && echo "no entity leak: this repository names nobody's estate but its own callers'."
exit "$fail"
