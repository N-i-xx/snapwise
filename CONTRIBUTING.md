# Contributing to Snapwise

Thanks for your interest! Snapwise is small and every contribution is reviewed by a human. This guide explains how to set up, how to pick up work, and what a mergeable pull request looks like.

## Setup

You need **Node.js 22.12 or later** and **git**. Rust is only needed to regenerate the example contract's snapshots.

```sh
git clone https://github.com/N-thnl/snapwise && cd snapwise
npm ci
npm run all      # typecheck, lint, test, build, bundle the action
```

Useful commands:

| Command                | What it does                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| `npm test`             | Run the test suite (Vitest).                                                     |
| `npm run test:update`  | Update file snapshots in `test/__snapshots__/`. Read the diff before committing. |
| `npm run lint`         | ESLint and Prettier check. `npm run format` fixes formatting.                    |
| `npm run build:action` | Rebuild `dist/index.mjs`. Commit it if you changed anything the Action uses.     |
| `node lib/bin.js …`    | Run the CLI after `npm run build`.                                               |

To work on the example contract: `cd examples/vault && cargo test`. Install Rust with the `wasm32v1-none` target (see the [Stellar setup guide](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)).

## Picking up an issue

1. Find an issue labelled `good first issue` or `help wanted`.
2. **Comment to ask to be assigned, and wait until you are assigned before starting.** This avoids two people doing the same work. Unassigned PRs for issues someone else is assigned to will be closed.
3. If you are assigned but can't continue, say so in the issue so it can be reassigned. Issues with no activity for 7 days may be unassigned.
4. For ideas that have no issue yet, open a feature request first and wait for a maintainer to confirm the scope.

## Pull requests

- One issue per PR. Keep PRs focused; refactors go in their own PR.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `ci:`, `build:`.
- Add or update tests. Bug fixes need a test that fails without the fix.
- Update docs (`README.md`, `docs/`) when behaviour or options change, and add a line to `CHANGELOG.md` under **Unreleased**.
- `npm run all` must pass and `dist/` must be up to date. CI checks both.
- Fill in the PR template, including how you tested the change.

Code style: TypeScript strict mode, no new runtime dependencies for the library or CLI without discussion, small pure functions, and comments that explain _why_ rather than _what_. See [docs/architecture.md](docs/architecture.md) and [docs/extending.md](docs/extending.md).

## Drips Wave contributors

Snapwise takes part in the [Drips Stellar Wave](https://www.drips.network/wave/stellar). Issues eligible for Wave rewards carry a complexity label, which sets the points awarded when the PR is merged:

| Label                 | Points | Typical scope                                                                                      |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `complexity: trivial` | 100    | Docs fixes, small refactors, a single test, one-line behaviour changes.                            |
| `complexity: medium`  | 150    | A self-contained feature or bug fix touching a few files, with tests.                              |
| `complexity: high`    | 200    | A larger feature crossing modules (new output format, new Action capability), with tests and docs. |

Wave rules that apply here:

- The **assignment rule above applies**: only the assigned contributor's PR is eligible.
- Points are awarded for **merged** PRs that resolve the issue as described. Partial work, or work that needs heavy rewriting by the maintainer, may not qualify.
- The maintainer may adjust an issue's complexity label before assignment if the scope turns out different. The label at the time of assignment is what counts.
- Low-effort or automated submissions (for example unreviewed AI output that doesn't build) will be closed.

## Reporting bugs and security issues

Use the bug report template for bugs. **Do not open public issues for security problems.** Follow [SECURITY.md](SECURITY.md) instead.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
