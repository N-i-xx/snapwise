# Security policy

## Supported versions

Snapwise is pre-1.0. Only the latest release receives fixes.

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub's [private vulnerability reporting](https://github.com/N-thnl/snapwise/security/advisories/new) ("Report a vulnerability" under the Security tab). Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement within 5 working days, and we will agree on a disclosure timeline with you before anything is published.

## Scope and threat model

Things we consider security issues:

- The Action leaking or misusing the `github-token`, or writing anywhere other than its own PR comment, job summary, outputs and `$RUNNER_TEMP/snapwise/`.
- Snapshot content (which comes from the pull request and is untrusted) being able to inject active content into the PR comment. Values are HTML-escaped and code fences are sized to their content. Bypasses of this are in scope.
- Command injection through inputs or file names. Snapwise only runs `git` with argument arrays, never through a shell.
- Denial of service through crafted snapshots that make the Action hang or use excessive memory beyond the documented limits.

Out of scope: the correctness of the contracts being reviewed. Snapwise **reports** changes; it does not judge whether they are safe. A Snapwise comment that shows no auth changes is not a security audit.

## Recommended workflow permissions

```yaml
permissions:
  contents: read
  pull-requests: write
```

Avoid running Snapwise under `pull_request_target` with a checkout of the PR head unless you understand the risks of that event.
