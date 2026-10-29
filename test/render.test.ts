import { describe, expect, it } from "vitest";
import { compareSources, DirectorySource } from "../src/sources.js";
import { COMMENT_MARKER, renderMarkdown } from "../src/render/markdown.js";
import { renderText } from "../src/render/text.js";
import { renderSnapshot } from "../src/render/show.js";
import { summarize } from "../src/diff.js";
import { evaluatePolicy, parseFailOn } from "../src/policy.js";
import { loadVault, VAULT_BASE, VAULT_HEAD } from "./helpers.js";

const report = await compareSources(
  new DirectorySource(VAULT_BASE, "main"),
  new DirectorySource(VAULT_HEAD, "feature"),
);

describe("markdown", () => {
  it("matches the snapshot", async () => {
    await expect(renderMarkdown(report)).toMatchFileSnapshot("__snapshots__/vault-fee.md");
  });

  it("starts with the sticky-comment marker", () => {
    expect(renderMarkdown(report).startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("says so when nothing changed", () => {
    const md = renderMarkdown(summarize([], 4, "main", "feature"));
    expect(md).toContain("No test snapshot changes");
  });

  it("drops details to fit the size limit and says how many were left out", () => {
    const full = renderMarkdown(report);
    const small = renderMarkdown(report, { maxLength: 3_000 });
    expect(small.length).toBeLessThanOrEqual(3_000);
    expect(small.length).toBeLessThan(full.length);
    expect(small).toMatch(/Details for \d+ test\(s\) were left out/);
    // The overview table is always kept.
    expect(small).toContain("vault › test::withdraw_returns_tokens");
  });

  it("escapes HTML and table pipes in values", () => {
    const r = structuredClone(report);
    r.tests[0]!.storage[0]!.after!.value = "<script>|x";
    const md = renderMarkdown(r);
    expect(md).not.toContain("<script>");
    expect(md).toContain("&lt;script&gt;&#124;x");
  });
});

describe("text", () => {
  it("matches the snapshot", async () => {
    await expect(renderText(report)).toMatchFileSnapshot("__snapshots__/vault-fee.txt");
  });

  it("adds ANSI colours only when asked", () => {
    expect(renderText(report)).not.toContain("\x1b[");
    expect(renderText(report, { color: true })).toContain("\x1b[");
  });
});

describe("show", () => {
  it("matches the snapshot", async () => {
    await expect(renderSnapshot(loadVault("head", "deposit_emits_event"))).toMatchFileSnapshot(
      "__snapshots__/show-deposit_emits_event.txt",
    );
  });
});

describe("policy", () => {
  it("parses categories and rejects unknown ones", () => {
    expect(parseFailOn("auth, storage")).toEqual(["auth", "storage"]);
    expect(parseFailOn("none")).toEqual([]);
    expect(parseFailOn(undefined)).toEqual([]);
    expect(() => parseFailOn("gas")).toThrow(/Unknown fail-on category/);
  });

  it("fails on auth changes when asked", () => {
    expect(evaluatePolicy(report, ["auth"])).toHaveLength(5);
    expect(evaluatePolicy(report, ["env"])).toHaveLength(0);
    expect(evaluatePolicy(report, [])).toHaveLength(0);
  });

  it("treats any as every category", () => {
    expect(evaluatePolicy(report, ["any"]).length).toBeGreaterThan(5);
  });
});
