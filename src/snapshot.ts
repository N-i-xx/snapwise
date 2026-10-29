/**
 * Types for the JSON test snapshots written by the Soroban Rust SDK
 * (`test_snapshots/<module>/<test>.<n>.json`).
 *
 * The shapes come from files generated with soroban-sdk 29.0.1. They mirror
 * the `serde` JSON form of the Stellar XDR types, so most fields are left
 * loosely typed: Snapwise only needs a handful of them and must tolerate
 * fields being added in future SDK versions.
 */

/** Any JSON value. ScVal and XDR structures are kept in this raw form. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One authorized invocation tree node, as recorded by the test host. */
export interface AuthInvocation {
  function: Json;
  sub_invocations: AuthInvocation[];
}

/** `[address, invocation]` pairs recorded for one top-level call. */
export type AuthEntry = [string, AuthInvocation];

export interface LedgerEntryWithTtl {
  entry: {
    last_modified_ledger_seq?: number;
    data: { [entryType: string]: Json };
    ext?: Json;
  };
  /** Ledger up to which the entry is live; `null` for entries without a TTL (accounts, trustlines). */
  live_until: number | null;
}

export interface SnapshotLedger {
  protocol_version?: number;
  sequence_number?: number;
  timestamp?: number;
  network_id?: string;
  base_reserve?: number;
  min_persistent_entry_ttl?: number;
  min_temp_entry_ttl?: number;
  max_entry_ttl?: number;
  ledger_entries: LedgerEntryWithTtl[];
}

export interface SnapshotEvent {
  event: {
    contract_id?: string | null;
    type?: string;
    body?: { v0?: { topics: Json[]; data: Json } } & { [k: string]: Json };
    ext?: Json;
  };
  failed_call?: boolean;
}

export interface TestSnapshot {
  generators?: Json;
  /** One element per top-level invocation made in the test, in order. */
  auth: AuthEntry[][];
  ledger: SnapshotLedger;
  /** Events of the **last** top-level invocation only (SDK behaviour). */
  events: SnapshotEvent[];
}

export class SnapshotParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "SnapshotParseError";
  }
}

/**
 * Parses and minimally validates a snapshot file. Unknown extra fields are
 * kept; missing optional sections default to empty so older or newer SDK
 * versions still diff cleanly.
 */
export function parseSnapshot(text: string, path = "<snapshot>"): TestSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new SnapshotParseError(path, `invalid JSON (${(err as Error).message})`);
  }
  if (!isObject(raw)) throw new SnapshotParseError(path, "expected a JSON object");
  const ledger = raw["ledger"];
  if (!isObject(ledger) || !Array.isArray(ledger["ledger_entries"])) {
    throw new SnapshotParseError(path, "missing ledger.ledger_entries; is this a Soroban test snapshot?");
  }
  return {
    generators: (raw["generators"] as Json) ?? null,
    auth: Array.isArray(raw["auth"]) ? (raw["auth"] as unknown as AuthEntry[][]) : [],
    ledger: ledger as unknown as SnapshotLedger,
    events: Array.isArray(raw["events"]) ? (raw["events"] as unknown as SnapshotEvent[]) : [],
  };
}

/** An empty snapshot, used as the "other side" when a test is added or removed. */
export function emptySnapshot(): TestSnapshot {
  return { auth: [], ledger: { ledger_entries: [] }, events: [] };
}

export function isObject(v: unknown): v is { [key: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
