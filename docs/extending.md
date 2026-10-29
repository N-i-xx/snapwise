# Extending Snapwise: output formats and report sections

The two most common contributions are **a new output format** (for example JUnit XML or SARIF) and **a new kind of finding** in the report (for example contract aliases or a new ledger entry type). This guide walks through both.

## Ground rules

- The `Report` type in `src/diff.ts` is the contract between the diff engine and everything that displays it. Renderers must only read a `Report`; they never parse snapshots themselves.
- Adding optional fields to `Report` is fine. Renaming or removing fields is a breaking change and needs a `schemaVersion` bump plus a `CHANGELOG.md` entry.
- Every change needs tests. Output formats need a file snapshot test (`toMatchFileSnapshot`) using the real fixtures in `test/fixtures/vault-fee`.

## A. Adding an output format

Example: a `--format junit` that emits one `<testcase>` per changed snapshot, so CI systems without PR comments can show changes.

1. **Create the renderer** in `src/render/junit.ts`:

   ```ts
   import { testLabel, type Report } from "../diff.js";

   export function renderJunit(report: Report): string {
     const cases = report.tests.map((t) => {
       const name = escapeXml(testLabel(t));
       return t.status === "changed"
         ? `  <testcase name="${name}"><failure message="snapshot changed"/></testcase>`
         : `  <testcase name="${name}"/>`;
     });
     return `<testsuite name="snapwise" tests="${report.tests.length}">\n${cases.join("\n")}\n</testsuite>`;
   }
   ```

   Keep renderers pure: input `Report` (plus options), output `string`, no I/O.

2. **Export it** from `src/index.ts` so library users can call it.

3. **Wire up the CLI** in `src/cli.ts`: add a `case "junit":` to the `--format` switch and mention it in `HELP`.

4. **Test it** in `test/render.test.ts`:

   ```ts
   it("renders JUnit", async () => {
     await expect(renderJunit(report)).toMatchFileSnapshot("__snapshots__/vault-fee.junit.xml");
   });
   ```

   Run `npm run test:update` once to write the snapshot, then **read the generated file** before committing it.

5. **Document it** in `docs/configuration.md` (the `--format` row) and the README configuration table.

6. If the Action should expose it, add an output in `action.yml`, write the file in `writeOutputs` in `src/action/main.ts`, run `npm run build:action`, and commit `dist/`.

## B. Adding a new kind of finding

Example: recognising a new ledger entry type so it gets a proper label instead of the JSON fallback.

1. **Extend `flattenEntries`** in `src/entries.ts` with a branch for the entry type. Decide its identity carefully: it must be the same for "the same entry" in base and head, and different for different entries. Use `compactJson` on the parts that make up the ledger key.

2. **Add a fixture.** The most convincing fixture is real SDK output: write a small test in `examples/vault` (or a scratch contract) that produces the entry, run `cargo test`, and copy the relevant snapshot into `test/fixtures/<name>/{base,head}`. Hand-edited JSON is fine for edge cases; say so in the test name.

3. **Unit-test the identity and labels** in `test/diff.test.ts`: same entry → no change; value change → `changed`; TTL change → `ttl`.

4. If the finding is a new category that people may want to block on, add it to `FAIL_CATEGORIES` in `src/policy.ts`, `summarize` totals in `src/diff.ts`, the summary line in `src/render/markdown.ts`, and the docs table in `docs/configuration.md`.

## Running the checks

```sh
npm run all        # typecheck, lint, test, build, bundle the action
```

`npm run all` must pass, and `dist/` must be committed if you touched anything the Action uses. CI enforces both.
