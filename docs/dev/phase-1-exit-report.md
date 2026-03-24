# Phase 1 Exit Report

## Scope Closed In Phase 1

- A preload bridge now exists at `src/main/preload/index.js` and is bundled to `dist/electron/preload.js`.
- Renderer-side `@electron/remote` usage has been removed from application code.
- Renderer-side `electron` imports are replaced by the facade in `src/renderer/services/nativeApi/*`.
- ESLint now blocks direct `electron` and `@electron/remote` imports under `src/renderer/**/*.{js,vue}`.

Phase 1 standardized the renderer boundary without changing the broader runtime model. To keep the current electron-vue renderer boot path working, `contextIsolation` remains `false` in `src/main/config.js`. The preload boundary is in place, but stronger isolation is intentionally deferred.

## Deferred To Phase 2

- build-chain migration to Vite
- test runner migration from Karma to Vitest
- broader Node API isolation / preload surface reduction

## Phase 2 Planning Checkpoint

Before starting Phase 2, re-evaluate:

- Preload surface area that should be reduced. The current bridge still exposes broad passthroughs such as `app.send`, `app.sendSync`, `app.invoke`, `events.emit`, and `events.on/once/off`, plus synchronous clipboard access. Tighten these to narrower capability-specific methods where possible.
- Any remaining renderer Node APIs. Renderer code still depends on Node primitives such as `path`, `process.platform`, `global.marktext`, and direct `fs` / `fs-extra` / `child_process` / `os` usage in file-system, export, and search helpers. These call sites define the remaining isolation scope.
- The best Electron + Vite integration strategy. Choose a migration path that preserves the current Electron Builder packaging contract while replacing webpack with a Vite-based main/preload/renderer pipeline and keeping the preload boundary explicit.
- The minimal smoke suite to preserve during the build migration. At minimum, keep coverage for `yarn run pack`, `test/unit/specs/renderer-bridge.spec.js`, `test/unit/specs/renderer-boundary-eslint.spec.js`, and the Playwright launch plus bridge smoke coverage under `test/e2e`.

## Handoff Notes

Key Phase 1 milestones on this branch:

- `8561ebc2` `test: define renderer bridge baseline`
- `8a131e94` `feat: add preload bridge skeleton`
- `1c14f667` `refactor: migrate window controls to preload bridge`
- `31f78cc7` `test: cover bridge titlebar and menu payload paths`
- `709c1a11` `refactor: move clipboard and shell access behind bridge`
- `cf00d4a9` `refactor: centralize renderer ipc access`
- `942dd618` `chore: remove electron remote from renderer boundary`
- `78b9c790` `test: harden renderer boundary lint guardrail`
