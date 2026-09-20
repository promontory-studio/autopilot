// A path glob, not a filesystem one: callers describe forbidden paths as `apps/*/wrangler.jsonc`,
// and the guard matches those strings against git output. Node has no string glob, and pulling in
// a matcher for twelve lines of behaviour is a dependency this does not need.
//
// `*` stops at a separator, `**` crosses them, `?` is one non-separator character.
export function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // `a/**/b` must also match `a/b`, so the slash is eaten with the stars.
        const slash = pattern[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export const matchesAny = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((p) => globToRegExp(p).test(path));
