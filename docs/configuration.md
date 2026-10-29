# Configuration reference

## GitHub Action

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- uses: Ike-Nathan/snapwise@v0.1.0
  with:
    working-directory: contracts
    fail-on: auth,removed
```

### Inputs

| Input                   | Default               | Description                                                                                                                                                 |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `working-directory`     | `.`                   | Directory (relative to the repository root) scanned recursively for `test_snapshots/` folders. `target/` and `node_modules/` are always skipped.            |
| `base-ref`              | see below             | Git ref or SHA to compare from.                                                                                                                             |
| `head-ref`              | `HEAD`                | Git ref or SHA to compare to. On `pull_request` events, `HEAD` is the merge commit that `actions/checkout` checks out.                                      |
| `fail-on`               | `none`                | Comma-separated categories that fail the check: `any`, `auth`, `storage`, `ttl`, `events`, `env`, `added`, `removed`, `error`. The comment is still posted. |
| `comment`               | `true`                | Create or update one sticky comment on the pull request.                                                                                                    |
| `comment-on-no-changes` | `false`               | Create a comment even when no snapshots changed. An existing Snapwise comment is always updated, so it never goes stale.                                    |
| `include-nonces`        | `false`               | Include auth nonce ledger entries. These are hidden by default because they are bookkeeping, not contract state.                                            |
| `github-token`          | `${{ github.token }}` | Token used for the comment. Needs `pull-requests: write`.                                                                                                   |

**Default `base-ref`:** on `pull_request` events it is the PR's base commit (`github.event.pull_request.base.sha`). On `push` events it is `github.event.before`. On other events, set it explicitly.

If the base commit is not in the checkout, Snapwise tries `git fetch --depth=1 origin <sha>` once. If that fails, it stops with a message asking for `fetch-depth: 0`.

### Outputs

| Output            | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `changed`         | Number of tests whose snapshots changed.                    |
| `added`           | Number of new snapshot files.                               |
| `removed`         | Number of deleted snapshot files.                           |
| `auth-changed`    | Number of changed tests whose authorization trees changed.  |
| `report-json`     | Path to the full JSON report (in `$RUNNER_TEMP/snapwise/`). |
| `report-markdown` | Path to the Markdown report.                                |

### Permissions and forks

The comment needs `pull-requests: write`. For pull requests from forks, GitHub gives the workflow a read-only token. Snapwise detects the `403`, logs a warning and keeps the report in the job summary. We do not recommend switching to `pull_request_target` just to comment on fork PRs unless you understand its security implications.

### Categories used by `fail-on`

| Category  | Triggers when                                                               |
| --------- | --------------------------------------------------------------------------- |
| `auth`    | Any line of a test's authorization trees was added or removed.              |
| `storage` | A ledger entry was added, removed, or its value changed.                    |
| `ttl`     | An entry's `live_until` ledger changed.                                     |
| `events`  | The events of the test's last call changed.                                 |
| `env`     | Ledger settings changed (protocol version, sequence number, TTL limits, …). |
| `added`   | A new snapshot file appeared.                                               |
| `removed` | A snapshot file was deleted.                                                |
| `error`   | A snapshot could not be parsed.                                             |
| `any`     | Any of the above.                                                           |

## CLI

```text
snapwise diff                        compare HEAD with the working tree
snapwise diff --base <ref>           compare a git ref with the working tree
snapwise diff --base <ref> --head <ref>
snapwise diff <base-dir> <head-dir>  compare two directories (or two .json files)
snapwise show <snapshot.json>        print one snapshot in readable form
```

| Flag               | Default        | Description                                         |
| ------------------ | -------------- | --------------------------------------------------- |
| `--base <ref>`     | `HEAD`         | Git ref to compare from.                            |
| `--head <ref>`     | working tree   | Git ref to compare to.                              |
| `--cwd <dir>`      | `.`            | Directory to scan.                                  |
| `--format <fmt>`   | `text`         | `text`, `markdown` (or `md`), `json`.               |
| `--output <file>`  | stdout         | Write the report to a file.                         |
| `--fail-on <list>` | none           | Same categories as the Action input.                |
| `--include-nonces` | off            | Show auth nonce entries.                            |
| `--full-addresses` | off            | Print full 56-character strkeys.                    |
| `--context <n>`    | `2`            | Unchanged lines around event and auth changes.      |
| `--no-color`       | colours on TTY | Disable ANSI colours. `NO_COLOR` is also respected. |

Exit codes: `0` success, `1` a `--fail-on` category matched, `2` usage or input error.

## JSON report

`--format json` and the `report-json` output share one schema. Top-level fields:

```jsonc
{
  "schemaVersion": 1,
  "base": "main@1a2b3c4",
  "head": "this PR",
  "unchanged": 12,
  "totals": {
    "changed": 5,
    "added": 0,
    "removed": 0,
    "errors": 0,
    "storage": 5,
    "ttl": 5,
    "events": 1,
    "auth": 5,
    "env": 0,
  },
  "tests": [
    {
      "path": "contracts/vault/test_snapshots/test/deposit.1.json",
      "crate": "vault",
      "name": "test::deposit",
      "status": "changed", // added | removed | changed | error
      "storage": [
        {
          "kind": "changed",
          "label": "Shares(CAAA…K3IM)",
          "durability": "persistent",
          "owner": "CAAA…",
          "before": { "value": "250i128", "liveUntil": 518400 },
          "after": { "value": "248i128", "liveUntil": 1036800 },
        },
      ],
      "events": [{ "op": "+", "text": "CAAA…ITA4: fee_charged(CAAA…K3IM) → {fee: 2i128}" }],
      "auth": [{ "op": " ", "text": "…" }],
      "env": [],
      "hiddenNoise": 0,
    },
  ],
}
```

The types are exported from the package as `Report`, `TestDiff` and `StorageChange`. Breaking changes to this shape bump `schemaVersion`.
