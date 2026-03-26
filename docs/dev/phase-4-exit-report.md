# Phase 4 Exit Report

Verification commands run in this workspace:

- `./node_modules/.bin/vitest run test/unit/specs/phase-4-runtime-deps.spec.js test/unit/specs/phase-4-security-audit.spec.js`
- `./node_modules/.bin/vitest run test/unit/specs/native-module-adapters.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js`
- `./node_modules/.bin/vitest run test/unit/specs/phase-4-async-bridge.spec.js test/unit/specs/renderer-runtime.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/phase-4-security-audit.spec.js`
- `./node_modules/.bin/vitest run test/unit/specs/window-security.spec.js`
- `./node_modules/.bin/vitest run test/unit/specs/phase-4-runtime-deps.spec.js test/unit/specs/native-build-contract.spec.js`
- `yarn run rebuild`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/phase-4-security-smoke.spec.js test/e2e/xss.spec.js`

Manual native verification:

- Not run in this workspace:
  - macOS Keychain verification for `keytar`
  - Windows Credential Manager verification for `keytar`
  - Linux libsecret verification for `keytar`
  - preferences font dropdown manual inspection on each release target
  - keyboard debug dump manual verification from the preferences page on each release target

Observed notes:

- The runtime/tooling contract was adjusted to `node >=24` while keeping `.nvmrc` pinned to `24`, per user instruction.
- `yarn run rebuild` completed successfully in the current environment after making the rebuild CLI invocation compatible with the installed binary.
- `yarn run pack` completed successfully after the sandboxed renderer baseline changes.
- Security/XSS packaged smoke checks passed with `window.process` and `window.require` absent in the renderer.

Deferred to Phase 5:

- shrinking the remaining generic `nativeApi.app.send/invoke` surface
- removing any fallback branches only needed during runtime migration
- completing platform-by-platform manual native verification and release-environment validation
