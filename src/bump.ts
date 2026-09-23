export type Commit = { author: string; verified: boolean; message: string };

export type Bump = {
  commits: Commit[];
  // The pull request's author. Every commit on the branch must be theirs, and verified.
  author: string;
  branch: string;
  // Dependabot update types a model need not look at, e.g. `["minor", "patch"]`.
  noReviewTypes: string[];
  // Head-branch prefixes whose bumps need no model whatever the update type, e.g. an ecosystem
  // whose whole diff is a pinned SHA.
  noReviewBranchPrefixes: string[];
};

// Dependabot writes this block into every commit body, one entry per dependency, which is what
// makes a grouped bump readable: the riskiest entry decides. The commit is signed, so unlike a
// branch name or a title it cannot be forged by pushing a lookalike branch.
const UPDATE_TYPE = /^\s*update-type:\s*version-update:semver-(\w+)\s*$/gm;

const typesIn = (commits: Commit[]): string[] => commits.flatMap((c) => [...c.message.matchAll(UPDATE_TYPE)].map((m) => m[1]!));

// The reason a model must look at this pull request, or null when nothing here needs judgement.
// Every unknown is a reason: the absence of metadata is not evidence that there is nothing to see.
export function reviewReason({ commits, author, branch, noReviewTypes, noReviewBranchPrefixes }: Bump): string | null {
  // First, and ahead of the prefix exemption: a repaired bump carries an agent's hand-written
  // migration code on the bot's branch, and that is exactly what a review is for.
  const foreign = commits.find((c) => c.author !== author || !c.verified);
  if (foreign) return `the branch carries a commit that is not ${author}'s own signed work`;

  if (noReviewBranchPrefixes.some((p) => p && branch.startsWith(p))) return null;

  const types = typesIn(commits);
  if (!types.length) return "no dependency update metadata to judge it by";

  const risky = types.find((t) => !noReviewTypes.includes(t));
  return risky ? `a semver-${risky} bump` : null;
}
