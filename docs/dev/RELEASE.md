# Releasing MarkText

The release process is staged. CI validates one revision, produces reviewable artifacts, and never publishes directly from a branch build. A maintainer publishes only after every required platform artifact, signature, checksum, and smoke test belongs to the same Git tag.

## Release boundary

Linux is the primary CI environment. It runs the complete quality gate and produces AppImage, Debian, RPM, and tar.gz artifacts. The bundled native modules are verified by executable format before packaging, so an ELF module cannot accidentally be shipped in a Windows or macOS application.

The current native dependencies (`keytar`, `native-keymap`, `fontmanager-redux`, and `ced`) are rebuilt for the host Electron ABI. Linux must not be presented as a working Windows or macOS cross-builder until target-native PE and Mach-O modules are staged and verified. macOS code signing and notarization also require Apple tooling and remain a short macOS or controlled signing-service step. This boundary is deliberate: an unsigned or wrong-architecture package is not a release artifact.

## Prepare a candidate

1. Create a release branch and choose the exact version.
2. Update `package.json`, `.github/CHANGELOG.md`, and `resources/linux/marktext.appdata.xml` to the same version.
3. Keep prerelease suffixes for beta or release-candidate builds. Remove the suffix only for a stable release.
4. Run `bun run doctor:release` and resolve required failures.
5. Run `bun install --frozen-lockfile`.
6. Run `bun run check:dependency-age --base <merge-base>` and confirm every new dependency version has aged at least seven days.
7. Run `bun run rebuild`, `bun run verify:native`, `bun run pack`, `bun run check`, and `bun run e2e:runtime`.
8. Tag the exact candidate revision as `v<package-version>`.

Pushing the tag starts `.github/workflows/release.yml`. A manual run is useful for rehearsal; enable its `stable` input only when the package version has no prerelease suffix.

## CI candidate output

The Linux release job installs from the frozen lockfile, validates the release environment, compares dependency versions with the previous Git tag, repeats release metadata checks, builds native modules and application bundles once, runs the non-UI and isolated E2E suites, and packages Linux artifacts. It uploads:

- `marktext-linux-<tag>` with packages and `SHA256SUMS.txt`
- `marktext-source-maps-<tag>` with source maps excluded from end-user packages
- E2E traces and screenshots when the release gate fails

Artifacts are retained for review and are not sent to a GitHub Release automatically.

## Complete platform artifacts

Build Windows and macOS packages from the same tag in controlled target environments until target-native dependency staging exists on Linux. Run `bun run verify:native --platform win32` or `--platform darwin` before the corresponding package command. Sign Windows packages as required. On macOS, sign, notarize, staple, and validate the application before accepting the DMG and ZIP.

Do not reuse `node_modules` between platforms. Install from `bun.lock`, rebuild native modules for the target Electron runtime, and preserve the exact toolchain versions recorded by `bun run doctor:release`.

## Publish

1. Download every staged artifact into one clean directory.
2. Generate a final checksum manifest with `bun run release:checksums <directory>`.
3. Verify install and launch smoke tests for every platform and architecture.
4. Create the GitHub Release for the exact tag, attach all platform artifacts and the checksum manifest, then publish it.
5. Update the website and documentation.
6. Update the Flathub manifest, test its bundle, and submit the version bump.

See [VERSION_POLICY.md](VERSION_POLICY.md) for the maintained runtime versions and supply-chain policy.
