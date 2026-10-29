import { storageCounts, testLabel, type Report } from "./diff.js";
import { countOps } from "./linediff.js";

/** Categories that `--fail-on` / the `fail-on` input can name. */
export const FAIL_CATEGORIES = [
  "any",
  "auth",
  "storage",
  "ttl",
  "events",
  "env",
  "added",
  "removed",
  "error",
] as const;
export type FailCategory = (typeof FAIL_CATEGORIES)[number];

export function parseFailOn(input: string | undefined): FailCategory[] {
  if (!input) return [];
  const out: FailCategory[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const v = raw.trim().toLowerCase();
    if (!v || v === "none") continue;
    if (!(FAIL_CATEGORIES as readonly string[]).includes(v)) {
      throw new Error(
        `Unknown fail-on category "${raw}". Use one or more of: none, ${FAIL_CATEGORIES.join(", ")}.`,
      );
    }
    out.push(v as FailCategory);
  }
  return out;
}

/**
 * Returns human-readable reasons the report violates the policy; an empty
 * list means it passes.
 */
export function evaluatePolicy(report: Report, failOn: FailCategory[]): string[] {
  if (failOn.length === 0) return [];
  const want = new Set(failOn);
  const reasons: string[] = [];
  for (const t of report.tests) {
    const name = testLabel(t);
    const hit = (cat: FailCategory, why: string) => {
      if (want.has(cat) || want.has("any")) reasons.push(`${name}: ${why}`);
    };
    if (t.status === "error") hit("error", "snapshot could not be read");
    if (t.status === "added") hit("added", "new snapshot");
    if (t.status === "removed") hit("removed", "snapshot deleted");
    if (t.status !== "changed") continue;
    const sc = storageCounts(t.storage);
    if (sc.added + sc.removed + sc.changed > 0) hit("storage", "storage changed");
    if (sc.ttl > 0) hit("ttl", "entry TTLs changed");
    const ev = countOps(t.events);
    if (ev.added + ev.removed > 0) hit("events", "events changed");
    const au = countOps(t.auth);
    if (au.added + au.removed > 0) hit("auth", "authorization changed");
    if (t.env.length > 0) hit("env", "ledger settings changed");
  }
  return reasons;
}
