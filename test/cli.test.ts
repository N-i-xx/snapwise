import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import { VAULT_BASE, VAULT_HEAD } from "./helpers.js";

let out: string[];
let err: string[];
beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void err.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("cli", () => {
  it("diffs two directories as text", async () => {
    expect(await main(["diff", VAULT_BASE, VAULT_HEAD])).toBe(0);
    expect(out.join("\n")).toContain("5 changed, 0 added, 0 removed, 0 unchanged");
  });

  it("emits a schema-versioned JSON report", async () => {
    await main(["diff", VAULT_BASE, VAULT_HEAD, "--format", "json"]);
    const report = JSON.parse(out.join("\n"));
    expect(report.schemaVersion).toBe(1);
    expect(report.tests).toHaveLength(5);
  });

  it("diffs two single files", async () => {
    const f = (root: string) =>
      join(root, "vault", "test_snapshots", "test", "deposit_emits_event.1.json");
    expect(await main(["diff", f(VAULT_BASE), f(VAULT_HEAD)])).toBe(0);
    expect(out.join("\n")).toContain("1 changed");
  });

  it("exits 1 when --fail-on matches and lists the reasons", async () => {
    expect(await main(["diff", VAULT_BASE, VAULT_HEAD, "--fail-on", "auth"])).toBe(1);
    expect(err.join("\n")).toContain("authorization changed");
  });

  it("writes to --output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "snapwise-cli-"));
    try {
      const file = join(dir, "report.md");
      await main(["diff", VAULT_BASE, VAULT_HEAD, "--format", "markdown", "--output", file]);
      expect(readFileSync(file, "utf8")).toContain("<!-- snapwise:report -->");
      expect(out).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects bad usage", async () => {
    await expect(main(["frobnicate"])).rejects.toThrow(/unknown command/);
    await expect(main(["diff", VAULT_BASE])).rejects.toThrow(/zero or two paths/);
    await expect(main(["diff", VAULT_BASE, VAULT_HEAD, "--format", "xml"])).rejects.toThrow(
      /unknown format/,
    );
    await expect(main(["diff", VAULT_BASE, VAULT_HEAD, "--context", "-1"])).rejects.toThrow(
      /--context/,
    );
  });

  it("prints help and version", async () => {
    expect(await main(["--help"])).toBe(0);
    expect(out.join("\n")).toContain("Usage:");
    expect(await main(["--version"])).toBe(0);
  });
});
