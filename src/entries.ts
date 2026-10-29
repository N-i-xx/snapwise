import {
  compactJson,
  renderExecutable,
  renderScVal,
  shortAddress,
  type RenderOptions,
} from "./scval.js";
import { isObject, type Json, type LedgerEntryWithTtl } from "./snapshot.js";

/**
 * A ledger entry flattened into something diffable. Contract instances are
 * split into one entry for the instance itself plus one per instance-storage
 * key, so a change to a single instance value shows up as a single row.
 */
export interface FlatEntry {
  /** Stable identity used to match the same entry across base and head. */
  id: string;
  kind:
    | "contract_data"
    | "instance_storage"
    | "contract_instance"
    | "contract_code"
    | "account"
    | "trustline"
    | "other";
  /** `persistent`, `temporary`, `instance`, or undefined for non-contract entries. */
  durability?: string;
  /** Owning contract or account strkey, when there is one. */
  owner?: string;
  /** Human-readable key, e.g. `Shares(CAAA…K3IM)`. */
  label: string;
  /** Human-readable value. */
  value: string;
  /** Raw identity of the value, used to detect changes without rendering artefacts. */
  valueId: string;
  liveUntil: number | null;
  /** Entries that are bookkeeping noise (auth nonces) and hidden by default. */
  noise: boolean;
}

export function flattenEntries(
  entries: LedgerEntryWithTtl[],
  opts: RenderOptions = {},
): Map<string, FlatEntry> {
  const out = new Map<string, FlatEntry>();
  const keyOpts: RenderOptions = { ...opts, enumStyle: true };
  const add = (e: FlatEntry) => {
    // Duplicate ids should not happen; keep the first and make the second unique
    // rather than silently dropping data.
    let id = e.id;
    for (let i = 2; out.has(id); i++) id = `${e.id}#${i}`;
    out.set(id, { ...e, id });
  };

  for (const item of entries) {
    const data = item.entry?.data ?? {};
    const type = Object.keys(data)[0] ?? "unknown";
    const body = data[type] as Json;
    const liveUntil = item.live_until ?? null;

    if (type === "contract_data" && isObject(body)) {
      const contract = String(body["contract"] ?? "");
      const durability = String(body["durability"] ?? "");
      const key = (body["key"] ?? null) as Json;
      const val = (body["val"] ?? null) as Json;

      if (
        key === "ledger_key_contract_instance" &&
        isObject(val) &&
        isObject(val["contract_instance"])
      ) {
        const inst = val["contract_instance"];
        add({
          id: `instance:${contract}`,
          kind: "contract_instance",
          durability,
          owner: contract,
          label: "contract instance",
          value: renderExecutable(inst["executable"] ?? null, opts),
          valueId: compactJson(inst["executable"] ?? null),
          liveUntil,
          noise: false,
        });
        const storage = Array.isArray(inst["storage"]) ? inst["storage"] : [];
        for (const kv of storage) {
          if (!isObject(kv)) continue;
          const k = (kv["key"] ?? null) as Json;
          const v = (kv["val"] ?? null) as Json;
          add({
            id: `istore:${contract}:${compactJson(k)}`,
            kind: "instance_storage",
            durability: "instance",
            owner: contract,
            label: renderScVal(k, keyOpts),
            value: renderScVal(v, opts),
            valueId: compactJson(v),
            // Instance storage shares the instance's TTL; reported on the instance row.
            liveUntil: null,
            noise: false,
          });
        }
        continue;
      }

      const isNonce = isObject(key) && "ledger_key_nonce" in key;
      add({
        id: isNonce
          ? `nonce:${contract}:${compactJson(key)}`
          : `data:${contract}:${durability}:${compactJson(key)}`,
        kind: "contract_data",
        durability,
        owner: contract,
        label: renderScVal(key, keyOpts),
        value: renderScVal(val, opts),
        valueId: compactJson(val),
        liveUntil,
        noise: isNonce,
      });
      continue;
    }

    if (type === "contract_code" && isObject(body)) {
      const hash = String(body["hash"] ?? "");
      const code = typeof body["code"] === "string" ? body["code"] : "";
      add({
        id: `code:${hash}`,
        kind: "contract_code",
        label: `wasm ${hash.slice(0, 8)}…`,
        value: `${Math.floor(code.length / 2)} bytes`,
        valueId: hash,
        liveUntil,
        noise: false,
      });
      continue;
    }

    if (type === "account" && isObject(body)) {
      const id = String(body["account_id"] ?? "");
      const signers = Array.isArray(body["signers"]) ? body["signers"].length : 0;
      add({
        id: `account:${id}`,
        kind: "account",
        owner: id,
        label: `account ${shortAddress(id, opts)}`,
        value: `balance ${String(body["balance"] ?? "?")}, seq ${String(body["seq_num"] ?? "?")}, ${signers} signer(s)`,
        valueId: compactJson(body),
        liveUntil,
        noise: false,
      });
      continue;
    }

    if (type === "trustline" && isObject(body)) {
      const account = String(body["account_id"] ?? "");
      const asset = (body["asset"] ?? null) as Json;
      add({
        id: `trustline:${account}:${compactJson(asset)}`,
        kind: "trustline",
        owner: account,
        label: `trustline ${shortAddress(account, opts)} ${renderAsset(asset)}`,
        value: `balance ${String(body["balance"] ?? "?")}, limit ${String(body["limit"] ?? "?")}`,
        valueId: compactJson(body),
        liveUntil,
        noise: false,
      });
      continue;
    }

    add({
      id: `${type}:${compactJson(body)}`,
      kind: "other",
      label: type,
      value: renderScVal(body, { ...opts, maxLength: 120 }),
      valueId: compactJson(body),
      liveUntil,
      noise: false,
    });
  }
  return out;
}

function renderAsset(asset: Json): string {
  if (!isObject(asset)) return String(asset);
  for (const v of Object.values(asset)) {
    if (isObject(v) && typeof v["asset_code"] === "string") return String(v["asset_code"]);
  }
  return compactJson(asset);
}
