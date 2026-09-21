#!/usr/bin/env bash
# Proves the check can fail: a clean tree passes, and each planted leak is caught.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pass=0 fail=0
check() {
  local name="$1" expect="$2" dir="$3"
  "$here/no-entity-leak.sh" "$dir" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$expect" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $name (exit $got, wanted $expect)"; fi
}

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

plant() {
  local dir="$scratch/$1"
  mkdir -p "$dir/.github/workflows"
  (cd "$dir" && git init -q && git config user.email t@t && git config user.name t)
  printf '%s\n' "$2" > "$dir/.github/workflows/w.yml"
  (cd "$dir" && git add -A && git commit -qm t)
  echo "$dir"
}

pinned='      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
check "clean tree passes" 0 "$(plant clean "$pinned")"
check "unpinned action fails" 1 "$(plant unpinned '      - uses: actions/checkout@v7')"
check "unvetted owner fails" 1 "$(plant unvetted '      - uses: someone/thing@3d3c42e5aac5ba805825da76410c181273ba90b1')"
check "literal repository fails" 1 "$(plant literal "$pinned
        with:
          repository: someone/thing")"
check "week code fails" 1 "$(plant week "$pinned
# W44 said to do it this way")"
check "private repo name fails" 1 "$(plant estate "$pinned
# see the plover-context checkout for why")"
check "this repository passes" 0 "$here/.."

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
