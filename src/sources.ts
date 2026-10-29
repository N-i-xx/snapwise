import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import {
  diffSnapshots,
  hasChanges,
  summarize,
  type DiffOptions,
  type Report,
  type TestDiff,
} from "./diff.js";
import { emptySnapshot, parseSnapshot, type TestSnapshot } from "./snapshot.js";

const execFileAsync = promisify(execFile);

/** A place snapshots can be read from: a directory, or a git commit. */
export interface SnapshotSource {
  /** Label used in reports, e.g. `origin/main` or a directory path. */
  readonly label: string;
  /** Snapshot paths relative to the source root, with `/` separators. */
  list(): Promise<string[]>;
  /** File contents, or `undefined` if the path does not exist. */
  read(path: string): Promise<string | undefined>;
  /**
   * Optional cheap content identity (e.g. a git blob id). When both sides
   * provide one and they match, the file is not read or parsed at all.
   */
  fingerprint?(path: string): Promise<string | undefined>;
}

/** True for files the Soroban SDK writes as test snapshots. */
export function isSnapshotPath(path: string): boolean {
  const p = path.split(sep).join("/");
  if (!p.endsWith(".json")) return false;
  const parts = p.split("/");
  if (parts.includes("target") || parts.includes("node_modules")) return false;
  return parts.slice(0, -1).includes("test_snapshots");
}

/** Reads snapshots from a directory tree on disk (e.g. the working tree). */
export class DirectorySource implements SnapshotSource {
  constructor(
    readonly root: string,
    readonly label: string = root,
  ) {}

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === "target" || e.name === "node_modules" || e.name === ".git") continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) {
          const rel = relative(this.root, full).split(sep).join("/");
          if (isSnapshotPath(rel)) out.push(rel);
        }
      }
    };
    await walk(this.root);
    return out.sort();
  }

  async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(join(this.root, path), "utf8");
    } catch {
      return undefined;
    }
  }
}

/**
 * Reads snapshots from a git commit without checking it out. Paths are
 * relative to `cwd`, so pointing `cwd` at a sub-directory scopes the scan.
 */
export class GitSource implements SnapshotSource {
  private blobs?: Promise<Map<string, string>>;

  constructor(
    readonly ref: string,
    readonly cwd: string,
    readonly label: string = ref,
  ) {}

  private git(args: string[]) {
    return execFileAsync("git", args, {
      cwd: this.cwd,
      maxBuffer: 256 * 1024 * 1024,
      encoding: "utf8",
    });
  }

  private loadBlobs(): Promise<Map<string, string>> {
    this.blobs ??= (async () => {
      // `ls-tree` run inside a sub-directory lists paths relative to it.
      const { stdout } = await this.git(["ls-tree", "-r", "-z", this.ref, "--", "."]);
      const map = new Map<string, string>();
      for (const record of stdout.split("\0")) {
        if (!record) continue;
        const tab = record.indexOf("\t");
        const [, type, oid] = record.slice(0, tab).split(" ");
        const path = record.slice(tab + 1);
        if (type === "blob" && oid && isSnapshotPath(path)) map.set(path, oid);
      }
      return map;
    })();
    return this.blobs;
  }

  async list(): Promise<string[]> {
    return [...(await this.loadBlobs()).keys()].sort();
  }

  async fingerprint(path: string): Promise<string | undefined> {
    return (await this.loadBlobs()).get(path);
  }

  async read(path: string): Promise<string | undefined> {
    const oid = await this.fingerprint(path);
    if (!oid) return undefined;
    const { stdout } = await this.git(["cat-file", "blob", oid]);
    return stdout;
  }
}

/** Splits a snapshot path into the crate directory and a `module::test` name. */
export function describePath(path: string): { crate: string; name: string } {
  const parts = path.split("/");
  const idx = parts.lastIndexOf("test_snapshots");
  const crate = idx > 0 ? parts[idx - 1]! : "";
  const modules = parts.slice(idx + 1, -1);
  const file = parts[parts.length - 1]!.replace(/\.json$/, "");
  const m = /^(.*)\.(\d+)$/.exec(file);
  const fn = m ? m[1]! : file;
  const n = m ? Number(m[2]) : 1;
  const name = [...modules, fn].join("::") + (n > 1 ? ` #${n}` : "");
  return { crate, name };
}

/** Compares every snapshot in `base` with `head` and builds a report. */
export async function compareSources(
  base: SnapshotSource,
  head: SnapshotSource,
  opts: DiffOptions = {},
): Promise<Report> {
  const [basePaths, headPaths] = await Promise.all([base.list(), head.list()]);
  const all = [...new Set([...basePaths, ...headPaths])].sort();
  const tests: TestDiff[] = [];
  let unchanged = 0;

  for (const path of all) {
    const { crate, name } = describePath(path);
    const common = {
      path,
      crate,
      name,
      storage: [],
      events: [],
      auth: [],
      env: [],
      hiddenNoise: 0,
    };

    if (base.fingerprint && head.fingerprint) {
      const [fb, fh] = await Promise.all([base.fingerprint(path), head.fingerprint(path)]);
      if (fb && fb === fh) {
        unchanged++;
        continue;
      }
    }
    const [tb, th] = await Promise.all([base.read(path), head.read(path)]);
    if (tb !== undefined && tb === th) {
      unchanged++;
      continue;
    }

    let sb: TestSnapshot | undefined;
    let sh: TestSnapshot | undefined;
    try {
      sb = tb === undefined ? undefined : parseSnapshot(tb, path);
      sh = th === undefined ? undefined : parseSnapshot(th, path);
    } catch (err) {
      tests.push({ ...common, status: "error", error: (err as Error).message });
      continue;
    }

    if (!sb || !sh) {
      const s = (sb ?? sh)!;
      tests.push({
        ...common,
        status: sb ? "removed" : "added",
        size: {
          entries: s.ledger.ledger_entries.length,
          events: s.events.length,
          calls: s.auth.length,
        },
        ...diffSnapshots(sb ?? emptySnapshot(), sh ?? emptySnapshot(), opts),
      });
      continue;
    }

    const d = diffSnapshots(sb, sh, opts);
    if (!hasChanges(d)) {
      // Formatting-only or noise-only change (e.g. auth nonces).
      unchanged++;
      continue;
    }
    tests.push({ ...common, status: "changed", ...d });
  }

  return summarize(tests, unchanged, base.label, head.label);
}
