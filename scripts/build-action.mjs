// Bundles the GitHub Action into a single file, dist/index.mjs, which is
// committed so the action runs without an install step.
import { build } from "esbuild";

await build({
  entryPoints: ["src/action/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  legalComments: "linked",
  // Some dependencies still call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __snapwiseCreateRequire } from 'node:module';\nconst require = __snapwiseCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
