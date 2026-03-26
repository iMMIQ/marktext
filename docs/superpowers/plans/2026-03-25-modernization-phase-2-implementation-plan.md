# Modernization Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the electron-vue webpack/Karma workflow with a Vite main/preload/renderer pipeline and a Vitest-based unit suite, while keeping the current Electron 18 + Vue 2 application working and moving renderer-only Node access behind the preload boundary so the app can still launch, edit, save, and package throughout the migration.

**Architecture:** Phase 2 keeps the Phase 1 preload boundary but reshapes it for a Vite world. Renderer boot must stop depending on ambient Node globals such as `global.marktext`, `process.platform`, `fs`, and `child_process`; instead it will read runtime, filesystem, and search capabilities from preload-backed facades and keep all OS/process work in main-process IPC handlers. Build output must still land in `dist/electron/{main.js,preload.js,index.html}` so `package.json#main`, Playwright, and `electron-builder.yml` remain valid while webpack ceases to be the primary app entry path.

**Tech Stack:** Electron 18, Vue 2.6, Vue Router 3, Vuex 3, Element UI 2, Vite, `vite-plugin-vue2`, Vitest, Playwright, Electron Builder.

---

## Planning Notes

- This plan intentionally covers **Phase 2 only** from `docs/superpowers/specs/2026-03-24-modernization-dependency-migration-design.md`.
- Keep Electron, Vue, Vuex, Vue Router, and Element UI major versions unchanged in this phase. Vue 3, Router 4, Pinia, and Element Plus remain Phase 3 work.
- Preserve the packaging contract:
  - `package.json#main` stays `./dist/electron/main.js`
  - `src/main/config.js` still points BrowserWindows at `dist/electron/preload.js`
  - `electron-builder.yml` still packages `dist/electron/**/*`
- Do not try to remove webpack from the repository entirely. `src/muya/webpack.config.js` still builds the standalone Muya bundle and can remain until a later, separate plan covers it.
- During execution, use `@superpowers:test-driven-development` for each task and `@superpowers:verification-before-completion` before claiming the phase is done.

## File Structure

### Build And Tooling

- Create `tools/vite/marktextEnvironment.js`
  - Shared build-time version/hash/env definitions for Vite main, preload, renderer, and Vitest.
- Create `tools/vite/codemirrorAssets.js`
  - Serves/copies the CodeMirror mode directory and static assets in a Vite-compatible way for both dev and build.
- Create `tools/dev/vite-dev-runner.js`
  - Replaces `.electron-vue/dev-runner.js` as the primary development entry point.
- Create `vite.renderer.config.js`
  - Vue 2 renderer build, aliasing, raw asset handling, output path, and dev server settings.
- Create `vite.main.config.js`
  - Main-process bundle to `dist/electron/main.js`.
- Create `vite.preload.config.js`
  - Preload bundle to `dist/electron/preload.js`.
- Create `vitest.config.js`
  - Unit-test runner config that replaces the current Karma+webpack harness.

### Renderer Runtime Boundary

- Create `src/main/ipc/renderer/runtime.js`
  - Main-process handler that returns renderer-safe runtime metadata.
- Create `src/main/ipc/renderer/filesystem.js`
  - Main-process handlers for filesystem/export operations currently executed in renderer.
- Create `src/main/ipc/renderer/search.js`
  - Main-process handlers for quick-open and sidebar search.
- Create `src/main/search/ripgrepPath.js`
  - Main-side ripgrep resolution moved out of renderer.
- Create `src/main/search/ripgrepDirectorySearcher.js`
  - Main-side text search implementation moved out of `src/renderer/node`.
- Create `src/main/search/fileSearcher.js`
  - Main-side file search implementation moved out of `src/renderer/node`.
- Create `src/renderer/services/nativeApi/runtime.js`
  - Renderer facade for runtime metadata.
- Create `src/renderer/services/nativeApi/filesystem.js`
  - Renderer facade for async filesystem/export operations.
- Create `src/renderer/services/nativeApi/search.js`
  - Renderer facade for quick-open/sidebar search.
- Create `src/renderer/services/runtime/index.js`
  - Runtime snapshot store used instead of `global.marktext`.

### Renderer Consumers That Must Stop Reaching Into Node

- Modify `src/renderer/bootstrap.js`
  - Make bootstrap async and initialize renderer runtime state from preload.
- Modify `src/renderer/main.js`
  - Await runtime bootstrap before mounting Vue; remove build-path assumptions that only work under webpack/electron-vue.
- Modify `src/renderer/store/index.js`
  - Read platform/app version from runtime state instead of `process.*`.
- Modify `src/renderer/util/index.js`
  - Replace `process.platform` helpers with runtime helpers.
- Modify `src/renderer/commands/utils.js`
  - Replace `process.resourcesPath` / platform checks with runtime-backed methods.
- Modify `src/renderer/store/preferences.js`
- Modify `src/renderer/store/layout.js`
- Modify `src/renderer/store/editor.js`
- Modify `src/renderer/commands/quickOpen.js`
- Modify `src/renderer/components/sideBar/search.vue`
- Modify `src/renderer/prefComponents/keybindings/index.vue`
- Modify `src/renderer/pages/app.vue`
- Modify `src/renderer/pages/preference.vue`
- Modify `src/renderer/util/fileSystem.js`
- Modify `src/renderer/util/pdf.js`
- Modify `src/renderer/components/exportSettings/index.vue`
  - These files currently depend on `global.marktext`, `process.platform`, `fs`, `fs-extra`, `child_process`, or renderer-local ripgrep helpers.

### Vite Compatibility Conversions

- Create `src/renderer/index.html`
  - Replaces the webpack-only `src/index.ejs` runtime HTML entry.
- Modify `src/renderer/prefComponents/theme/index.vue`
  - Convert Markdown import to Vite raw import syntax.
- Modify `src/renderer/util/themeColor.js`
  - Convert CSS-string imports to `?inline`.
- Modify `src/renderer/util/pdf.js`
  - Convert export theme CSS imports to `?inline` and remove direct disk reads from renderer.
- Modify `src/muya/lib/utils/exportHtml.js`
  - Convert CSS-string imports to `?inline`.

### Tests And Docs

- Create `test/unit/setup.js`
  - Shared Vitest globals/stubs.
- Create `test/unit/specs/renderer-runtime.spec.js`
  - Runtime bootstrap contract tests.
- Create `test/unit/specs/renderer-filesystem.spec.js`
  - Filesystem/search facade tests.
- Create `test/e2e/build-contract.spec.js`
  - Smoke coverage for the Vite output contract.
- Modify existing `test/unit/specs/*.spec.js`
  - Port away from Karma-specific assumptions.
- Modify `test/e2e/helpers.js`
  - Keep launch helpers aligned with the dist contract if script names or timeouts change.
- Modify `docs/dev/BUILD.md`
- Modify `docs/dev/ARCHITECTURE.md`
- Create `docs/dev/phase-2-exit-report.md`
  - Record the final Vite/Vitest entry points and any deferred cleanup.

### Old Primary Entry Files To Retire At Phase Exit

- Delete `test/unit/index.js`
- Delete `test/unit/karma.conf.js`
- Delete `.electron-vue/build.js`
- Delete `.electron-vue/dev-runner.js`
- Delete `.electron-vue/dev-client.js`
- Delete `.electron-vue/webpack.main.config.js`
- Delete `.electron-vue/webpack.renderer.config.js`
- Delete `.electron-vue/marktextEnvironment.js`

## Tasks

### Task 1: Add A Parallel Vitest Harness

**Files:**
- Create: `vitest.config.js`
- Create: `test/unit/setup.js`
- Modify: `package.json`
- Modify: `test/unit/specs/renderer-bridge.spec.js`
- Modify: `test/unit/specs/renderer-boundary-eslint.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`
- Test: `test/unit/specs/renderer-boundary-eslint.spec.js`

- [ ] **Step 1: Make the Phase 1 guardrail specs runnable under Vitest**

```js
// @vitest-environment node
import { describe, expect, it } from 'vitest'

describe('renderer boundary eslint guardrail', () => {
  it('rejects direct electron imports in renderer sources', () => {
    // same assertions as the current Karma test, but without relying on Karma globals
  })
})
```

- [ ] **Step 2: Run the new Vitest entry point before implementing it**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js
```

Expected:

- FAIL with `Command "unit:vite" not found` or missing `vitest`/config errors.

- [ ] **Step 3: Add the minimal Vitest config and script**

```js
import path from 'path'
import { defineConfig } from 'vitest/config'
import createVuePlugin from 'vite-plugin-vue2'

export default defineConfig({
  plugins: [createVuePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      muya: path.resolve(__dirname, 'src/muya')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['test/unit/setup.js'],
    include: ['test/unit/specs/**/*.spec.js'],
    exclude: ['test/unit/specs/**/*.js_disabled']
  }
})
```

- [ ] **Step 4: Run the two guardrail specs under Vitest**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js
```

Expected:

- PASS for both specs under Vitest.

- [ ] **Step 5: Commit the new test harness**

```bash
git add vitest.config.js test/unit/setup.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js package.json
git commit -m "test: add vitest harness"
```

### Task 2: Replace Ambient Renderer Runtime Globals

**Files:**
- Create: `test/unit/specs/renderer-runtime.spec.js`
- Create: `src/main/ipc/renderer/runtime.js`
- Create: `src/renderer/services/nativeApi/runtime.js`
- Create: `src/renderer/services/runtime/index.js`
- Modify: `src/main/ipc/renderer/index.js`
- Modify: `src/main/preload/index.js`
- Modify: `src/renderer/services/nativeApi/index.js`
- Modify: `src/renderer/bootstrap.js`
- Modify: `src/renderer/main.js`
- Modify: `src/renderer/store/index.js`
- Modify: `src/renderer/util/index.js`
- Modify: `src/renderer/commands/utils.js`
- Modify: `src/renderer/store/preferences.js`
- Modify: `src/renderer/store/layout.js`
- Modify: `src/renderer/store/editor.js`
- Modify: `src/renderer/commands/quickOpen.js`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `src/renderer/pages/app.vue`
- Modify: `src/renderer/pages/preference.vue`
- Modify: `src/renderer/util/pdf.js`
- Modify: `src/renderer/components/exportSettings/index.vue`
- Test: `test/unit/specs/renderer-runtime.spec.js`
- Test: `test/e2e/launch.spec.js`
- Test: `test/e2e/bridge-smoke.spec.js`

- [ ] **Step 1: Write a failing runtime bootstrap contract test**

```js
import { afterEach, describe, expect, it } from 'vitest'
import { getRuntime, initializeRuntime, resetRuntime } from '@/services/runtime'

describe('renderer runtime bootstrap', () => {
  afterEach(() => {
    resetRuntime()
    delete window.mtNative
  })

  it('hydrates runtime info from preload', async () => {
    window.mtNative = {
      runtime: {
        getInfo: () => Promise.resolve({
          platform: 'linux',
          appVersion: 'v0.17.1',
          env: {
            debug: true,
            windowId: 7,
            type: 'editor'
          },
          paths: {
            userDataPath: '/tmp/marktext-user-data',
            logPath: '/tmp/marktext-user-data/logs',
            ripgrepBinaryPath: '/usr/bin/rg'
          }
        })
      }
    }

    await initializeRuntime()

    expect(getRuntime().platform).toBe('linux')
    expect(getRuntime().env.windowId).toBe(7)
    expect(getRuntime().paths.ripgrepBinaryPath).toBe('/usr/bin/rg')
  })
})
```

- [ ] **Step 2: Verify the test fails before the runtime service exists**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-runtime.spec.js
```

Expected:

- FAIL because `@/services/runtime` and/or `window.mtNative.runtime` do not exist yet.

- [ ] **Step 3: Implement the runtime bridge and replace `global.marktext` consumers**

```js
// src/renderer/services/runtime/index.js
let runtime = null

export const initializeRuntime = async () => {
  runtime = Object.freeze(await window.mtNative.runtime.getInfo())
  return runtime
}

export const getRuntime = () => {
  if (!runtime) {
    throw new Error('Renderer runtime not initialized')
  }
  return runtime
}
```

Implementation notes:

- `src/main/ipc/renderer/runtime.js` should return only renderer-safe data:
  - `platform`
  - `appVersion`
  - `env.debug`
  - `env.windowId`
  - `env.type`
  - `paths.userDataPath`
  - `paths.logPath`
  - `paths.ripgrepBinaryPath`
- `src/renderer/main.js` must await `bootstrapRenderer()` before creating the router and mounting Vue.
- Replace reads of:
  - `process.platform`
  - `process.versions.MARKTEXT_VERSION_STRING`
  - `global.marktext.*`
  with `getRuntime()`.

- [ ] **Step 4: Re-run unit and smoke coverage**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-runtime.spec.js test/unit/specs/renderer-bridge.spec.js
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- Runtime unit tests pass.
- Launch and bridge smoke still pass after renderer bootstrap becomes async.

- [ ] **Step 5: Commit the runtime boundary change**

```bash
git add test/unit/specs/renderer-runtime.spec.js src/main/ipc/renderer/runtime.js src/main/preload/index.js src/main/ipc/renderer/index.js src/renderer/services/nativeApi/index.js src/renderer/services/nativeApi/runtime.js src/renderer/services/runtime/index.js src/renderer/bootstrap.js src/renderer/main.js src/renderer/store/index.js src/renderer/util/index.js src/renderer/commands/utils.js src/renderer/store/preferences.js src/renderer/store/layout.js src/renderer/store/editor.js src/renderer/commands/quickOpen.js src/renderer/prefComponents/keybindings/index.vue src/renderer/pages/app.vue src/renderer/pages/preference.vue src/renderer/util/pdf.js src/renderer/components/exportSettings/index.vue
git commit -m "refactor: expose renderer runtime through preload"
```

### Task 3: Move Renderer Filesystem And Search Work Behind IPC

**Files:**
- Create: `test/unit/specs/renderer-filesystem.spec.js`
- Create: `src/main/ipc/renderer/filesystem.js`
- Create: `src/main/ipc/renderer/search.js`
- Create: `src/main/search/ripgrepPath.js`
- Create: `src/main/search/ripgrepDirectorySearcher.js`
- Create: `src/main/search/fileSearcher.js`
- Create: `src/renderer/services/nativeApi/filesystem.js`
- Create: `src/renderer/services/nativeApi/search.js`
- Modify: `src/main/ipc/renderer/index.js`
- Modify: `src/main/preload/index.js`
- Modify: `src/renderer/services/nativeApi/index.js`
- Modify: `src/renderer/util/fileSystem.js`
- Modify: `src/renderer/components/sideBar/search.vue`
- Modify: `src/renderer/commands/quickOpen.js`
- Delete: `src/renderer/node/paths.js`
- Delete: `src/renderer/node/fileSearcher.js`
- Delete: `src/renderer/node/ripgrepSearcher.js`
- Test: `test/unit/specs/renderer-filesystem.spec.js`

- [ ] **Step 1: Write a failing facade test for filesystem and search bridging**

```js
import { describe, expect, it, vi } from 'vitest'
import nativeApi from '@/services/nativeApi'

describe('renderer filesystem and search facades', () => {
  it('proxy operations through preload instead of Node builtins', async () => {
    const create = vi.fn(() => Promise.resolve())
    const searchText = vi.fn(() => Promise.resolve([
      { filePath: '/tmp/demo.md', matches: [] }
    ]))

    window.mtNative = {
      filesystem: {
        create
      },
      search: {
        searchText
      }
    }

    await nativeApi.filesystem.create('/tmp/demo', 'directory')
    const matches = await nativeApi.search.searchText(['/tmp'], 'demo', {
      isRegexp: false,
      isCaseSensitive: false
    })

    expect(create).toHaveBeenCalledWith('/tmp/demo', 'directory')
    expect(matches).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Confirm the new bridge test fails first**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-filesystem.spec.js
```

Expected:

- FAIL because `nativeApi.filesystem` and `nativeApi.search` do not exist yet.

- [ ] **Step 3: Implement main-side search/filesystem services and browser-safe renderer clients**

```js
// src/main/preload/index.js
filesystem: {
  create: (pathname, type) => ipcRenderer.invoke('mt::fs-create', pathname, type),
  paste: payload => ipcRenderer.invoke('mt::fs-paste', payload),
  rename: (src, dest) => ipcRenderer.invoke('mt::fs-rename', src, dest),
  moveToRelativeFolder: payload => ipcRenderer.invoke('mt::fs-move-to-relative-folder', payload),
  moveImageToFolder: payload => ipcRenderer.invoke('mt::fs-move-image-to-folder', payload),
  uploadImage: payload => ipcRenderer.invoke('mt::fs-upload-image', payload),
  isFileExecutable: filepath => ipcRenderer.invoke('mt::fs-is-file-executable', filepath)
},
search: {
  searchFiles: (rootPath, options) => ipcRenderer.invoke('mt::search-files', rootPath, options),
  searchText: (directories, pattern, options) => ipcRenderer.invoke('mt::search-text', directories, pattern, options)
}
```

Implementation notes:

- Move ripgrep process spawning from `src/renderer/node/*` to `src/main/search/*`.
- Keep `src/renderer/util/fileSystem.js` browser-safe:
  - pure hash/path helpers may stay
  - file IO, `child_process`, and `os.tmpdir()` must move behind `nativeApi.filesystem`
- `src/renderer/components/sideBar/search.vue` and `src/renderer/commands/quickOpen.js` should call the new search facade, not instantiate local ripgrep classes.

- [ ] **Step 4: Re-run the new filesystem/search tests**

Run:

```bash
yarn run unit:vite --run test/unit/specs/renderer-filesystem.spec.js test/unit/specs/renderer-runtime.spec.js test/unit/specs/renderer-bridge.spec.js
```

Expected:

- PASS for the new filesystem/search bridge contract.
- No renderer test imports `fs`, `fs-extra`, `child_process`, or `os` through app runtime code paths.

- [ ] **Step 5: Commit the Node-isolation move**

```bash
git add test/unit/specs/renderer-filesystem.spec.js src/main/ipc/renderer/filesystem.js src/main/ipc/renderer/search.js src/main/ipc/renderer/index.js src/main/search/ripgrepPath.js src/main/search/ripgrepDirectorySearcher.js src/main/search/fileSearcher.js src/main/preload/index.js src/renderer/services/nativeApi/index.js src/renderer/services/nativeApi/filesystem.js src/renderer/services/nativeApi/search.js src/renderer/util/fileSystem.js src/renderer/components/sideBar/search.vue src/renderer/commands/quickOpen.js
git rm src/renderer/node/paths.js src/renderer/node/fileSearcher.js src/renderer/node/ripgrepSearcher.js
git commit -m "refactor: move renderer file access behind ipc"
```

### Task 4: Add A Vite Renderer Build That Preserves `dist/electron/index.html`

**Files:**
- Create: `vite.renderer.config.js`
- Create: `tools/vite/codemirrorAssets.js`
- Create: `src/renderer/index.html`
- Modify: `package.json`
- Modify: `src/renderer/main.js`
- Modify: `src/renderer/prefComponents/theme/index.vue`
- Modify: `src/renderer/util/themeColor.js`
- Modify: `src/renderer/util/pdf.js`
- Modify: `src/muya/lib/utils/exportHtml.js`
- Test: `src/renderer/index.html`

- [ ] **Step 1: Add a renderer build command that does not exist yet**

```bash
yarn run pack:renderer:vite
```

Expected:

- FAIL with `Command "pack:renderer:vite" not found`.

- [ ] **Step 2: Convert webpack-only raw asset imports to Vite-compatible imports**

```js
import themeMd from './theme.md?raw'
import darkTheme from '../assets/themes/dark.theme.css?inline'
import academicTheme from '@/assets/themes/export/academic.theme.css?inline'
import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline'
```

- [ ] **Step 3: Add the Vite renderer config and HTML entry**

```js
import path from 'path'
import { defineConfig } from 'vite'
import createVuePlugin from 'vite-plugin-vue2'
import marktextCodemirrorAssets from './tools/vite/codemirrorAssets'

export default defineConfig({
  plugins: [createVuePlugin(), marktextCodemirrorAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      common: path.resolve(__dirname, 'src/common'),
      muya: path.resolve(__dirname, 'src/muya'),
      snapsvg: path.resolve(__dirname, 'src/muya/lib/assets/libs/snap.svg-min.js'),
      path: 'path-browserify'
    }
  },
  server: {
    host: '127.0.0.1',
    port: 9091,
    strictPort: true
  },
  build: {
    outDir: 'dist/electron',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
```

Implementation notes:

- `src/renderer/index.html` should carry over the loading spinner and theme-color logic from `src/index.ejs`, but use plain HTML and Vite’s module entry instead of EJS injection.
- Remove `vue-electron` from `src/renderer/main.js`; it is unused and couples renderer startup to the old electron-vue setup.
- Remove renderer-side `source-map-support` usage if it blocks the Vite browser bundle.

- [ ] **Step 4: Build the renderer through Vite**

Run:

```bash
yarn run pack:renderer:vite
test -f dist/electron/index.html
```

Expected:

- Vite emits `dist/electron/index.html`.
- Renderer assets are emitted under `dist/electron/assets/`.

- [ ] **Step 5: Commit the renderer Vite pipeline**

```bash
git add vite.renderer.config.js tools/vite/codemirrorAssets.js src/renderer/index.html src/renderer/main.js src/renderer/prefComponents/theme/index.vue src/renderer/util/themeColor.js src/renderer/util/pdf.js src/muya/lib/utils/exportHtml.js package.json
git commit -m "build: add vite renderer pipeline"
```

### Task 5: Add Vite Main And Preload Builds

**Files:**
- Create: `tools/vite/marktextEnvironment.js`
- Create: `vite.main.config.js`
- Create: `vite.preload.config.js`
- Modify: `package.json`
- Modify: `src/main/globalSetting.js`
- Test: `vite.main.config.js`
- Test: `vite.preload.config.js`

- [ ] **Step 1: Run the missing main/preload Vite build**

```bash
yarn run pack:main:vite
```

Expected:

- FAIL with `Command "pack:main:vite" not found`.

- [ ] **Step 2: Add shared Vite env definitions for main, preload, and renderer**

```js
const { builtinModules } = require('module')
const { version } = require('../package.json')

const getExternalModules = dependencies => [
  'electron',
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`),
  ...Object.keys(dependencies || {})
]

const getMarkTextDefines = () => ({
  'global.MARKTEXT_VERSION': JSON.stringify(version),
  'global.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}`),
  'process.versions.MARKTEXT_VERSION': JSON.stringify(version),
  'process.versions.MARKTEXT_VERSION_STRING': JSON.stringify(`v${version}`)
})
```

- [ ] **Step 3: Implement Vite library builds that still write `main.js` and `preload.js`**

```js
export default defineConfig({
  build: {
    outDir: 'dist/electron',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.js'),
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: getExternalModules(pkg.dependencies)
    }
  }
})
```

Implementation notes:

- Mirror the same pattern for `src/main/preload/index.js` -> `dist/electron/preload.js`.
- Keep `src/main/globalSetting.js` compatible with the new dist layout so `__static` still resolves in packaged builds.

- [ ] **Step 4: Build main and preload through Vite**

Run:

```bash
yarn run pack:main:vite
test -f dist/electron/main.js
test -f dist/electron/preload.js
```

Expected:

- Both files exist in `dist/electron/`.
- The build uses Vite, not `.electron-vue/webpack.main.config.js`.

- [ ] **Step 5: Commit the Vite main/preload pipeline**

```bash
git add tools/vite/marktextEnvironment.js vite.main.config.js vite.preload.config.js src/main/globalSetting.js package.json
git commit -m "build: add vite main and preload bundles"
```

### Task 6: Switch Default Dev And Pack Scripts To Vite And Protect The Dist Contract

**Files:**
- Create: `tools/dev/vite-dev-runner.js`
- Create: `test/e2e/build-contract.spec.js`
- Modify: `package.json`
- Modify: `test/e2e/helpers.js`
- Test: `test/e2e/build-contract.spec.js`
- Test: `test/e2e/launch.spec.js`
- Test: `test/e2e/bridge-smoke.spec.js`

- [ ] **Step 1: Add a failing smoke test for the packaged dist contract**

```js
const fs = require('fs')
const path = require('path')
const { expect, test } = require('@playwright/test')

test('pack emits the Electron runtime contract files', async () => {
  const outDir = path.resolve('dist/electron')
  expect(fs.existsSync(path.join(outDir, 'main.js'))).toBeTruthy()
  expect(fs.existsSync(path.join(outDir, 'preload.js'))).toBeTruthy()
  expect(fs.existsSync(path.join(outDir, 'index.html'))).toBeTruthy()
})
```

- [ ] **Step 2: Verify the new Vite dev entry is missing before adding it**

Run:

```bash
yarn run dev:vite
```

Expected:

- FAIL with `Command "dev:vite" not found`.

- [ ] **Step 3: Implement the Vite dev supervisor and switch primary scripts**

```js
// tools/dev/vite-dev-runner.js
await Promise.all([
  startRendererDevServer({ host: '127.0.0.1', port: 9091 }),
  watchMainBundle(),
  watchPreloadBundle()
])

restartElectronOnBundleChange('dist/electron/main.js')
```

Implementation notes:

- `package.json` should transition in two steps:
  - add `dev:vite`, `pack:renderer:vite`, `pack:main:vite`, `pack:vite`
  - then point `dev`, `pack`, `build`, `build:bin`, and `release:*` at the Vite-backed pack flow
- `test/e2e/helpers.js` must continue launching `dist/electron/main.js`; do not change the Playwright runtime contract.

- [ ] **Step 4: Run the pack flow and Playwright smoke suite**

Run:

```bash
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js test/e2e/build-contract.spec.js
```

Expected:

- `pack` now uses Vite outputs.
- Launch, bridge, and build-contract smoke tests pass.

- [ ] **Step 5: Commit the primary script switch**

```bash
git add tools/dev/vite-dev-runner.js test/e2e/build-contract.spec.js test/e2e/helpers.js package.json
git commit -m "build: switch app scripts to vite"
```

### Task 7: Port The Remaining Unit Suite, Retire Karma, And Record Phase Exit

**Files:**
- Modify: `test/unit/specs/match-electron-accelerator.spec.js`
- Modify: `test/unit/specs/extract-word.spec.js`
- Modify: `test/unit/specs/markdown-basic.spec.js`
- Modify: `test/unit/specs/markdown-footnotes.spec.js`
- Modify: `test/unit/specs/markdown-list-indentation.spec.js`
- Modify: `package.json`
- Modify: `docs/dev/BUILD.md`
- Modify: `docs/dev/ARCHITECTURE.md`
- Create: `docs/dev/phase-2-exit-report.md`
- Delete: `test/unit/index.js`
- Delete: `test/unit/karma.conf.js`
- Delete: `.electron-vue/build.js`
- Delete: `.electron-vue/dev-runner.js`
- Delete: `.electron-vue/dev-client.js`
- Delete: `.electron-vue/webpack.main.config.js`
- Delete: `.electron-vue/webpack.renderer.config.js`
- Delete: `.electron-vue/marktextEnvironment.js`
- Test: `test/unit/specs/*.spec.js`
- Test: `test/e2e/*.spec.js`

- [ ] **Step 1: Port the remaining unit specs off Karma assumptions**

```js
import { describe, expect, it } from 'vitest'
import ContentState from '../../../src/muya/lib/contentState'

describe('Muya parser', () => {
  it('Basic Text Formatting', () => {
    expect(exportedMarkdown).to.equal(markdown)
  })
})
```

Implementation notes:

- Each spec must import what it uses directly.
- No spec may depend on `require.context`, Karma preprocessors, or webpack-only globals.

- [ ] **Step 2: Run the full Vitest suite before removing Karma files**

Run:

```bash
yarn run unit:vite
```

Expected:

- PASS for the migrated unit subset.
- Any remaining failures must be fixed before deleting Karma config.

- [ ] **Step 3: Switch the default unit script, delete old primary entry files, and write the exit report**

```md
# Phase 2 Exit Report

Completed:

- Vite main/preload/renderer build is the default path
- Vitest replaced Karma for the unit suite
- renderer runtime/file/search dependencies no longer require direct Node access

Deferred to Phase 3+:

- Vue 3 / Router 4 / Pinia / Element Plus migration
- broader typed replacement for generic `app.*` and `events.*` IPC passthroughs
- stronger isolation such as `contextIsolation: true` and `sandbox`
```

- [ ] **Step 4: Run the full validation set**

Run:

```bash
yarn run lint
yarn run unit
yarn run test:specs
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e
```

Expected:

- Lint passes.
- Vitest unit suite passes through `yarn run unit`.
- Markdown spec tests pass unchanged.
- Playwright smoke tests pass against the Vite-built app.

- [ ] **Step 5: Commit the Phase 2 exit state**

```bash
git add test/unit/specs/match-electron-accelerator.spec.js test/unit/specs/extract-word.spec.js test/unit/specs/markdown-basic.spec.js test/unit/specs/markdown-footnotes.spec.js test/unit/specs/markdown-list-indentation.spec.js package.json docs/dev/BUILD.md docs/dev/ARCHITECTURE.md docs/dev/phase-2-exit-report.md
git rm test/unit/index.js test/unit/karma.conf.js .electron-vue/build.js .electron-vue/dev-runner.js .electron-vue/dev-client.js .electron-vue/webpack.main.config.js .electron-vue/webpack.renderer.config.js .electron-vue/marktextEnvironment.js
git commit -m "docs: record modernization phase 2 exit"
```
