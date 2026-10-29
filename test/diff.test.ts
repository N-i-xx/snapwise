import { describe, expect, it } from "vitest";
import { diffSnapshots, hasChanges, storageCounts } from "../src/diff.js";
import { parseSnapshot, SnapshotParseError, type LedgerEntryWithTtl } from "../src/snapshot.js";
import { clone, loadVault } from "./helpers.js";

describe("diffSnapshots on the vault fee change", () => {
  const base = loadVault("base", "deposit_emits_event");
  const head = loadVault("head", "deposit_emits_event");
  const d = diffSnapshots(base, head);

  it("reports value changes, the new admin balance and the TTL bump", () => {
    const rows = d.storage.map((c) => `${c.kind} ${c.label}`);
    expect(rows).toEqual([
      "changed Shares(CAAA…K3IM)",
      "changed TotalShares",
      "changed Balance(CAAA…ITA4)",
      "added Balance(CAAA…D2KM)",
    ]);
    const shares = d.storage[0]!;
    expect(shares.before).toEqual({ value: "250i128", liveUntil: 518400 });
    expect(shares.after).toEqual({ value: "248i128", liveUntil: 1036800 });
    expect(storageCounts(d.storage)).toEqual({ added: 1, removed: 0, changed: 3, ttl: 1 });
  });

  it("shows the new fee event and the extra authorized transfer", () => {
    expect(d.events.filter((l) => l.op === "+").map((l) => l.text)).toContain(
      "CAAA…ITA4: fee_charged(CAAA…K3IM) → {fee: 2i128}",
    );
    expect(d.auth.filter((l) => l.op === "+").map((l) => l.text)).toEqual([
      "  └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 248i128)",
      "  └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…D2KM, 2i128)",
    ]);
  });

  it("never lists auth nonce entries (they are deterministic in tests, so none changed here)", () => {
    expect(d.storage.some((c) => c.id.startsWith("nonce:"))).toBe(false);
    expect(d.hiddenNoise).toBe(0);
  });
});

describe("diffSnapshots edge cases", () => {
  const base = loadVault("base", "deposit_records_shares");

  it("finds no changes between identical snapshots", () => {
    expect(hasChanges(diffSnapshots(base, clone(base)))).toBe(false);
  });

  it("reports a TTL-only change as kind ttl", () => {
    const head = clone(base);
    const entry = persistentEntry(head.ledger.ledger_entries, "Shares");
    entry.live_until = (entry.live_until ?? 0) + 10;
    const d = diffSnapshots(base, head);
    expect(d.storage).toHaveLength(1);
    expect(d.storage[0]!.kind).toBe("ttl");
  });

  it("reports removed entries", () => {
    const head = clone(base);
    const entries = head.ledger.ledger_entries;
    entries.splice(entries.indexOf(persistentEntry(entries, "Shares")), 1);
    const d = diffSnapshots(base, head);
    expect(d.storage.map((c) => c.kind)).toEqual(["removed"]);
  });

  it("matches entries regardless of their order in the file", () => {
    const head = clone(base);
    head.ledger.ledger_entries.reverse();
    expect(hasChanges(diffSnapshots(base, head))).toBe(false);
  });

  it("splits instance storage into one row per key", () => {
    const head = clone(loadVault("head", "deposit_records_shares"));
    const d = diffSnapshots(base, head);
    const total = d.storage.find((c) => c.label === "TotalShares");
    expect(total).toMatchObject({
      kind: "changed",
      durability: "instance",
      entryKind: "instance_storage",
    });
  });

  it("can include nonce entries on request", () => {
    const head = clone(base);
    const nonce = head.ledger.ledger_entries.find((e) =>
      JSON.stringify(e).includes("ledger_key_nonce"),
    )!;
    head.ledger.ledger_entries.splice(head.ledger.ledger_entries.indexOf(nonce), 1);
    expect(diffSnapshots(base, head).storage).toHaveLength(0);
    expect(diffSnapshots(base, head).hiddenNoise).toBe(1);
    expect(diffSnapshots(base, head, { includeNonces: true }).storage).toHaveLength(1);
  });

  it("reports ledger setting changes", () => {
    const head = clone(base);
    head.ledger.protocol_version = 30;
    expect(diffSnapshots(base, head).env).toEqual([
      { field: "protocol_version", before: "29", after: "30" },
    ]);
  });

  it("does not shift auth diffs when a call without auth is added", () => {
    const head = clone(base);
    head.auth.splice(1, 0, []);
    expect(diffSnapshots(base, head).auth.every((l) => l.op === " ")).toBe(true);
  });
});

describe("parseSnapshot", () => {
  it("rejects invalid JSON and non-snapshots with a path in the message", () => {
    expect(() => parseSnapshot("{", "a.json")).toThrow(SnapshotParseError);
    expect(() => parseSnapshot("{}", "b.json")).toThrow(/b\.json: missing ledger/);
  });

  it("defaults missing optional sections", () => {
    const s = parseSnapshot('{"ledger":{"ledger_entries":[]}}');
    expect(s.auth).toEqual([]);
    expect(s.events).toEqual([]);
  });
});

function persistentEntry(entries: LedgerEntryWithTtl[], symbol: string): LedgerEntryWithTtl {
  const e = entries.find((x) => {
    const cd = x.entry.data["contract_data"] as { key?: unknown; durability?: string } | undefined;
    return cd?.durability === "persistent" && JSON.stringify(cd.key).includes(`"${symbol}"`);
  });
  if (!e) throw new Error(`no persistent ${symbol} entry`);
  return e;
}
