import { isObject, type Json } from "./snapshot.js";

/**
 * Compact, Rust-flavoured rendering of ScVal JSON as it appears in Soroban
 * test snapshots, e.g. `{"i128":"250"}` → `250i128`,
 * `{"vec":[{"symbol":"Shares"},{"address":"CAAA…"}]}` → `[Shares, CAAA…K3IM]`.
 *
 * Anything not recognised falls back to compact JSON, so new ScVal variants
 * never break rendering; they just look less pretty.
 */
export interface RenderOptions {
  /** Print full 56-character strkeys instead of `CAAA…ITA4`. */
  fullAddresses?: boolean;
  /**
   * Render vectors that start with a symbol as enum variants
   * (`Shares(CAAA…)`). This is how `#[contracttype]` enums are encoded, so
   * it is used for storage keys, where enums are the norm.
   */
  enumStyle?: boolean;
  /** Maximum length of a rendered value before it is cut with `…`. */
  maxLength?: number;
}

const INT_SUFFIX: Record<string, string> = {
  u32: "u32",
  i32: "i32",
  u64: "u64",
  i64: "i64",
  u128: "u128",
  i128: "i128",
  u256: "u256",
  i256: "i256",
  timepoint: "tp",
  duration: "dur",
};

export function shortAddress(strkey: string, opts: RenderOptions = {}): string {
  if (opts.fullAddresses || strkey.length < 20) return strkey;
  return `${strkey.slice(0, 4)}…${strkey.slice(-4)}`;
}

export function renderScVal(v: Json, opts: RenderOptions = {}): string {
  const out = render(v, opts);
  const max = opts.maxLength ?? 0;
  return max > 0 && out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

function render(v: Json, opts: RenderOptions): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    if (v === "void") return "()";
    return v; // e.g. "ledger_key_contract_instance"
  }
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => render(x, opts)).join(", ")}]`;

  const keys = Object.keys(v);
  if (keys.length !== 1) return compactJson(v);
  const tag = keys[0]!;
  const inner = v[tag] as Json;

  if (tag in INT_SUFFIX) return `${scalar(inner)}${INT_SUFFIX[tag]}`;
  switch (tag) {
    case "bool":
      return String(inner);
    case "symbol":
      return String(inner);
    case "string":
      return JSON.stringify(inner);
    case "bytes":
      return `0x${String(inner)}`;
    case "address":
      return typeof inner === "string" ? shortAddress(inner, opts) : compactJson(inner);
    case "vec": {
      const items = Array.isArray(inner) ? inner : [];
      if (opts.enumStyle && items.length > 0 && isTagged(items[0], "symbol")) {
        const name = String((items[0] as { symbol: Json }).symbol);
        const args = items.slice(1);
        return args.length === 0 ? name : `${name}(${args.map((x) => render(x, opts)).join(", ")})`;
      }
      return `[${items.map((x) => render(x, opts)).join(", ")}]`;
    }
    case "map": {
      const entries = Array.isArray(inner) ? inner : [];
      const parts = entries.map((e) =>
        isObject(e)
          ? `${render(e["key"] ?? null, opts)}: ${render(e["val"] ?? null, opts)}`
          : compactJson(e),
      );
      return `{${parts.join(", ")}}`;
    }
    case "ledger_key_nonce":
      return isObject(inner) ? `nonce(${scalar(inner["nonce"] ?? null)})` : "nonce";
    case "error":
      return `Error(${
        isObject(inner)
          ? Object.entries(inner)
              .map(([k, x]) => `${k}: ${scalar(x)}`)
              .join(", ")
          : scalar(inner)
      })`;
    case "contract_instance":
      return renderInstance(inner, opts);
    default:
      return compactJson(v);
  }
}

function renderInstance(inner: Json, opts: RenderOptions): string {
  if (!isObject(inner)) return compactJson(inner);
  return `instance(${renderExecutable(inner["executable"] ?? null, opts)})`;
}

/** Renders a contract executable: `wasm 74beb3d1…` or `stellar_asset`. */
export function renderExecutable(exec: Json, _opts: RenderOptions = {}): string {
  if (typeof exec === "string") return exec;
  if (isObject(exec) && typeof exec["wasm"] === "string") {
    return `wasm ${exec["wasm"].slice(0, 8)}…`;
  }
  return compactJson(exec);
}

function isTagged(v: Json | undefined, tag: string): boolean {
  return isObject(v) && Object.keys(v).length === 1 && tag in v;
}

function scalar(v: Json): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  return compactJson(v);
}

/** Deterministic compact JSON (object keys sorted) used for identity and fallbacks. */
export function compactJson(v: Json): string {
  return JSON.stringify(sortKeys(v));
}

function sortKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v)) {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k] as Json);
    return out;
  }
  return v;
}
