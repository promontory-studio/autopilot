import { describe, expect, it } from "vitest";
import { buildsNamedIn, promotionBlockers, type Report, reportedBodies, type Soak } from "../src/promotion-gate";

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

// One open report naming a build, the shape the gate is fed. Every case below changes one thing.
const report = (over: Partial<Report> = {}): Report => ({ number: 1, state: "open", body: "owner/thing@abc1234", ...over });
const noComments = () => [];

describe("reportedBodies", () => {
  it("counts an open report's body", () => {
    expect(reportedBodies([report()], noComments)).toEqual(["owner/thing@abc1234"]);
  });

  it("does not count a closed report, whose closing is what keeps it in the since window", () => {
    expect(reportedBodies([report({ state: "closed" })], noComments)).toEqual([]);
  });

  it("does not count a pull request, which the issues endpoint returns too", () => {
    expect(reportedBodies([report({ pull_request: { url: "…" } })], noComments)).toEqual([]);
  });

  it("counts a comment on an open report, because a recurrence arrives as one", () => {
    expect(reportedBodies([report({ body: "" })], () => [{ body: "owner/thing@def5678" }])).toEqual(["", "owner/thing@def5678"]);
  });

  it("does not count a comment on a closed report", () => {
    expect(reportedBodies([report({ state: "closed" })], () => [{ body: "owner/thing@def5678" }])).toEqual([]);
  });

  it("does not read the comments of a report that cannot block", () => {
    const asked: number[] = [];
    reportedBodies([report({ number: 1 }), report({ number: 2, state: "closed" }), report({ number: 3, pull_request: {} })], (n) => {
      asked.push(n);
      return [];
    });
    expect(asked).toEqual([1]);
  });

  it("reads a missing body as empty text", () => {
    expect(reportedBodies([report({ body: null })], noComments)).toEqual([""]);
  });
});

describe("the gate a report actually passes through", () => {
  const gate = (reports: Report[]) =>
    promotionBlockers({ ...clean, range: ["abc1234def"], reportedBuilds: buildsNamedIn(reportedBodies(reports, noComments), "owner/thing") });

  it("blocks on an open report naming a build in the range", () => {
    expect(gate([report()])).toEqual(["error reported from build abc1234, which is in the range"]);
  });

  it("stops blocking once the report is closed, so the promotion that fixes it can go out", () => {
    expect(gate([report({ state: "closed" })])).toEqual([]);
  });
});
