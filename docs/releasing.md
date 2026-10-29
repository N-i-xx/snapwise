# Releasing

Releases are cut by the maintainer. Nothing is published automatically.

1. Make sure `main` is green.
2. Update the version in **both** `package.json` and `src/version.ts`.
3. Move the `Unreleased` section of `CHANGELOG.md` under the new version and date.
4. Run `npm run all` and commit, including `dist/`:
   `git commit -am "chore: release vX.Y.Z"`
5. Tag and push:
   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```
6. Move the major tag so `@v0` users get the release:
   ```sh
   git tag -fa v0 -m "v0" && git push -f origin v0
   ```
7. Create the GitHub release from the tag, pasting the changelog section. To list the Action on the Marketplace, tick "Publish this Action to the GitHub Marketplace" in the release form (needs 2FA on the account and accepting the Marketplace agreement once).
8. Optional, after review: `npm publish` (run `npm pack --dry-run` first and check that only `lib/` is included).
