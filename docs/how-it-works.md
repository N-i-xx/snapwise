# How it works

This page explains what is in a Soroban test snapshot, and the rules Snapwise uses to turn two of them into a review.

## 1. What the SDK writes

With `testutils` enabled, every `Env` created in a test writes a JSON file when it is dropped:

```text
<crate>/test_snapshots/<module path>/<test fn>.<n>.json
```

`<n>` is 1 for the first `Env` in a test, 2 for the second, and so on. Snapwise shows the `module::test` name and adds `#n` when `n > 1`.

A trimmed snapshot (soroban-sdk 29.0.1) looks like this:

```jsonc
{
  "generators": { "address": 5, "nonce": 0, "mux_id": 0 },
  "auth": [
    [],                                         // call 1 needed no auth
    [ [ "CAAA…K3IM", {                          // call 2: who authorized…
          "function": { "contract_fn": {        // …which invocation
            "contract_address": "CAAA…ITA4", "function_name": "deposit",
            "args": [ { "address": "CAAA…K3IM" }, { "i128": "250" } ] } },
          "sub_invocations": [ /* nested authorized calls */ ] } ] ]
  ],
  "ledger": {
    "protocol_version": 29, "sequence_number": 0, "min_persistent_entry_ttl": 4096, …,
    "ledger_entries": [
      { "entry": { "data": { "contract_data": {
          "contract": "CAAA…ITA4", "durability": "persistent",
          "key": { "vec": [ { "symbol": "Shares" }, { "address": "CAAA…K3IM" } ] },
          "val": { "i128": "250" } } } },
        "live_until": 518400 }
    ]
  },
  "events": [ /* events of the LAST top-level call only */ ]
}
```

Key facts that shape Snapwise's design:

- `auth` has **one element per top-level call** made through a contract client, in order. Calls that required no authorization are empty arrays.
- `events` contains **only the events of the last top-level call**. Snapwise labels events "(last call)" everywhere to avoid confusion.
- `ledger_entries` is the **final** ledger state. Entries carry `live_until` (the TTL). Accounts and trustlines have `null`.
- Values use the Stellar XDR JSON encoding: `{"i128":"250"}`, `{"symbol":"Shares"}`, `"void"`, and so on.

## 2. Finding what changed

`compareSources` lists snapshot paths on both sides (`git ls-tree` or a directory walk) and takes their union. For each path:

1. If both sides have the **same git blob id**, it is unchanged. Nothing is read.
2. If the **text is identical**, it is unchanged.
3. Otherwise both sides are parsed and diffed. If the diff is empty (only formatting or line endings changed), it still counts as unchanged.
4. A path on only one side is `added` or `removed`. A file that fails to parse is reported as `error`, not dropped.

## 3. Storage: identity, value, TTL

Each ledger entry is flattened (`entries.ts`) into a record with a stable **identity**:

| Entry                 | Identity                                  | Label shown                              |
| --------------------- | ----------------------------------------- | ---------------------------------------- |
| Contract data         | `data:<contract>:<durability>:<key JSON>` | `Shares(CAAA…K3IM)`                      |
| Contract instance     | `instance:<contract>`                     | `contract instance` (value = executable) |
| Instance storage item | `istore:<contract>:<key JSON>`            | `TotalShares`                            |
| Auth nonce (hidden)   | `nonce:<contract>:<key JSON>`             | `nonce(…)`                               |
| Contract code         | `code:<wasm hash>`                        | `wasm 74beb3d1…`                         |
| Account               | `account:<G…>`                            | `account GAAA…GO6V`                      |
| Trustline             | `trustline:<G…>:<asset JSON>`             | `trustline GAAA…GO6V USDC`               |
| Anything else         | `<type>:<entry JSON>`                     | entry type                               |

Key JSON is **canonical** (object keys sorted), so formatting differences never change identity.

**Instance storage is split into one row per key.** Soroban stores a contract's instance storage as a single ledger entry holding a map. Without splitting, changing one counter would show the whole map as changed. Instance storage rows carry no TTL of their own; the TTL is reported on the `contract instance` row.

Matching entries are then compared:

| Base | Head | Value differs | `live_until` differs | Result                                         |
| ---- | ---- | ------------- | -------------------- | ---------------------------------------------- |
| —    | ✓    |               |                      | `added`                                        |
| ✓    | —    |               |                      | `removed`                                      |
| ✓    | ✓    | yes           | either               | `changed` (TTL shown in bold if it also moved) |
| ✓    | ✓    | no            | yes                  | `ttl`                                          |

Values are compared by canonical JSON, not by their rendered text, so display shortcuts (such as shortened addresses) can never hide a change.

**Auth nonces** are `temporary` entries the host creates for replay protection. They change whenever auth changes and carry no meaning of their own, so they are hidden and counted. `--include-nonces` shows them.

## 4. Events and auth: line diffs

Events and auth trees are ordered, so Snapwise renders each to one line per item and runs a longest-common-subsequence diff (`linediff.ts`):

```text
CAAA…ITA4: deposited(CAAA…K3IM) → {amount: 250i128}      ← event: contract: name(other topics) → data
CAAA…K3IM authorized CAAA…ITA4.deposit(CAAA…K3IM, 250i128)  ← auth root
  └ CBUS…IUNF.transfer(CAAA…K3IM, CAAA…ITA4, 250i128)      ← sub-invocation (indented by depth)
```

Calls without auth produce no lines, so adding a read-only call to a test does not shift the auth diff. The renderer shows changed lines with two lines of context (configurable).

For very large sections (over 4 million LCS cells) the diff falls back to "all removed, all added" to bound memory use.

## 5. Ledger settings

`protocol_version`, `sequence_number`, `timestamp`, `network_id`, `base_reserve` and the three TTL limits are compared directly and reported as **ledger settings** (`env`). A change here usually means the SDK was upgraded or a test changed `env.ledger()`, and it explains many downstream TTL changes.

## 6. Value rendering

`scval.ts` renders values compactly:

| JSON                                          | Rendered          |
| --------------------------------------------- | ----------------- |
| `{"i128":"250"}`, `{"u32":7}`                 | `250i128`, `7u32` |
| `{"symbol":"Admin"}`, `{"string":"hi"}`       | `Admin`, `"hi"`   |
| `{"address":"CAAA…ITA4"}`                     | `CAAA…ITA4`       |
| `{"vec":[…]}`, `{"map":[{key,val}]}`          | `[…]`, `{k: v}`   |
| `{"bytes":"00ff"}`, `"void"`                  | `0x00ff`, `()`    |
| storage key `{"vec":[{"symbol":"Shares"},…]}` | `Shares(…)`       |
| anything unknown                              | compact JSON      |

## 7. Output

The `Report` is rendered as:

- **Markdown** for the PR comment and job summary. It starts with a hidden `<!-- snapwise:report -->` marker that the Action uses to find and update its comment. If the comment would exceed GitHub's 65,536-character limit, per-test details are dropped from the end (the overview table always stays) and a note says how many were left out.
- **Text** for terminals, with optional ANSI colours.
- **JSON** (`schemaVersion: 1`) for other tools.
