import { execFileSync } from "node:child_process";
import { arg } from "./argv";
import { loadConfig } from "./config";
import { changesSince, isRepair, redOnBase, testsToProve, violations } from "./guard";

const base = arg("base");
if (!base) {
  console.error("usage: guard-main.ts --base <ref> [--repo <path>] [--config <path>]");
  process.exit(2);
}

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: arg("repo") ?? process.cwd(),
  encoding: "utf8",
}).trim();
const config = loadConfig(`${repo}/${arg("config") ?? ".github/autopilot.json"}`);
const changes = changesSince(repo, base, config);
const found = violations(changes, config);

// The repairing bot is exempt from having to prove its tests: it is reconciling someone else's
// bump, and the test that would go red on base is usually not one it wrote.
const tests = testsToProve(changes, config);
const repairing = isRepair(changes, config);
if (!repairing && tests.length && !redOnBase(repo, base, tests, config))
  found.push(`new tests pass without the fix, so they do not prove it: ${tests.join(", ")}`);

if (found.length) {
  console.error(`guard:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`guard: ${changes.length} file changes checked, ok`);
