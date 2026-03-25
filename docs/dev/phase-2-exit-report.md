# Phase 2 Exit Report

Completed:

- Vite main/preload/renderer builds are the default app entry path through `yarn run dev`, `yarn run pack`, `yarn run build`, and `yarn run release:*`.
- Vitest replaced Karma as the default unit runner through `yarn run unit`.
- Renderer runtime, filesystem, and search access now flow through the preload-backed native facade instead of direct renderer-side Node/Electron imports.
- The packaged runtime contract remains `dist/electron/{main.js,preload.js,index.html}` and is covered by Playwright smoke tests.

Current runtime entry points:

- `vite.main.config.js` -> `dist/electron/main.js`
- `vite.preload.config.js` -> `dist/electron/preload.js`
- `vite.renderer.config.js` + `src/renderer/index.html` -> `dist/electron/index.html` and renderer assets
- `tools/dev/vite-dev-runner.js` supervises the development workflow

Validation run at Phase 2 exit:

- `yarn run lint`
- `yarn run unit`
- `yarn run test:specs`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e`

Deferred to Phase 3+:

- Vue 3 / Router 4 / Pinia / Element Plus migration
- broader typed replacement for generic `app.*` and `events.*` IPC passthroughs
- stronger isolation such as `contextIsolation: true` and `sandbox`
- cleanup of now-unused build/test dependencies that are no longer needed after the webpack/Karma retirement
