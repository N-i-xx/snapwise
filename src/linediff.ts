/** One line of a line-level diff. */
export interface DiffLine {
  op: " " | "+" | "-";
  text: string;
}

/**
 * Line diff using the longest common subsequence. Snapshot sections are
 * small (tens to hundreds of lines), so the O(n·m) table is fine; above
 * `limit` cells it falls back to "everything removed, everything added"
 * rather than using a lot of memory.
 */
export function diffLines(before: string[], after: string[], limit = 4_000_000): DiffLine[] {
  // Trim the common prefix and suffix first: they are the bulk of most diffs.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }

  const head: DiffLine[] = before.slice(0, start).map((text) => ({ op: " ", text }));
  const tail: DiffLine[] = before.slice(endB).map((text) => ({ op: " ", text }));
  const b = before.slice(start, endB);
  const a = after.slice(start, endA);

  let middle: DiffLine[];
  if (b.length * a.length > limit) {
    middle = [
      ...b.map((text): DiffLine => ({ op: "-", text })),
      ...a.map((text): DiffLine => ({ op: "+", text })),
    ];
  } else {
    middle = lcsDiff(b, a);
  }
  return [...head, ...middle, ...tail];
}

function lcsDiff(b: string[], a: string[]): DiffLine[] {
  const n = b.length;
  const m = a.length;
  // lcs[i][j] = LCS length of b[i..] and a[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = b[i] === a[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (b[i] === a[j]) {
      out.push({ op: " ", text: b[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "-", text: b[i++]! });
    } else {
      out.push({ op: "+", text: a[j++]! });
    }
  }
  while (i < n) out.push({ op: "-", text: b[i++]! });
  while (j < m) out.push({ op: "+", text: a[j++]! });
  return out;
}

export function countOps(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.op === "+") added++;
    else if (l.op === "-") removed++;
  }
  return { added, removed };
}

/**
 * Keeps changed lines plus `context` unchanged lines around them, inserting
 * a `…` marker where lines were skipped, like a unified diff hunk.
 */
export function withContext(lines: DiffLine[], context = 2): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.op === " ") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });
  const out: DiffLine[] = [];
  let skipped = false;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) out.push({ op: " ", text: "…" });
      skipped = false;
      out.push(l);
    } else {
      skipped = true;
    }
  });
  if (skipped && out.length > 0) out.push({ op: " ", text: "…" });
  return out;
}
