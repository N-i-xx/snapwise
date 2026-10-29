import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compareSources,
  describePath,
  DirectorySource,
  GitSource,
  isSnapshotPath,
} from "../src/sources.js";
import { VAULT_BASE, VAULT_HEAD } from "./helpers.js";

describe("isSnapshotPath", () => {
  it.each([
    ["test_snapshots/test/a.1.json", true],
    ["contracts/vault/test_snapshots/test/a.1.json", true],
    ["contracts/vault/test_snapshots.json", false],
    ["contracts/vault/target/test_snapshots/a.1.json", false],
    ["contracts/vault/test_snapshots/test/a.1.txt", false],
  ])("%s → %s", (path, expected) => {
    expect(isSnapshotPath(path)).toBe(expected);
  });
});

describe("describePath", () => {
  it("derives crate, module path and test name", () => {
    expect(describePath("contracts/vault/test_snapshots/test/deposit.1.json")).toEqual({
      crate: "vault",
      name: "test::deposit",
    });
  });
  it("marks additional Envs in the same test", () => {
    expect(describePath("vault/test_snapshots/a/b/c.2.json")).toEqual({
      crate: "vault",
      name: "a::b::c #2",
    });
  });
  it("uses an empty crate for a root-level test_snapshots directory", () => {
    expect(describePath("test_snapshots/test/x.1.json").crate).toBe("");
  });
});

describe("compareSources with directories", () => {
  it("compares the vault fixtures", async () => {
    const report = await compareSources(
      new DirectorySource(VAULT_BASE, "base"),
      new DirectorySource(VAULT_HEAD, "head"),
    );
    expect(report.totals).toMatchObject({
      changed: 5,
      added: 0,
      removed: 0,
      auth: 5,
      storage: 5,
      ttl: 5,
      events: 1,
    });
    expect(report.unchanged).toBe(0);
  });

  it("reports unchanged, added, removed and unreadable files", async () => {
    const root = mkdtempSync(join(tmpdir(), "snapwise-"));
    try {
      const a = join(root, "a");
      const b = join(root, "b");
      cpSync(VAULT_BASE, a, { recursive: true });
      cpSync(VAULT_BASE, b, { recursive: true });
      const dir = (side: string) => join(root, side, "vault", "test_snapshots", "test");
      rmSync(join(dir("b"), "withdraw_returns_tokens.1.json"));
      cpSync(join(dir("a"), "deposit_emits_event.1.json"), join(dir("b"), "brand_new.1.json"));
      writeFileSync(join(dir("b"), "deposit_records_shares.1.json"), "{ not json");

      const report = await compareSources(new DirectorySource(a), new DirectorySource(b));
      const statuses = Object.fromEntries(report.tests.map((t) => [t.name, t.status]));
      expect(statuses).toEqual({
        "test::brand_new": "added",
        "test::deposit_records_shares": "error",
        "test::withdraw_returns_tokens": "removed",
      });
      expect(report.unchanged).toBe(3);
      expect(report.tests.find((t) => t.status === "added")!.size).toMatchObject({ events: 2 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("GitSource", () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "snapwise-git-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    git("config", "core.autocrlf", "false");
    cpSync(VAULT_BASE, repo, { recursive: true });
    git("add", ".");
    git("commit", "-q", "-m", "base");
    cpSync(VAULT_HEAD, repo, { recursive: true });
    git("commit", "-q", "-am", "head");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("compares two commits", async () => {
    const report = await compareSources(new GitSource("HEAD~1", repo), new GitSource("HEAD", repo));
    expect(report.totals.changed).toBe(5);
    expect(report.base).toBe("HEAD~1");
  });

  it("skips identical blobs without reading them", async () => {
    const report = await compareSources(new GitSource("HEAD", repo), new GitSource("HEAD", repo));
    expect(report.tests).toHaveLength(0);
    expect(report.unchanged).toBe(5);
  });

  it("compares a commit with the working tree", async () => {
    const report = await compareSources(
      new GitSource("HEAD~1", repo),
      new DirectorySource(repo, "working tree"),
    );
    expect(report.totals.changed).toBe(5);
  });

  it("scopes to a sub-directory", async () => {
    const report = await compareSources(
      new GitSource("HEAD~1", join(repo, "vault")),
      new GitSource("HEAD", join(repo, "vault")),
    );
    expect(report.tests[0]!.path).toBe("test_snapshots/test/deposit_emits_event.1.json");
    expect(report.tests[0]!.crate).toBe("");
  });
});
