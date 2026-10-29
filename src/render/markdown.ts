import {
  storageCounts,
  testLabel,
  type Report,
  type StorageChange,
  type TestDiff,
} from "../diff.js";
import { countOps, withContext, type DiffLine } from "../linediff.js";
import { shortAddress } from "../scval.js";

/** Hidden marker used to find and update the sticky PR comment. */
export const COMMENT_MARKER = "<!-- snapwise:report -->";

/** GitHub rejects comments over 65,536 characters; leave headroom. */
export const DEFAULT_MAX_LENGTH = 60_000;

export interface MarkdownOptions {
  /** Maximum output length; details are dropped test by test to fit. */
  maxLength?: number;
  /** Context lines around changed event/auth lines. */
  context?: number;
  /** Optional footer line, e.g. a link to the workflow run. */
  footer?: string;
}

export function renderMarkdown(report: Report, opts: MarkdownOptions = {}): string {
  const max = opts.maxLength ?? DEFAULT_MAX_LENGTH;
  const head = [
    COMMENT_MARKER,
    "### 🔎 Snapwise: test snapshot review",
    "",
    summaryLine(report),
    "",
  ];
  const footer = [
    "",
    `<sub>Compared \`${escapeInline(report.base)}\` → \`${escapeInline(report.head)}\` · events show the last call of each test only · [Snapwise](https://github.com/N-thnl/snapwise)${opts.footer ? ` · ${opts.footer}` : ""}</sub>`,
  ];

  if (report.tests.length === 0) {
    return [...head, "No test snapshot changes. ✅", ...footer].join("\n");
  }

  const table = overviewTable(report.tests);
  const details = report.tests.map((t) => testDetails(t, opts.context ?? 2));

  // Drop details from the end until the comment fits.
  let kept = details.length;
  const build = () => {
    const omitted = details.length - kept;
    const note =
      omitted > 0
        ? [
            "",
            `> ⚠️ Details for ${omitted} test(s) were left out to fit GitHub's comment size limit. Run \`npx snapwise diff\` locally for the full report.`,
          ]
        : [];
    return [...head, ...table, "", ...details.slice(0, kept), ...note, ...footer].join("\n");
  };
  let out = build();
  while (out.length > max && kept > 0) {
    kept--;
    out = build();
  }
  return out;
}

export function summaryLine(report: Report): string {
  const t = report.totals;
  const parts = [
    `**${t.changed} changed**`,
    `${t.added} added`,
    `${t.removed} removed`,
    `${report.unchanged} unchanged`,
  ];
  if (t.errors > 0) parts.push(`**${t.errors} unreadable**`);
  const flags: string[] = [];
  if (t.auth > 0) flags.push(`🔐 auth changed in ${t.auth}`);
  if (t.storage > 0) flags.push(`🗄️ storage in ${t.storage}`);
  if (t.ttl > 0) flags.push(`⏳ TTL in ${t.ttl}`);
  if (t.events > 0) flags.push(`📣 events in ${t.events}`);
  if (t.env > 0) flags.push(`⚙️ ledger settings in ${t.env}`);
  return `${parts.join(" · ")}${flags.length ? `\n\n${flags.join(" · ")}` : ""}`;
}

function overviewTable(tests: TestDiff[]): string[] {
  const rows = ["| Test | Status | Storage | TTL | Events | Auth |", "|---|---|---|---|---|---|"];
  for (const t of tests) {
    const name = `\`${escapeInline(testLabel(t))}\``;
    if (t.status !== "changed") {
      const label = { added: "🆕 added", removed: "🗑️ removed", error: "❌ unreadable" }[t.status];
      rows.push(`| ${name} | ${label} | | | | |`);
      continue;
    }
    const sc = storageCounts(t.storage);
    const storage = [
      sc.changed ? `~${sc.changed}` : "",
      sc.added ? `+${sc.added}` : "",
      sc.removed ? `−${sc.removed}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ev = countOps(t.events);
    const au = countOps(t.auth);
    rows.push(
      `| ${name} | changed | ${storage} | ${sc.ttl || ""} | ${lineCell(ev)} | ${au.added + au.removed ? `⚠️ ${lineCell(au)}` : ""} |`,
    );
  }
  return rows;
}

function lineCell(c: { added: number; removed: number }): string {
  if (c.added + c.removed === 0) return "";
  return [c.added ? `+${c.added}` : "", c.removed ? `−${c.removed}` : ""].filter(Boolean).join(" ");
}

function testDetails(t: TestDiff, context: number): string {
  const out = [`<details><summary><code>${escapeHtml(testLabel(t))}</code></summary>`, ""];
  out.push(`File: \`${escapeInline(t.path)}\``, "");

  if (t.status === "error") {
    out.push(`Could not read this snapshot: ${escapeHtml(t.error ?? "unknown error")}`);
  } else if (t.status !== "changed") {
    const s = t.size!;
    out.push(
      `${t.status === "added" ? "New" : "Deleted"} snapshot with ${s.entries} ledger entries, ${s.events} event(s) from the last call, and ${s.calls} top-level call(s).`,
    );
  } else {
    if (t.env.length > 0) {
      out.push("**Ledger settings**", "", "| Field | Before | After |", "|---|---|---|");
      for (const e of t.env) out.push(`| \`${e.field}\` | ${cell(e.before)} | ${cell(e.after)} |`);
      out.push("");
    }
    if (t.storage.length > 0) {
      out.push("**Storage**", "", "| | Entry | Before | After |", "|---|---|---|---|");
      for (const c of t.storage) out.push(storageRow(c));
      out.push("");
    }
    if (t.hiddenNoise > 0)
      out.push(
        `<sub>${t.hiddenNoise} auth nonce entr${t.hiddenNoise === 1 ? "y" : "ies"} changed (hidden).</sub>`,
        "",
      );
    if (t.events.some((l) => l.op !== " "))
      out.push("**Events** (last call)", "", ...diffBlock(t.events, context), "");
    if (t.auth.some((l) => l.op !== " "))
      out.push("**Auth** ⚠️", "", ...diffBlock(t.auth, context), "");
  }
  out.push("</details>");
  return out.join("\n");
}

const KIND_ICON: Record<StorageChange["kind"], string> = {
  added: "➕",
  removed: "➖",
  changed: "✏️",
  ttl: "⏳",
};

function storageRow(c: StorageChange): string {
  const where = [c.owner ? shortAddress(c.owner) : "", c.durability ?? ""]
    .filter(Boolean)
    .join(" ");
  const entry = `${where ? `${escapeHtml(where)} ` : ""}<code>${escapeHtml(c.label)}</code>`;
  return `| ${KIND_ICON[c.kind]} | ${entry} | ${side(c, "before")} | ${side(c, "after")} |`;
}

function side(c: StorageChange, which: "before" | "after"): string {
  const s = c[which];
  if (!s) return "";
  const other = c[which === "before" ? "after" : "before"];
  const ttlMoved = other !== undefined && other.liveUntil !== s.liveUntil;
  const ttl =
    s.liveUntil === null
      ? ""
      : ` <sub>${ttlMoved ? "**" : ""}live until ${s.liveUntil}${ttlMoved ? "**" : ""}</sub>`;
  if (c.kind === "ttl") return ttl.trim() || "—";
  return `${cell(s.value)}${ttl}`;
}

function diffBlock(lines: DiffLine[], context: number): string[] {
  const shown = withContext(lines, context);
  // Markdown code fences cannot be escaped; pick a fence longer than any backtick run.
  const fence = "`".repeat(Math.max(3, longestBacktickRun(shown) + 1));
  return [`${fence}diff`, ...shown.map((l) => `${l.op === " " ? " " : l.op} ${l.text}`), fence];
}

function longestBacktickRun(lines: DiffLine[]): number {
  let max = 0;
  for (const l of lines) for (const m of l.text.matchAll(/`+/g)) max = Math.max(max, m[0].length);
  return max;
}

function cell(text: string): string {
  const t = text.length > 160 ? `${text.slice(0, 159)}…` : text;
  return `<code>${escapeHtml(t)}</code>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/\n/g, " ");
}

function escapeInline(s: string): string {
  return s.replace(/`/g, "'").replace(/\|/g, "\\|");
}
