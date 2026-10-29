import { flattenEntries, type FlatEntry } from "./entries.js";
import { countOps, diffLines, type DiffLine } from "./linediff.js";
import { renderScVal, shortAddress, type RenderOptions } from "./scval.js";
import { isObject, type AuthInvocation, type Json, type TestSnapshot } from "./snapshot.js";

export const REPORT_SCHEMA_VERSION = 1;

export type StorageChangeKind = "added" | "removed" | "changed" | "ttl";

export interface StorageChange {
  kind: StorageChangeKind;
  id: string;
  entryKind: FlatEntry["kind"];
  durability?: string;
  owner?: string;
  label: string;
  before?: { value: string; liveUntil: number | null };
  after?: { value: string; liveUntil: number | null };
}

export interface EnvChange {
  field: string;
  before: string;
  after: string;
}

export type TestStatus = "added" | "removed" | "changed" | "error";

export interface TestDiff {
  /** Snapshot path relative to the scanned root, using `/` separators. */
  path: string;
  /** Name of the directory that contains `test_snapshots/` (usually the crate). */
  crate: string;
  /** `module::test` plus `#n` when a test created more than one `Env`. */
  name: string;
  status: TestStatus;
  storage: StorageChange[];
  events: DiffLine[];
  auth: DiffLine[];
  env: EnvChange[];
  /** Number of hidden noise changes (auth nonce entries). */
  hiddenNoise: number;
  /** For added/removed tests: size of the snapshot that exists. */
  size?: { entries: number; events: number; calls: number };
  error?: string;
}

export interface Report {
  schemaVersion: number;
  base: string;
  head: string;
  tests: TestDiff[];
  unchanged: number;
  totals: {
    changed: number;
    added: number;
    removed: number;
    errors: number;
    storage: number;
    ttl: number;
    events: number;
    auth: number;
    env: number;
  };
}

export interface DiffOptions extends RenderOptions {
  /** Include auth nonce ledger entries (hidden by default; they change whenever auth changes). */
  includeNonces?: boolean;
}

/** Diffs two parsed snapshots of the same test. */
export function diffSnapshots(
  before: TestSnapshot,
  after: TestSnapshot,
  opts: DiffOptions = {},
): Pick<TestDiff, "storage" | "events" | "auth" | "env" | "hiddenNoise"> {
  const { storage, hiddenNoise } = diffStorage(before, after, opts);
  return {
    storage,
    hiddenNoise,
    events: diffLines(eventLines(before, opts), eventLines(after, opts)),
    auth: diffLines(authLines(before, opts), authLines(after, opts)),
    env: diffEnv(before, after),
  };
}

export function hasChanges(d: Pick<TestDiff, "storage" | "events" | "auth" | "env">): boolean {
  return (
    d.storage.length > 0 ||
    d.env.length > 0 ||
    d.events.some((l) => l.op !== " ") ||
    d.auth.some((l) => l.op !== " ")
  );
}

function diffStorage(
  before: TestSnapshot,
  after: TestSnapshot,
  opts: DiffOptions,
): { storage: StorageChange[]; hiddenNoise: number } {
  const b = flattenEntries(before.ledger.ledger_entries, opts);
  const a = flattenEntries(after.ledger.ledger_entries, opts);
  const changes: StorageChange[] = [];
  let hiddenNoise = 0;

  const push = (c: StorageChange, entry: FlatEntry) => {
    if (entry.noise && !opts.includeNonces) {
      hiddenNoise++;
      return;
    }
    changes.push(c);
  };
  const base = (e: FlatEntry) => ({
    id: e.id,
    entryKind: e.kind,
    label: e.label,
    ...(e.durability !== undefined ? { durability: e.durability } : {}),
    ...(e.owner !== undefined ? { owner: e.owner } : {}),
  });

  for (const [id, eb] of b) {
    const ea = a.get(id);
    if (!ea) {
      push({ kind: "removed", ...base(eb), before: { value: eb.value, liveUntil: eb.liveUntil } }, eb);
      continue;
    }
    const valueChanged = eb.valueId !== ea.valueId;
    const ttlChanged = eb.liveUntil !== ea.liveUntil;
    if (!valueChanged && !ttlChanged) continue;
    push(
      {
        kind: valueChanged ? "changed" : "ttl",
        ...base(ea),
        before: { value: eb.value, liveUntil: eb.liveUntil },
        after: { value: ea.value, liveUntil: ea.liveUntil },
      },
      ea,
    );
  }
  for (const [id, ea] of a) {
    if (b.has(id)) continue;
    push({ kind: "added", ...base(ea), after: { value: ea.value, liveUntil: ea.liveUntil } }, ea);
  }
  changes.sort(compareChanges);
  return { storage: changes, hiddenNoise };
}

const KIND_ORDER: Record<StorageChangeKind, number> = { changed: 0, added: 1, removed: 2, ttl: 3 };

function compareChanges(x: StorageChange, y: StorageChange): number {
  return (
    KIND_ORDER[x.kind] - KIND_ORDER[y.kind] ||
    (x.owner ?? "").localeCompare(y.owner ?? "") ||
    x.label.localeCompare(y.label)
  );
}

const ENV_FIELDS = [
  "protocol_version",
  "sequence_number",
  "timestamp",
  "network_id",
  "base_reserve",
  "min_persistent_entry_ttl",
  "min_temp_entry_ttl",
  "max_entry_ttl",
] as const;

function diffEnv(before: TestSnapshot, after: TestSnapshot): EnvChange[] {
  const out: EnvChange[] = [];
  for (const f of ENV_FIELDS) {
    const vb = before.ledger[f];
    const va = after.ledger[f];
    if (vb === undefined && va === undefined) continue;
    if (vb !== va) out.push({ field: f, before: String(vb ?? "—"), after: String(va ?? "—") });
  }
  return out;
}

/** One line per event: `CAAA…ITA4: deposited(CAAA…K3IM) → {amount: 250i128}`. */
export function eventLines(s: TestSnapshot, opts: RenderOptions = {}): string[] {
  return s.events.map((e) => {
    const ev = e.event ?? {};
    const contract = ev.contract_id ? shortAddress(ev.contract_id, opts) : "(no contract)";
    const v0 = ev.body?.v0;
    let body: string;
    if (v0 && Array.isArray(v0.topics)) {
      const [first, ...rest] = v0.topics;
      const name =
        first !== undefined && isObject(first) && "symbol" in first
          ? String(first["symbol"])
          : first !== undefined
            ? renderScVal(first, opts)
            : "(no topics)";
      const args = rest.length > 0 ? `(${rest.map((t) => renderScVal(t, opts)).join(", ")})` : "";
      body = `${name}${args} → ${renderScVal(v0.data, opts)}`;
    } else {
      body = renderScVal((ev.body ?? null) as Json, opts);
    }
    const type = ev.type && ev.type !== "contract" ? ` [${ev.type}]` : "";
    const failed = e.failed_call ? " (failed call)" : "";
    return `${contract}: ${body}${type}${failed}`;
  });
}

/**
 * Auth trees, one block per top-level call that required auth:
 * `CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 100i128)`, with
 * sub-invocations indented below. Calls that required no auth produce no
 * lines, so inserting an unrelated read-only call does not shift the diff.
 */
export function authLines(s: TestSnapshot, opts: RenderOptions = {}): string[] {
  const lines: string[] = [];
  for (const call of s.auth) {
    if (!Array.isArray(call)) continue;
    for (const entry of call) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [address, tree] = entry;
      lines.push(`${shortAddress(String(address), opts)} authorized ${renderInvocation(tree, opts)}`);
      pushSubInvocations(lines, tree, 1, opts);
    }
  }
  return lines;
}

function pushSubInvocations(lines: string[], node: AuthInvocation, depth: number, opts: RenderOptions) {
  for (const sub of node?.sub_invocations ?? []) {
    lines.push(`${"  ".repeat(depth)}└ ${renderInvocation(sub, opts)}`);
    pushSubInvocations(lines, sub, depth + 1, opts);
  }
}

function renderInvocation(node: AuthInvocation, opts: RenderOptions): string {
  const fn = node?.function;
  if (isObject(fn) && isObject(fn["contract_fn"])) {
    const c = fn["contract_fn"];
    const args = Array.isArray(c["args"]) ? c["args"] : [];
    return `${shortAddress(String(c["contract_address"]), opts)}.${String(c["function_name"])}(${args
      .map((a) => renderScVal(a, opts))
      .join(", ")})`;
  }
  if (isObject(fn)) {
    const tag = Object.keys(fn)[0] ?? "function";
    return `${tag}(…)`; // e.g. create_contract_host_fn
  }
  return renderScVal((fn ?? null) as Json, opts);
}

/** Counts of each kind of change across a list of storage changes. */
export function storageCounts(changes: StorageChange[]): Record<StorageChangeKind, number> {
  const out: Record<StorageChangeKind, number> = { added: 0, removed: 0, changed: 0, ttl: 0 };
  for (const c of changes) out[c.kind]++;
  // A value change that also moved the TTL counts as a TTL change too.
  for (const c of changes) {
    if (c.kind !== "ttl" && c.before && c.after && c.before.liveUntil !== c.after.liveUntil) out.ttl++;
  }
  return out;
}

export function summarize(tests: TestDiff[], unchanged: number, base: string, head: string): Report {
  const totals = { changed: 0, added: 0, removed: 0, errors: 0, storage: 0, ttl: 0, events: 0, auth: 0, env: 0 };
  for (const t of tests) {
    if (t.status === "changed") totals.changed++;
    else if (t.status === "added") totals.added++;
    else if (t.status === "removed") totals.removed++;
    else totals.errors++;
    if (t.status !== "changed") continue;
    const sc = storageCounts(t.storage);
    if (sc.added + sc.removed + sc.changed > 0) totals.storage++;
    if (sc.ttl > 0) totals.ttl++;
    if (countChanged(t.events)) totals.events++;
    if (countChanged(t.auth)) totals.auth++;
    if (t.env.length > 0) totals.env++;
  }
  return { schemaVersion: REPORT_SCHEMA_VERSION, base, head, tests, unchanged, totals };
}

function countChanged(lines: DiffLine[]): boolean {
  const { added, removed } = countOps(lines);
  return added + removed > 0;
}
