import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSnapshot, type TestSnapshot } from "../src/snapshot.js";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** Base and head of the vault example before/after adding a 1% deposit fee (real SDK 29.0.1 output). */
export const VAULT_BASE = join(FIXTURES, "vault-fee", "base");
export const VAULT_HEAD = join(FIXTURES, "vault-fee", "head");

export function loadVault(side: "base" | "head", test: string): TestSnapshot {
  const path = join(
    side === "base" ? VAULT_BASE : VAULT_HEAD,
    "vault",
    "test_snapshots",
    "test",
    `${test}.1.json`,
  );
  return parseSnapshot(readFileSync(path, "utf8"), path);
}

/** Deep copy, so tests can mutate fixtures freely. */
export function clone<T>(v: T): T {
  return structuredClone(v);
}
