import { describe, expect, it } from "vitest";
import { type Bump, type Commit, reviewReason } from "../src/bump";

const body = (...types: string[]) =>
  ["Bumps a thing.", "", "updated-dependencies:", ...types.map((t) => `- dependency-name: thing\n  update-type: version-update:semver-${t}`), ""].join("\n");

const commit = (over: Partial<Commit> = {}): Commit => ({ author: "bumper[bot]", verified: true, message: body("patch"), ...over });

// A bump nobody needs to look at. Every case below changes exactly one thing about it.
const clean: Bump = {
  commits: [commit()],
  author: "bumper[bot]",
  branch: "bumper/npm/thing-1.2.3",
  noReviewTypes: ["minor", "patch"],
  noReviewBranchPrefixes: ["bumper/actions/"],
};

describe("reviewReason", () => {
  it("lets a patch bump through with no review", () => {
    expect(reviewReason(clean)).toBeNull();
  });

  it("sends a major bump to the review", () => {
    expect(reviewReason({ ...clean, commits: [commit({ message: body("major") })] })).toBe("a semver-major bump");
  });

  it("sends a grouped bump to the review when any one of its dependencies moved a major", () => {
    expect(reviewReason({ ...clean, commits: [commit({ message: body("patch", "minor", "major") })] })).toBe("a semver-major bump");
  });

  it("sends a bump with no metadata to the review, because the absence is not evidence", () => {
    expect(reviewReason({ ...clean, commits: [commit({ message: "Bump a thing" })] })).toBe("no dependency update metadata to judge it by");
  });

  it("sends a branch carrying someone else's commit to the review, which is what a repair is", () => {
    const repair = commit({ author: "agent[bot]", message: "Migrate code for the dependency bump" });
    expect(reviewReason({ ...clean, commits: [commit(), repair] })).toBe("the branch carries a commit that is not bumper[bot]'s own signed work");
  });

  it("sends a branch carrying an unsigned commit to the review", () => {
    expect(reviewReason({ ...clean, commits: [commit({ verified: false })] })).toBe(
      "the branch carries a commit that is not bumper[bot]'s own signed work",
    );
  });

  it("lets an exempt branch through whatever the update type", () => {
    expect(reviewReason({ ...clean, branch: "bumper/actions/thing-4", commits: [commit({ message: body("major") })] })).toBeNull();
  });

  it("does not let an exempt branch excuse a commit that is not the author's", () => {
    expect(reviewReason({ ...clean, branch: "bumper/actions/thing-4", commits: [commit({ author: "agent[bot]" })] })).toBe(
      "the branch carries a commit that is not bumper[bot]'s own signed work",
    );
  });

  it("reviews everything for a caller that named no exemptions at all", () => {
    expect(reviewReason({ ...clean, noReviewTypes: [], noReviewBranchPrefixes: [] })).toBe("a semver-patch bump");
  });
});
