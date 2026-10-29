import { authLines, eventLines } from "../diff.js";
import { flattenEntries } from "../entries.js";
import { shortAddress, type RenderOptions } from "../scval.js";
import type { TestSnapshot } from "../snapshot.js";

/** Readable dump of one snapshot, for `snapwise show`. */
export function renderSnapshot(
  s: TestSnapshot,
  opts: RenderOptions & { includeNonces?: boolean } = {},
): string {
  const out: string[] = [];
  const l = s.ledger;
  out.push(
    `ledger: protocol ${l.protocol_version ?? "?"}, sequence ${l.sequence_number ?? "?"}, timestamp ${l.timestamp ?? "?"}`,
    "",
    "storage:",
  );
  const entries = [...flattenEntries(l.ledger_entries, opts).values()];
  const hidden = entries.filter((e) => e.noise && !opts.includeNonces).length;
  for (const e of entries) {
    if (e.noise && !opts.includeNonces) continue;
    const where = [e.owner ? shortAddress(e.owner, opts) : "", e.durability ?? ""]
      .filter(Boolean)
      .join(" ");
    const ttl = e.liveUntil === null ? "" : `  (live until ${e.liveUntil})`;
    out.push(`  ${where ? `${where} ` : ""}${e.label} = ${e.value}${ttl}`);
  }
  if (hidden) out.push(`  (${hidden} auth nonce entries hidden)`);
  out.push("", "events (last call):");
  const ev = eventLines(s, opts);
  out.push(...(ev.length ? ev.map((x) => `  ${x}`) : ["  (none)"]));
  out.push("", "auth:");
  const au = authLines(s, opts);
  out.push(...(au.length ? au.map((x) => `  ${x}`) : ["  (none)"]));
  return out.join("\n");
}
