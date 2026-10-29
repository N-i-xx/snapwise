# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- Semantic diff of Soroban test snapshots: storage values, entry TTLs (`live_until`), events of the last call, authorization trees, and ledger settings.
- Ledger entries matched by identity (contract, durability, key), with instance storage split into one row per key and auth nonces hidden by default.
- Compact rendering of ScVal values (`250i128`, `Shares(CAAA…K3IM)`), with a JSON fallback for unknown types.
- CLI: `snapwise diff` (git refs, working tree, directories or single files) and `snapwise show`, with text, Markdown and JSON (`schemaVersion: 1`) output and `--fail-on`.
- GitHub Action: one sticky PR comment, job summary, outputs, `fail-on` policy, and graceful handling of read-only tokens on fork PRs.
- Example vault contract (soroban-sdk 29.0.1) with committed snapshots, and real before/after fixtures.

[Unreleased]: https://github.com/N-i-xx/snapwise/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/N-i-xx/snapwise/releases/tag/v0.1.0
