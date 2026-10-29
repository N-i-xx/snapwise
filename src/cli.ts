import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { compareSources, DirectorySource, GitSource, type SnapshotSource } from "./sources.js";
import { evaluatePolicy, parseFailOn } from "./policy.js";
import { renderMarkdown } from "./render/markdown.js";
import { renderText } from "./render/text.js";
import { renderSnapshot } from "./render/show.js";
import { parseSnapshot } from "./snapshot.js";
import { VERSION } from "./version.js";

const HELP = `snapwise ${VERSION}: readable reviews of Soroban test snapshots

Usage:
  snapwise diff                        compare HEAD with the working tree
  snapwise diff --base <ref>           compare a git ref with the working tree
  snapwise diff --base <ref> --head <ref>
  snapwise diff <base-dir> <head-dir>  compare two directories (or two .json files)
  snapwise show <snapshot.json>        print one snapshot in readable form

Options:
  --base <ref>          git ref to compare from (default: HEAD)
  --head <ref>          git ref to compare to (default: working tree)
  --cwd <dir>           directory to scan (default: current directory)
  --format <fmt>        text | markdown | json (default: text)
  --output <file>       write the report to a file instead of stdout
  --fail-on <list>      exit 1 if any of: any, auth, storage, ttl, events, env,
                        added, removed, error (comma separated; default: none)
  --include-nonces      show auth nonce ledger entries (hidden by default)
  --full-addresses      print full strkeys instead of CAAA…ITA4
  --context <n>         unchanged lines around event/auth changes (default: 2)
  --no-color            disable colours in text output
  -h, --help            show this help
  -v, --version         show the version

Exit codes: 0 = ok, 1 = --fail-on matched, 2 = usage or input error.`;

export class UsageError extends Error {}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      base: { type: "string" },
      head: { type: "string" },
      cwd: { type: "string" },
      format: { type: "string", default: "text" },
      output: { type: "string" },
      "fail-on": { type: "string" },
      "include-nonces": { type: "boolean", default: false },
      "full-addresses": { type: "boolean", default: false },
      context: { type: "string", default: "2" },
      "no-color": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }
  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return command || values.help ? 0 : 2;
  }

  const renderOpts = {
    fullAddresses: values["full-addresses"],
    includeNonces: values["include-nonces"],
  };

  if (command === "show") {
    if (args.length !== 1) throw new UsageError("show takes exactly one snapshot file");
    const file = args[0]!;
    console.log(renderSnapshot(parseSnapshot(await readFile(file, "utf8"), file), renderOpts));
    return 0;
  }
  if (command !== "diff") throw new UsageError(`unknown command "${command}"`);

  const context = Number(values.context);
  if (!Number.isInteger(context) || context < 0) {
    throw new UsageError("--context must be a whole number");
  }
  const failOn = parseFailOn(values["fail-on"]);
  const cwd = resolve(values.cwd ?? ".");
  const [base, head] = await resolveSources(args, values.base, values.head, cwd);
  const report = await compareSources(base, head, renderOpts);

  let output: string;
  switch (values.format) {
    case "json":
      output = JSON.stringify(report, null, 2);
      break;
    case "markdown":
    case "md":
      output = renderMarkdown(report, { context });
      break;
    case "text":
      output = renderText(report, {
        context,
        color:
          !values["no-color"] &&
          !values.output &&
          Boolean(process.stdout.isTTY) &&
          !process.env["NO_COLOR"],
      });
      break;
    default:
      throw new UsageError(`unknown format "${values.format}"`);
  }
  if (values.output) await writeFile(values.output, output + "\n");
  else console.log(output);

  const reasons = evaluatePolicy(report, failOn);
  if (reasons.length > 0) {
    console.error(`\nsnapwise: failing because of --fail-on ${failOn.join(",")}:`);
    for (const r of reasons) console.error(`  - ${r}`);
    return 1;
  }
  return 0;
}

async function resolveSources(
  args: string[],
  baseRef: string | undefined,
  headRef: string | undefined,
  cwd: string,
): Promise<[SnapshotSource, SnapshotSource]> {
  if (args.length === 2) {
    if (baseRef || headRef) throw new UsageError("use either two paths or --base/--head, not both");
    const a = resolve(args[0]!);
    const b = resolve(args[1]!);
    const [sa, sb] = await Promise.all([stat(a), stat(b)]);
    if (sa.isFile() && sb.isFile()) {
      return [new SingleFileSource(a, basename(b)), new SingleFileSource(b, basename(b))];
    }
    if (sa.isDirectory() && sb.isDirectory()) {
      return [new DirectorySource(a, args[0]), new DirectorySource(b, args[1])];
    }
    throw new UsageError("both paths must be files, or both directories");
  }
  if (args.length !== 0) throw new UsageError("diff takes zero or two paths");
  const base = new GitSource(baseRef ?? "HEAD", cwd);
  const head = headRef ? new GitSource(headRef, cwd) : new DirectorySource(cwd, "working tree");
  return [base, head];
}

/** Treats one .json file as a snapshot set, so two files can be compared directly. */
class SingleFileSource implements SnapshotSource {
  readonly label: string;
  private readonly key: string;
  constructor(
    private readonly file: string,
    name: string,
  ) {
    this.label = file;
    this.key = `test_snapshots/${name}`;
  }
  async list() {
    return [this.key];
  }
  async read(path: string) {
    return path === this.key ? readFile(this.file, "utf8") : undefined;
  }
}
