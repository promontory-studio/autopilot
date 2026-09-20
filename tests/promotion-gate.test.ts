import { describe, expect, it } from "vitest";
import { buildsNamedIn, promotionBlockers, type Soak } from "../src/promotion-gate";

const HOUR = 3_600_000;
const now = Date.parse("2026-01-10T00:00:00Z");

// A soak that should promote. Every case below changes exactly one thing about it.
const clean: Soak = {
  range: ["aaaaaaa1", "aaaaaaa2"],
  tipTime: now - 30 * HOUR,
  now,
  soakHours: 24,
  ciGreen: true,
  reportedBuilds: [],
  canaryAt: now - 1 * HOUR,
  canaryMaxAgeHours: 8,
};

describe("promotionBlockers", () => {
  it("promotes a soak that has nothing wrong with it", () => {
    expect(promotionBlockers(clean)).toEqual([]);
  });

  it("refuses when there is nothing to promote, and says only that", () => {
    expect(promotionBlockers({ ...clean, range: [], ciGreen: false })).toEqual(["the head branch has nothing the base lacks"]);
  });

  it("refuses a tip that has not soaked", () => {
    expect(promotionBlockers({ ...clean, tipTime: now - 5 * HOUR })).toEqual(["head tip is 5h old; soak is 24h"]);
  });

  it("refuses a red tip", () => {
    expect(promotionBlockers({ ...clean, ciGreen: false })).toEqual(["CI is not green on the head tip"]);
  });

  it("refuses when the pipeline has never proved itself alive", () => {
    expect(promotionBlockers({ ...clean, canaryAt: null })).toEqual([
      "the error pipeline has never proved itself alive; a quiet soak is not evidence",
    ]);
  });

  it("refuses when the pipeline went quiet, because silence then means nothing", () => {
    expect(promotionBlockers({ ...clean, canaryAt: now - 9 * HOUR })).toEqual([
      "the error pipeline last proved itself alive 9h ago; a quiet soak is not evidence",
    ]);
  });

  it("skips the liveness check for a caller with no pipeline at all", () => {
    expect(promotionBlockers({ ...clean, canaryAt: undefined })).toEqual([]);
  });

  it("refuses when a report names a build in the range, matching a short SHA against a long one", () => {
    expect(promotionBlockers({ ...clean, reportedBuilds: ["aaaaaaa1"] })).toEqual(["error reported from build aaaaaaa1, which is in the range"]);
    expect(promotionBlockers({ ...clean, reportedBuilds: ["bbbbbbb9"] })).toEqual([]);
  });

  it("reports each offending build once, however many reports named it", () => {
    expect(promotionBlockers({ ...clean, reportedBuilds: ["aaaaaaa1", "aaaaaaa1"] })).toHaveLength(1);
  });
});

describe("buildsNamedIn", () => {
  it("finds the SHAs a report attributes to this repository, and no others", () => {
    const bodies = ["Build: owner/thing@abc1234 broke", "Build: other/thing@def5678"];
    expect(buildsNamedIn(bodies, "owner/thing")).toEqual(["abc1234"]);
  });

  it("does not let a repository name containing regex characters match the wrong thing", () => {
    expect(buildsNamedIn(["a.c/d@abc1234"], "a+c/d")).toEqual([]);
  });
});
