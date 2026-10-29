#!/usr/bin/env node
import { main, UsageError } from "./cli.js";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`snapwise: ${err.message}
Run "snapwise --help" for usage.`);
    } else {
      console.error(`snapwise: ${(err as Error)?.message ?? String(err)}`);
    }
    process.exitCode = 2;
  },
);
