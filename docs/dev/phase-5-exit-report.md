# Phase 5 Exit Report

Verification commands:

- `./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js test/unit/specs/phase-5-store-boundary.spec.js test/unit/specs/pinia-store-actions.spec.js test/unit/specs/renderer-bridge.spec.js`
- `yarn run validate-licenses`
- `yarn run unit`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-4-security-smoke.spec.js`
- `yarn run pack`
- `yarn run build:bin`

Explicit retained exception:

- `src/muya/webpack.config.js` remains for standalone Muya publishing and is documented in `docs/dev/VERSION_POLICY.md`

## Results

- Phase 5 contract suite: passed
  - `5` files, `18` tests passed
- `yarn run validate-licenses`: passed
- `yarn run unit`: passed
  - `25` files, `762` tests passed
  - the native adapter fallback tests emitted expected stderr when simulating missing native modules
- Playwright secure smoke: passed
  - `2` tests passed
- `yarn run pack`: passed
  - Vite emitted non-fatal chunk-size and CSS nesting warnings during renderer bundling
- `yarn run build:bin`: passed
  - final verification uncovered and fixed two baseline issues before the successful run:
    - `@electron/rebuild` CLI failed under Node `24.x`, so the `rebuild` script now uses `tools/build/rebuildNativeModules.mjs` with Electron's own ABI value
    - `electron-builder.yml` used outdated Linux desktop fields and now nests them under `linux.desktop.entry`

## Notes

- Commands run:
  - `./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js test/unit/specs/phase-5-store-boundary.spec.js test/unit/specs/pinia-store-actions.spec.js test/unit/specs/renderer-bridge.spec.js`
  - `env npm_execpath=/usr/lib/node_modules/yarn/bin/yarn.js /home/ayd/.npm/_npx/387698761821791d/node_modules/node/bin/node /usr/lib/node_modules/yarn/bin/yarn.js run validate-licenses`
  - `env npm_execpath=/usr/lib/node_modules/yarn/bin/yarn.js /home/ayd/.npm/_npx/387698761821791d/node_modules/node/bin/node /usr/lib/node_modules/yarn/bin/yarn.js run unit`
  - `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-4-security-smoke.spec.js`
  - `env npm_execpath=/usr/lib/node_modules/yarn/bin/yarn.js /home/ayd/.npm/_npx/387698761821791d/node_modules/node/bin/node /usr/lib/node_modules/yarn/bin/yarn.js run pack`
  - `env npm_execpath=/usr/lib/node_modules/yarn/bin/yarn.js /home/ayd/.npm/_npx/387698761821791d/node_modules/node/bin/node /usr/lib/node_modules/yarn/bin/yarn.js run build:bin`
- Commands that require Yarn in this workspace were executed with Node `24.x` and the Yarn classic `yarn.js` entrypoint because the host shell Node is `25.x` while repo preflight requires Node `24.x`.
- Platform-specific deviations:
  - `build:bin` downloaded the Electron `41.0.4` Linux x64 archive during packaging.
  - `electron-builder` emitted non-fatal warnings about using `@electron/rebuild` alongside electron-builder's own dependency handling and about dependency collector stderr noise from `npm`.
- Docs and workflows now match `.nvmrc`: confirmed by `test/unit/specs/phase-5-docs-ci-contract.spec.js` and manual spot checks of `README.md`, `docs/dev/*`, `.github/workflows/build.yml`, and `.github/workflows/release.yml`.
- `.electron-vue` status:
  - no live runtime/build/install files remain under `.electron-vue`
  - remaining tracked mentions are limited to contract tests, cleanup docs, and historical phase plan/spec documents that describe the removal work
