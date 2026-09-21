import { readFileSync } from "node:fs";

// The one thing this repo reads *about* a caller. Everything else crosses the boundary as a
// workflow input, so a caller can be any repository that can write this file.
export type App = {
  path: string;
  tests: string[];
  unitTests: string[];
  run: string[];
};

export type Config = {
  agentAuthor: string;
  botAuthor: string;
  maxLines: number;
  forbidden: string[];
  apps: App[];
};

const DEFAULTS = { botAuthor: "dependabot[bot]", maxLines: 400, forbidden: [] as string[], apps: [] as App[] };

// Thrown rather than defaulted: a config that does not parse must stop the run, because every
// default here is "allow", and silently allowing is the failure this guard exists to prevent.
export function parseConfig(text: string): Config {
  const raw = JSON.parse(text) as Partial<Config>;
  if (typeof raw.agentAuthor !== "string" || !raw.agentAuthor)
    throw new Error("autopilot config: `agentAuthor` is required (the commit author name the agent pushes as)");
  const apps = (raw.apps ?? DEFAULTS.apps).map((a, i) => {
    if (typeof a.path !== "string") throw new Error(`autopilot config: apps[${i}].path is required`);
    if (!a.run?.length) throw new Error(`autopilot config: apps[${i}].run is required (argv to run this app's tests)`);
    // "" and "." both mean the repository root — a single-package repository is an app whose path
    // is nothing, and every path below is then already app-relative.
    return { path: a.path.replace(/^\.$/, "").replace(/\/$/, ""), tests: a.tests ?? [], unitTests: a.unitTests ?? [], run: a.run };
  });
  return { ...DEFAULTS, ...raw, agentAuthor: raw.agentAuthor, apps };
}

export const loadConfig = (path: string): Config => parseConfig(readFileSync(path, "utf8"));

// Test globs are written relative to the app, because that is how a reader thinks about them,
// and matched against repo-relative git paths.
export const within = (app: App, globs: string[]): string[] => (app.path ? globs.map((g) => `${app.path}/${g}`) : globs);

export const dirOf = (repo: string, app: App): string => (app.path ? `${repo}/${app.path}` : repo);

export const relativeTo = (app: App, path: string): string => (app.path ? path.slice(app.path.length + 1) : path);
