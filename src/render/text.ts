import { storageCounts, testLabel, type Report, type StorageChange } from "../diff.js";
import { withContext } from "../linediff.js";
import { shortAddress } from "../scval.js";

export interface TextOptions {
  color?: boolean;
  context?: number;
}

/** Plain-text report for terminals. */
export function renderText(report: Report, opts: TextOptions = {}): string {
  const c = colors(opts.color ?? false);
  const t = report.totals;
  const out: string[] = [
    c.bold(`Snapwise: ${report.base} → ${report.head}`),
    `${t.changed} changed, ${t.added} added, ${t.removed} removed, ${report.unchanged} unchanged` +
      (t.errors ? `, ${t.errors} unreadable` : ""),
  ];
  if (report.tests.length === 0) {
    out.push("", c.green("No test snapshot changes."));
    return out.join("\n");
  }

  for (const test of report.tests) {
    out.push("", c.bold(`● ${testLabel(test)}`) + c.dim(`  (${test.path})`));
    if (test.status === "error") {
      out.push(c.red(`  unreadable: ${test.error}`));
      continue;
    }
    if (test.status !== "changed") {
      const s = test.size!;
      out.push(
        `  ${test.status === "added" ? c.green("new test") : c.red("removed test")}: ${s.entries} ledger entries, ${s.events} event(s), ${s.calls} call(s)`,
      );
      continue;
    }
    for (const e of test.env) out.push(c.yellow(`  ⚙ ${e.field}: ${e.before} → ${e.after}`));
    if (test.storage.length) {
      const sc = storageCounts(test.storage);
      out.push(
        `  storage: ${sc.changed} changed, ${sc.added} added, ${sc.removed} removed, ${sc.ttl} TTL moved`,
      );
      for (const ch of test.storage) out.push(`    ${storageLine(ch, c)}`);
    }
    if (test.hiddenNoise) out.push(c.dim(`    (${test.hiddenNoise} auth nonce entries hidden)`));
    for (const [title, lines] of [
      ["events (last call)", test.events],
      ["auth", test.auth],
    ] as const) {
      if (!lines.some((l) => l.op !== " ")) continue;
      out.push(`  ${title}:`);
      for (const l of withContext(lines, opts.context ?? 2)) {
        const text = `    ${l.op} ${l.text}`;
        out.push(l.op === "+" ? c.green(text) : l.op === "-" ? c.red(text) : c.dim(text));
      }
    }
  }
  return out.join("\n");
}

function storageLine(ch: StorageChange, c: ReturnType<typeof colors>): string {
  const where = [ch.owner ? shortAddress(ch.owner) : "", ch.durability ?? ""]
    .filter(Boolean)
    .join(" ");
  const name = `${where} ${ch.label}`.trim();
  const ttl = (s?: { liveUntil: number | null }) =>
    s?.liveUntil == null ? "" : ` @${s.liveUntil}`;
  switch (ch.kind) {
    case "added":
      return c.green(`+ ${name} = ${ch.after!.value}${ttl(ch.after)}`);
    case "removed":
      return c.red(`- ${name} = ${ch.before!.value}${ttl(ch.before)}`);
    case "changed":
      return c.yellow(
        `~ ${name}: ${ch.before!.value}${ttl(ch.before)} → ${ch.after!.value}${ttl(ch.after)}`,
      );
    case "ttl":
      return c.cyan(`⏳ ${name}: live until ${ch.before!.liveUntil} → ${ch.after!.liveUntil}`);
  }
}

function colors(on: boolean) {
  const wrap = (code: number) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: wrap(1),
    dim: wrap(2),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    cyan: wrap(36),
  };
}
