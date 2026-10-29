import { describe, expect, it } from "vitest";
import { countOps, diffLines, withContext } from "../src/linediff.js";

const ops = (before: string[], after: string[], limit?: number) =>
  diffLines(before, after, limit).map((l) => `${l.op}${l.text}`);

describe("diffLines", () => {
  it("returns only context for identical input", () => {
    expect(ops(["a", "b"], ["a", "b"])).toEqual([" a", " b"]);
  });

  it("finds insertions and deletions", () => {
    expect(ops(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual([" a", "-b", "+x", " c", "+d"]);
  });

  it("handles empty sides", () => {
    expect(ops([], ["a"])).toEqual(["+a"]);
    expect(ops(["a"], [])).toEqual(["-a"]);
  });

  it("falls back to remove-all/add-all above the size limit", () => {
    expect(ops(["a", "b", "c"], ["c", "b", "a"], 1)).toEqual(["-a", "-b", "-c", "+c", "+b", "+a"]);
  });

  it("counts operations", () => {
    expect(countOps(diffLines(["a", "b"], ["b", "c"]))).toEqual({ added: 1, removed: 1 });
  });
});

describe("withContext", () => {
  it("keeps changed lines and nearby context, marking gaps", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const after = ["1", "2", "3", "4", "X", "6", "7", "8"];
    const shown = withContext(diffLines(before, after), 1).map((l) => `${l.op}${l.text}`);
    expect(shown).toEqual([" …", " 4", "-5", "+X", " 6", " …"]);
  });
});
