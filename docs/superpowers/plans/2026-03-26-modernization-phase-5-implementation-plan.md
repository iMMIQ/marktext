# Modernization Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the migration-era compatibility layers that still remain after Phase 4, converge MarkText on one documented development/build/test path, and leave the repository with a stable long-term maintenance baseline instead of migration-only scaffolding.

**Architecture:** Phase 5 should clean up in dependency order. First lock the cleanup rules with tests so the phase cannot silently regress. Then remove the last `electron-vue` leftovers and unify official scripts, replace the Pinia/Vuex-style store adapter and the generic preload `app.send/invoke` passthrough with explicit APIs, and only then delete obsolete tooling dependencies and old docs. Finish with CI/version-policy alignment and a phase exit report that documents the one intentional exception that remains: the standalone Muya webpack bundle.

**Tech Stack:** Electron 41, Node 24, Vite, Vue 3, Pinia, Element Plus, Vitest, Playwright, electron-builder, Yarn classic.

---

## Planning Notes

- This plan intentionally covers **Phase 5 only** from `docs/superpowers/specs/2026-03-24-modernization-dependency-migration-design.md`.
- Do not reopen Phase 2/3/4 migrations while doing cleanup. If you discover a bug in the modern baseline, fix it in place; do not reintroduce compatibility bridges.
- The repository should exit this phase with:
  - one official runtime entry path: `yarn run dev`
  - one official packaging prep path: `yarn run rebuild && yarn run pack`
  - one official unit-test path: `yarn run unit`
  - one official formatting path: `yarn run format`
  - no migration-only script aliases such as `dev:vite`, `pack:vite`, or `unit:vite`
- Keep one explicit exception on the books:
  - `src/muya/webpack.config.js` remains because the standalone Muya bundle is not part of this modernization track
  - the exception must be documented in the cleanup ledger and version-policy docs so future maintainers do not mistake it for migration residue
- Use `@superpowers:test-driven-development` while implementing each task and `@superpowers:verification-before-completion` before claiming the phase is complete.

## File Structure

### Cleanup Contracts And Ledger

- Create `test/unit/specs/phase-5-tooling-contract.spec.js`
  - Guards official script names, banned migration leftovers in `package.json`, and Babel/tooling cleanup expectations.
- Create `test/unit/specs/phase-5-docs-ci-contract.spec.js`
  - Guards the Node 24 CI baseline, the absence of outdated CI references, and docs consistency.
- Create `test/unit/specs/phase-5-store-boundary.spec.js`
  - Guards the removal of the Pinia module-dispatcher adapter and the generic preload `app.send/invoke` bridge.
- Create `docs/dev/phase-5-cleanup-ledger.md`
  - Lists exactly what must be deleted in Phase 5 and what is intentionally retained afterward.

### Install, Script, And License Tooling

- Create `tools/install/preflight.js`
  - Holds the package-manager and Node baseline checks previously hidden under `.electron-vue`.
- Create `tools/licenses/thirdPartyChecker.js`
  - Rehomes the third-party license helper so tooling no longer imports from `.electron-vue`.
- Modify `package.json`
  - Removes migration-only aliases, rewires official scripts, and drops `.electron-vue` install hooks.
- Modify `tools/generateThirdPartyLicense.js`
- Modify `tools/validateLicenses.js`
  - Point both tools at `tools/licenses/thirdPartyChecker.js`.
- Delete `.electron-vue/preinstall.js`
- Delete `.electron-vue/postinstall.js`
- Delete `.electron-vue/thirdPartyChecker.js`
- Delete `resources/build/windows-release.js`
  - Only after the postinstall workaround is removed.

### Store And Renderer Boundary Cleanup

- Modify `src/renderer/main.js`
  - Replace string-based `dispatch/commit` bootstrapping with direct Pinia store methods.
- Modify `src/renderer/stores/app.js`
- Modify `src/renderer/stores/autoUpdates.js`
- Modify `src/renderer/stores/commandCenter.js`
- Modify `src/renderer/stores/editor.js`
- Modify `src/renderer/stores/layout.js`
- Modify `src/renderer/stores/listenForMain.js`
- Modify `src/renderer/stores/notification.js`
- Modify `src/renderer/stores/preferences.js`
- Modify `src/renderer/stores/project.js`
- Modify `src/renderer/stores/tweet.js`
  - Convert each store from the Vuex-shaped adapter pattern to native Pinia state/actions.
- Modify `src/renderer/mixins/index.js`
  - Stop calling string-based store dispatch entrypoints.
- Create `test/unit/specs/pinia-store-actions.spec.js`
  - Replaces the old legacy-dispatch test with direct-action store coverage.
- Delete `src/renderer/stores/moduleDispatcher.js`
- Delete `src/renderer/stores/index.js`
- Delete `src/renderer/stores/modules/autoUpdates.js`
- Delete `src/renderer/stores/modules/commandCenter.js`
- Delete `src/renderer/stores/modules/editor.js`
- Delete `src/renderer/stores/modules/layout.js`
- Delete `src/renderer/stores/modules/listenForMain.js`
- Delete `src/renderer/stores/modules/notification.js`
- Delete `src/renderer/stores/modules/preferences.js`
- Delete `src/renderer/stores/modules/project.js`
- Delete `src/renderer/stores/modules/tweet.js`
- Delete `test/unit/specs/pinia-legacy-bridge.spec.js`

### Typed Native API Cleanup

- Modify `src/main/preload/index.js`
  - Replace generic `app.send/invoke` passthroughs with explicit capability methods.
- Modify `src/renderer/services/nativeApi/app.js`
  - Keep only named app-level methods; no generic channel passthrough.
- Modify `src/renderer/services/nativeApi/filesystem.js`
  - Add any missing filesystem operations that currently leak through `app.invoke(...)`.
- Create `src/renderer/services/nativeApi/preferences.js`
  - Renderer facade for user preference and user-data operations.
- Create `src/renderer/services/nativeApi/project.js`
  - Renderer facade for sidebar/project actions that currently use raw app channels.
- Create `src/renderer/services/nativeApi/spellchecker.js`
  - Renderer facade for spellchecker operations.
- Modify `src/renderer/services/nativeApi/index.js`
  - Export the new typed modules and stop exposing the generic migration surface.
- Modify `src/renderer/bootstrap.js`
- Modify `src/renderer/commands/index.js`
- Modify `src/renderer/commands/quickOpen.js`
- Modify `src/renderer/components/import/index.vue`
- Modify `src/renderer/mixins/index.js`
- Modify `src/renderer/prefComponents/spellchecker/index.vue`
- Modify `src/renderer/prefComponents/keybindings/KeybindingConfigurator.js`
- Modify `src/renderer/prefComponents/keybindings/index.vue`
- Modify `src/renderer/spellchecker/index.js`
- Modify `src/renderer/stores/autoUpdates.js`
- Modify `src/renderer/stores/editor.js`
- Modify `src/renderer/stores/layout.js`
- Modify `src/renderer/stores/preferences.js`
- Modify `src/renderer/stores/project.js`
  - Move all renderer call sites off `nativeApi.app.send/invoke`.
- Modify `test/unit/specs/renderer-bridge.spec.js`
  - Assert the typed Phase 5 bridge contract instead of the generic app bridge.

### CI, Docs, And Tail Dependency Cleanup

- Create `docs/dev/VERSION_POLICY.md`
  - Declares the supported Node/Electron/tooling baseline and the explicit Muya exception.
- Modify `.github/workflows/build.yml`
- Modify `.github/workflows/release.yml`
  - Align workflows with `.nvmrc`/Node 24 and the official script surface.
- Modify `README.md`
- Modify `docs/dev/README.md`
- Modify `docs/dev/BUILD.md`
- Modify `docs/dev/ARCHITECTURE.md`
- Modify `docs/dev/RELEASE.md`
- Modify `docs/dev/renderer-boundary.md`
  - Make docs match the actual post-cleanup workflow and bridge model.
- Modify `package.json`
- Modify `babel.config.js`
- Modify `yarn.lock`
  - Remove obsolete migration/tooling dependencies and Node 16 / Element UI residue.
- Delete `src/index.ejs`
  - Remove the unused webpack-era renderer entry.
- Create `docs/dev/phase-5-exit-report.md`
  - Records the verification commands, explicit retained exceptions, and anything deferred beyond modernization.

### Task 1: Lock The Phase 5 Cleanup Contracts

**Files:**
- Create: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Create: `test/unit/specs/phase-5-docs-ci-contract.spec.js`
- Create: `test/unit/specs/phase-5-store-boundary.spec.js`
- Create: `docs/dev/phase-5-cleanup-ledger.md`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Test: `test/unit/specs/phase-5-docs-ci-contract.spec.js`
- Test: `test/unit/specs/phase-5-store-boundary.spec.js`

- [ ] **Step 1: Write a failing tooling contract test**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const babelConfig = fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')

describe('phase 5 tooling contract', () => {
  it('keeps one official script surface and no electron-vue leftovers', () => {
    expect(pkg.scripts.dev).not.toMatch(/dev:vite/)
    expect(pkg.scripts.pack).not.toMatch(/pack:vite/)
    expect(pkg.scripts.unit).not.toMatch(/unit:vite/)
    expect(pkg.scripts.build).not.toMatch(/pack:vite/)
    expect(pkg.scripts.preinstall).not.toMatch(/\\.electron-vue/)
    expect(pkg.scripts.postinstall || '').not.toMatch(/\\.electron-vue/)
    expect(pkg.scripts.format).toBeTruthy()
    expect(pkg.scripts['format:check']).toBeTruthy()
    expect(pkg.scripts['dev:vite']).toBeUndefined()
    expect(pkg.scripts['pack:vite']).toBeUndefined()
    expect(pkg.scripts['unit:vite']).toBeUndefined()
    expect(babelConfig).not.toMatch(/node:\\s*16|targets:\\s*\\{\\s*'node':\\s*16\\s*\\}/)
    expect(babelConfig).not.toMatch(/element-ui/)
  })
})
```

- [ ] **Step 2: Write a failing docs and CI contract test**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const buildWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8')
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
const buildDoc = fs.readFileSync(path.join(root, 'docs/dev/BUILD.md'), 'utf8')
const releaseDoc = fs.readFileSync(path.join(root, 'docs/dev/RELEASE.md'), 'utf8')
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

describe('phase 5 docs and CI contract', () => {
  it('documents and tests the Node 24 baseline consistently', () => {
    expect(buildWorkflow).toMatch(/node-version-file:\\s*['\"]?\\.nvmrc['\"]?|node-version:\\s*24/)
    expect(releaseWorkflow).toMatch(/node-version-file:\\s*['\"]?\\.nvmrc['\"]?|node-version:\\s*24/)
    expect(buildDoc).not.toMatch(/>=v16|<v17|unit:vite/)
    expect(releaseDoc).not.toMatch(/AppVeyor|Travis CI/)
    expect(readme).not.toMatch(/travis-ci\\.org|ci\\.appveyor\\.com/)
  })
})
```

- [ ] **Step 3: Write a failing store and bridge boundary audit**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const mainEntry = fs.readFileSync(path.join(root, 'src/renderer/main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const storeFiles = fs.readdirSync(path.join(root, 'src/renderer/stores'))
  .filter(file => file.endsWith('.js'))
  .map(file => fs.readFileSync(path.join(root, 'src/renderer/stores', file), 'utf8'))
  .join('\\n')

describe('phase 5 store and bridge boundary', () => {
  it('removes migration-only store adapters and generic app passthroughs', () => {
    expect(storeFiles).not.toMatch(/moduleDispatcher|\\.\\/modules\\//)
    expect(mainEntry).not.toMatch(/\\.dispatch\\('|\\.commit\\('/)
    expect(preload).not.toMatch(/send:\\s*\\(channel|invoke:\\s*\\(channel/)
  })
})
```

- [ ] **Step 4: Record the cleanup ledger before changing the repository**

```md
# Phase 5 Cleanup Ledger

Must be removed in this phase:

- `.electron-vue/preinstall.js`
- `.electron-vue/postinstall.js`
- `.electron-vue/thirdPartyChecker.js`
- `src/renderer/stores/moduleDispatcher.js`
- `src/renderer/stores/modules/*`
- generic renderer bridge calls via `nativeApi.app.send(...)`
- generic renderer bridge calls via `nativeApi.app.invoke(...)`
- `src/index.ejs`
- outdated CI/docs references to Node 16, Travis CI, and AppVeyor

Explicitly retained after this phase:

- `src/muya/webpack.config.js`
  - reason: standalone Muya publishing is outside the modernization scope
  - follow-up: cover it in a dedicated Muya build modernization plan instead of mixing it into dependency cleanup
```

- [ ] **Step 5: Run the Phase 5 contract tests to verify they fail**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js test/unit/specs/phase-5-store-boundary.spec.js
```

Expected:

- `phase-5-tooling-contract.spec.js` fails because `package.json` still exposes `*:vite` aliases, still references `.electron-vue`, and `babel.config.js` still targets Node 16 / Element UI residue
- `phase-5-docs-ci-contract.spec.js` fails because build/release workflows still pin Node 16 and docs still reference Node 16, Travis CI, AppVeyor, or `unit:vite`
- `phase-5-store-boundary.spec.js` fails because the stores still import `moduleDispatcher`/`./modules/*`, `src/renderer/main.js` still calls string-based `dispatch/commit`, and the preload still exposes generic `send/invoke`

- [ ] **Step 6: Commit the failing cleanup contracts**

```bash
git add test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js test/unit/specs/phase-5-store-boundary.spec.js docs/dev/phase-5-cleanup-ledger.md
git commit -m "test: define phase 5 cleanup contracts"
```

### Task 2: Retire `.electron-vue` Leftovers And Unify Official Scripts

**Files:**
- Create: `tools/install/preflight.js`
- Create: `tools/licenses/thirdPartyChecker.js`
- Modify: `package.json`
- Modify: `tools/generateThirdPartyLicense.js`
- Modify: `tools/validateLicenses.js`
- Modify: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Delete: `.electron-vue/preinstall.js`
- Delete: `.electron-vue/postinstall.js`
- Delete: `.electron-vue/thirdPartyChecker.js`
- Delete: `resources/build/windows-release.js`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`

- [ ] **Step 1: Move the install/license helpers out of `.electron-vue`**

```js
// tools/install/preflight.js
'use strict'

const nodeMajor = Number(process.versions.node.match(/^(\\d+)\\./)[1])
if (nodeMajor !== 24) {
  console.error('[ERROR] Node.js 24.x is required. See .nvmrc.\\n')
  process.exit(1)
}

if (!/yarn\\.js$/.test(process.env.npm_execpath || '')) {
  console.error('[ERROR] Please use yarn classic to install dependencies.\\n')
  process.exit(1)
}
```

```js
// tools/licenses/thirdPartyChecker.js
'use strict'

const checker = require('license-checker')

const getLicenses = (rootDir, callback) => {
  checker.init({
    start: rootDir,
    production: true,
    development: false,
    direct: true,
    excludePackages: 'file-icons@2.1.47',
    json: true,
    onlyAllow: 'Unlicense;WTFPL;ISC;MIT;BSD;ISC;Apache-2.0;MIT*;Apache;Apache*;BSD*;CC0-1.0;CC-BY-4.0;CC-BY-3.0',
    customPath: {
      licenses: '',
      licenseText: 'none'
    }
  }, (err, packages) => callback(err, packages, checker))
}

module.exports = {
  getLicenses,
  validateLicenses: rootDir => {
    getLicenses(rootDir, (err, packages) => {
      if (err) {
        console.log(`[ERROR] ${err}`)
        process.exit(1)
      }
      console.log(checker.asSummary(packages))
    })
  }
}
```

- [ ] **Step 2: Rewrite `package.json` to expose one official script surface**

```json
{
  "scripts": {
    "preinstall": "node tools/install/preflight.js",
    "dev": "cross-env NODE_ENV=development node tools/dev/vite-dev-runner.js",
    "pack:main": "cross-env NODE_ENV=production vite build --config vite.main.config.js && cross-env NODE_ENV=production vite build --config vite.preload.config.js",
    "pack:renderer": "cross-env NODE_ENV=production vite build --config vite.renderer.config.js",
    "pack": "yarn run pack:main && yarn run pack:renderer",
    "unit": "cross-env NODE_ENV=test vitest run",
    "format": "eslint --ext .js,.vue -f ./node_modules/eslint-friendly-formatter --fix src test tools *.config.js",
    "format:check": "yarn run lint",
    "build": "yarn run rebuild && yarn run pack && electron-builder",
    "build:bin": "yarn run rebuild && yarn run pack && electron-builder --dir",
    "release:linux": "yarn run rebuild && yarn run pack && electron-builder build --linux",
    "release:mac": "yarn run rebuild && yarn run pack && electron-builder build --mac",
    "release:win": "yarn run rebuild && yarn run pack && electron-builder build --win"
  }
}
```

- [ ] **Step 3: Update the license tools and delete the old `electron-vue` files**

```js
// tools/generateThirdPartyLicense.js
const thirdPartyChecker = require('./licenses/thirdPartyChecker')

// tools/validateLicenses.js
const thirdPartyChecker = require('./licenses/thirdPartyChecker')
```

Delete:

```bash
git rm .electron-vue/preinstall.js .electron-vue/postinstall.js .electron-vue/thirdPartyChecker.js resources/build/windows-release.js
```

- [ ] **Step 4: Run the tooling contract test and package metadata checks**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js
yarn run validate-licenses
```

Expected:

- the tooling contract passes
- `validate-licenses` still prints the dependency summary successfully
- `package.json` no longer references `.electron-vue` or migration-only `*:vite` aliases

- [ ] **Step 5: Commit the script/tooling cleanup**

```bash
git add package.json tools/install/preflight.js tools/licenses/thirdPartyChecker.js tools/generateThirdPartyLicense.js tools/validateLicenses.js test/unit/specs/phase-5-tooling-contract.spec.js
git commit -m "build: retire electron-vue tooling leftovers"
```

### Task 3: Remove The Pinia Module-Dispatcher Compatibility Layer

**Files:**
- Modify: `src/renderer/main.js`
- Modify: `src/renderer/mixins/index.js`
- Modify: `src/renderer/stores/app.js`
- Modify: `src/renderer/stores/autoUpdates.js`
- Modify: `src/renderer/stores/commandCenter.js`
- Modify: `src/renderer/stores/editor.js`
- Modify: `src/renderer/stores/layout.js`
- Modify: `src/renderer/stores/listenForMain.js`
- Modify: `src/renderer/stores/notification.js`
- Modify: `src/renderer/stores/preferences.js`
- Modify: `src/renderer/stores/project.js`
- Modify: `src/renderer/stores/tweet.js`
- Create: `test/unit/specs/pinia-store-actions.spec.js`
- Modify: `test/unit/specs/phase-5-store-boundary.spec.js`
- Delete: `src/renderer/stores/moduleDispatcher.js`
- Delete: `src/renderer/stores/index.js`
- Delete: `src/renderer/stores/modules/autoUpdates.js`
- Delete: `src/renderer/stores/modules/commandCenter.js`
- Delete: `src/renderer/stores/modules/editor.js`
- Delete: `src/renderer/stores/modules/layout.js`
- Delete: `src/renderer/stores/modules/listenForMain.js`
- Delete: `src/renderer/stores/modules/notification.js`
- Delete: `src/renderer/stores/modules/preferences.js`
- Delete: `src/renderer/stores/modules/project.js`
- Delete: `src/renderer/stores/modules/tweet.js`
- Delete: `test/unit/specs/pinia-legacy-bridge.spec.js`
- Test: `test/unit/specs/pinia-store-actions.spec.js`
- Test: `test/unit/specs/phase-5-store-boundary.spec.js`

- [ ] **Step 1: Write a failing direct-action Pinia test**

```js
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

describe('pinia direct store actions', () => {
  it('boots preferences with direct methods instead of string dispatch', async () => {
    const { usePreferencesStore } = await import('@/stores/preferences')

    const pinia = createPinia()
    setActivePinia(pinia)
    const preferences = usePreferencesStore(pinia)

    preferences.applyPreferences({ theme: 'dark' })

    expect(preferences.theme).toBe('dark')
    expect(typeof preferences.dispatch).toBe('undefined')
    expect(typeof preferences.commit).toBe('undefined')
  })
})
```

- [ ] **Step 2: Rewrite the stores as native Pinia stores and remove string dispatch bootstrapping**

```js
// src/renderer/stores/app.js
export const useAppStore = defineStore('app', {
  state: () => ({
    platform: runtime.platform,
    appVersion: runtime.appVersion,
    windowActive: true,
    init: false
  }),
  actions: {
    bindWindowStatusListener () {
      events.on('mt::window-active-status', (event, { status }) => {
        this.windowActive = status
      })
    },
    markInitialized () {
      this.init = true
    }
  }
})
```

```js
// src/renderer/main.js
preferencesStore.applyPreferences(initialState)
appStore.bindWindowStatusListener()
commandCenterStore.bindCommandCenterBus()
tweetStore.bindTweetEvents()
layoutStore.bindLayoutEvents()
listenForMainStore.bindEditEvents()
```

- [ ] **Step 3: Port the remaining store call sites off string-based store APIs**

```js
// src/renderer/mixins/index.js
editorStore.updateCurrentFile(file)
editorStore.forceCloseTab(file)
projectStore.createFileDirectory(createName)
```

Delete the module adapter tree once every store uses native state/actions directly.

- [ ] **Step 4: Run the store cleanup tests**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/pinia-store-actions.spec.js test/unit/specs/phase-5-store-boundary.spec.js
```

Expected:

- direct-action store tests pass
- the boundary audit passes because `moduleDispatcher` and `stores/modules/*` are gone
- `src/renderer/main.js` no longer uses string-based `dispatch/commit`

- [ ] **Step 5: Commit the Pinia cleanup**

```bash
git add src/renderer/main.js src/renderer/mixins/index.js src/renderer/stores test/unit/specs/pinia-store-actions.spec.js test/unit/specs/phase-5-store-boundary.spec.js
git commit -m "refactor: remove pinia compatibility bridge"
```

### Task 4: Replace Generic `nativeApi.app.send/invoke` With Typed Facades

**Files:**
- Modify: `src/main/preload/index.js`
- Modify: `src/renderer/services/nativeApi/app.js`
- Modify: `src/renderer/services/nativeApi/filesystem.js`
- Create: `src/renderer/services/nativeApi/preferences.js`
- Create: `src/renderer/services/nativeApi/project.js`
- Create: `src/renderer/services/nativeApi/spellchecker.js`
- Modify: `src/renderer/services/nativeApi/index.js`
- Modify: `src/renderer/bootstrap.js`
- Modify: `src/renderer/commands/index.js`
- Modify: `src/renderer/commands/quickOpen.js`
- Modify: `src/renderer/components/import/index.vue`
- Modify: `src/renderer/mixins/index.js`
- Modify: `src/renderer/prefComponents/spellchecker/index.vue`
- Modify: `src/renderer/prefComponents/keybindings/KeybindingConfigurator.js`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `src/renderer/spellchecker/index.js`
- Modify: `src/renderer/stores/autoUpdates.js`
- Modify: `src/renderer/stores/editor.js`
- Modify: `src/renderer/stores/layout.js`
- Modify: `src/renderer/stores/preferences.js`
- Modify: `src/renderer/stores/project.js`
- Modify: `test/unit/specs/renderer-bridge.spec.js`
- Modify: `test/unit/specs/phase-5-store-boundary.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`
- Test: `test/unit/specs/phase-5-store-boundary.spec.js`

- [ ] **Step 1: Extend the failing boundary/bridge tests to require typed APIs**

```js
// test/unit/specs/renderer-bridge.spec.js
expect(typeof nativeApi.app.openSettingsWindow).toBe('function')
expect(typeof nativeApi.app.openFile).toBe('function')
expect(typeof nativeApi.app.openFilePath).toBe('function')
expect(typeof nativeApi.app.openFileByWindowId).toBe('function')
expect(typeof nativeApi.app.dropFiles).toBe('function')
expect(typeof nativeApi.app.requestKeybindings).toBe('function')
expect(typeof nativeApi.app.getPreferenceKeybindings).toBe('function')
expect(typeof nativeApi.app.saveUserKeybindings).toBe('function')
expect(typeof nativeApi.app.respondFileSave).toBe('function')
expect(typeof nativeApi.preferences.requestUserPreference).toBe('function')
expect(typeof nativeApi.project.openInSidebar).toBe('function')
expect(typeof nativeApi.spellchecker.getAvailableDictionaries).toBe('function')
expect(typeof nativeApi.spellchecker.getCustomDictionaryWords).toBe('function')
expect(typeof nativeApi.app.send).toBe('undefined')
expect(typeof nativeApi.app.invoke).toBe('undefined')
```

- [ ] **Step 2: Replace the preload passthrough with explicit methods**

```js
// src/main/preload/index.js
app: {
  openSettingsWindow: () => ipcRenderer.send('mt::open-setting-window'),
  newEditorWindow: () => ipcRenderer.send('mt::cmd-new-editor-window'),
  openFile: () => ipcRenderer.send('mt::cmd-open-file'),
  openFolder: () => ipcRenderer.send('mt::cmd-open-folder'),
  openFilePath: (pathname, options = {}) => ipcRenderer.send('mt::open-file', pathname, options),
  openFileByWindowId: (windowId, pathname) => ipcRenderer.send('mt::open-file-by-window-id', windowId, pathname),
  dropFiles: fileList => ipcRenderer.send('mt::window::drop', fileList),
  closeWindow: () => ipcRenderer.send('mt::cmd-close-window'),
  closeWindowConfirm: unsavedFiles => ipcRenderer.send('mt::close-window-confirm', unsavedFiles),
  toggleAutoSave: () => ipcRenderer.send('mt::cmd-toggle-autosave'),
  importFile: () => ipcRenderer.send('mt::cmd-import-file'),
  toggleAlwaysOnTop: () => ipcRenderer.send('mt::window-toggle-always-on-top'),
  tryQuit: () => ipcRenderer.send('mt::app-try-quit'),
  checkForUpdate: () => ipcRenderer.send('mt::check-for-update'),
  makeScreenshot: () => ipcRenderer.send('mt::make-screenshot'),
  handleRendererError: payload => ipcRenderer.send('mt::handle-renderer-error', payload),
  notifyNeedUpdate: payload => ipcRenderer.send('mt::NEED_UPDATE', payload),
  notifyWindowTabClosed: pathname => ipcRenderer.send('mt::window-tab-closed', pathname),
  notifyFormatLinkClick: payload => ipcRenderer.send('mt::format-link-click', payload),
  requestImageAutoPath: payload => ipcRenderer.send('mt::ask-for-image-auto-path', payload),
  askForImagePath: () => ipcRenderer.invoke('mt::ask-for-image-path'),
  updateLineEndingMenu: (windowId, lineEnding) => ipcRenderer.send('mt::update-line-ending-menu', windowId, lineEnding),
  saveTabs: payload => ipcRenderer.send('mt::save-tabs', payload),
  saveAndCloseTabs: payload => ipcRenderer.send('mt::save-and-close-tabs', payload),
  respondFileSave: payload => ipcRenderer.send('mt::response-file-save', payload),
  respondFileSaveAs: payload => ipcRenderer.send('mt::response-file-save-as', payload),
  respondFileMoveTo: payload => ipcRenderer.send('mt::response-file-move-to', payload),
  renameFile: payload => ipcRenderer.send('mt::rename', payload),
  requestKeybindings: () => ipcRenderer.send('mt::request-keybindings'),
  getPreferenceKeybindings: () => ipcRenderer.invoke('mt::keybinding-get-pref-keybindings'),
  saveUserKeybindings: payload => ipcRenderer.invoke('mt::keybinding-save-user-keybindings', payload),
  reportSelectionChange: (windowId, payload) => ipcRenderer.send('mt::editor-selection-changed', windowId, payload),
  updateFormatMenu: (windowId, payload) => ipcRenderer.send('mt::update-format-menu', windowId, payload),
  respondExport: payload => ipcRenderer.send('mt::response-export', payload),
  respondPrint: () => ipcRenderer.send('mt::response-print')
},
preferences: {
  requestUserPreference: () => ipcRenderer.send('mt::ask-for-user-preference'),
  requestUserData: () => ipcRenderer.send('mt::ask-for-user-data'),
  setUserPreference: payload => ipcRenderer.send('mt::set-user-preference', payload),
  setUserData: payload => ipcRenderer.send('mt::set-user-data', payload),
  setImageFolderPath: value => ipcRenderer.send('mt::ask-for-modify-image-folder-path', value),
  selectDefaultDirectoryToOpen: () => ipcRenderer.send('mt::select-default-directory-to-open'),
  notifyViewLayoutChanged: (windowId, payload) => ipcRenderer.send('mt::view-layout-changed', windowId, payload)
},
project: {
  openInSidebar: () => ipcRenderer.send('mt::ask-for-open-project-in-sidebar'),
  updateSidebarMenu: (windowId, visible) => ipcRenderer.send('mt::update-sidebar-menu', windowId, visible)
},
spellchecker: {
  setEnabled: enabled => ipcRenderer.invoke('mt::spellchecker-set-enabled', enabled),
  switchLanguage: lang => ipcRenderer.invoke('mt::spellchecker-switch-language', lang),
  getAvailableDictionaries: () => ipcRenderer.invoke('mt::spellchecker-get-available-dictionaries'),
  getCustomDictionaryWords: () => ipcRenderer.invoke('mt::spellchecker-get-custom-dictionary-words'),
  removeCustomDictionaryWord: word => ipcRenderer.invoke('mt::spellchecker-remove-word', word)
}
```

- [ ] **Step 3: Move renderer call sites onto the typed facades**

```js
// src/renderer/stores/preferences.js
preferencesApi.requestUserPreference()
preferencesApi.requestUserData()
preferencesApi.setUserPreference({ [type]: value })
preferencesApi.notifyViewLayoutChanged(windowId, viewState)

// src/renderer/stores/project.js
projectApi.openInSidebar()
filesystem.trashItem(pathname)

// src/renderer/commands/quickOpen.js
appApi.openFileByWindowId(windowId, id)

// src/renderer/components/import/index.vue
this.$nativeApi.app.dropFiles(fileList)

// src/renderer/prefComponents/keybindings/index.vue
const keybindings = await appApi.getPreferenceKeybindings()

// src/renderer/prefComponents/keybindings/KeybindingConfigurator.js
await appApi.saveUserKeybindings(userKeybindings)

// src/renderer/spellchecker/index.js
await spellcheckerApi.setEnabled(true)
await spellcheckerApi.switchLanguage(lang)
```

- [ ] **Step 4: Run the bridge and boundary tests**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/renderer-bridge.spec.js test/unit/specs/phase-5-store-boundary.spec.js
```

Expected:

- the preload contract passes with explicit `app/preferences/project/spellchecker` methods
- no renderer code uses `nativeApi.app.send(...)` or `nativeApi.app.invoke(...)`
- the generic passthrough no longer exists in `src/main/preload/index.js`

- [ ] **Step 5: Commit the typed bridge cleanup**

```bash
git add src/main/preload/index.js src/renderer/services/nativeApi src/renderer/bootstrap.js src/renderer/commands src/renderer/components/import/index.vue src/renderer/mixins/index.js src/renderer/prefComponents/spellchecker/index.vue src/renderer/prefComponents/keybindings src/renderer/spellchecker/index.js src/renderer/stores test/unit/specs/renderer-bridge.spec.js test/unit/specs/phase-5-store-boundary.spec.js
git commit -m "refactor: replace generic renderer bridge calls"
```

### Task 5: Align CI, Docs, And Tail Dependencies With The Final Baseline

**Files:**
- Create: `docs/dev/VERSION_POLICY.md`
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `docs/dev/README.md`
- Modify: `docs/dev/BUILD.md`
- Modify: `docs/dev/ARCHITECTURE.md`
- Modify: `docs/dev/RELEASE.md`
- Modify: `docs/dev/renderer-boundary.md`
- Modify: `package.json`
- Modify: `babel.config.js`
- Modify: `yarn.lock`
- Modify: `test/unit/specs/phase-5-docs-ci-contract.spec.js`
- Modify: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Delete: `src/index.ejs`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Test: `test/unit/specs/phase-5-docs-ci-contract.spec.js`

- [ ] **Step 1: Write the version-policy document and update workflows to the `.nvmrc` baseline**

```md
# Version Policy

- Node.js: use the exact major pinned in `.nvmrc` (`24.x` for this phase)
- Electron: follow the Phase 4 runtime contract (`41.x`) until a new modernization plan changes it
- Package manager: Yarn classic
- Official scripts:
  - `yarn run dev`
  - `yarn run rebuild`
  - `yarn run pack`
  - `yarn run unit`
  - `yarn run format`
  - `yarn run build`
- Explicit exception:
  - `src/muya/webpack.config.js` remains for the standalone Muya bundle and is not part of the desktop runtime path
```

```yaml
# .github/workflows/build.yml / release.yml
- name: Install Node.js
  uses: actions/setup-node@v6
  with:
    node-version-file: .nvmrc
    cache: yarn
    cache-dependency-path: yarn.lock
```

- [ ] **Step 2: Rewrite docs and README to match the final workflow**

```md
## Official Developer Commands

- `yarn run dev` for local development
- `yarn run rebuild` before native packaging
- `yarn run pack` to build `dist/electron`
- `yarn run unit` for the unit suite
- `yarn run format` to auto-fix formatting and lint issues
- `yarn run build` to package the app
```

Also remove:

- Node 16 references
- Travis/AppVeyor wording and badges
- `unit:vite`, `pack:vite`, and similar migration-only aliases

- [ ] **Step 3: Remove obsolete tooling dependencies and Babel residue**

Update `babel.config.js` to target Node 24 and drop the Element UI plugin:

```js
const NODE_TARGET = 24

const presetsHash = {
  test: [[presetEnv, { targets: { node: NODE_TARGET } }]],
  main: [[presetEnv, { targets: { node: NODE_TARGET } }]],
  renderer: [[presetEnv, {
    useBuiltIns: false,
    targets: {
      electron: require('electron/package.json').version,
      node: NODE_TARGET
    }
  }]]
}
```

Remove the now-unused dependencies from `package.json` and `yarn.lock`:

- `babel-plugin-component`
- `copy-webpack-plugin`
- `eslint-webpack-plugin`
- `file-loader`
- `html-webpack-plugin`
- all `karma*` packages
- `raw-loader`
- `svg-sprite-loader`
- `svgo-loader`
- `url-loader`
- `vue-loader`
- `vue-style-loader`
- `webpack-bundle-analyzer`
- `webpack-dev-server`
- `webpack-hot-middleware`
- `webpack-merge`

Keep:

- `webpack`
- `webpack-cli`
- `mini-css-extract-plugin`
- `imports-loader`
- `vue-html-loader`

- [ ] **Step 4: Run the contract tests and metadata verification**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js
yarn install --frozen-lockfile
```

Expected:

- both contract tests pass
- `yarn install --frozen-lockfile` succeeds with the new preflight check and without `.electron-vue`
- docs, workflows, and README all point at the same Node 24 + official-script baseline

- [ ] **Step 5: Commit the docs/CI/dependency cleanup**

```bash
git add .github/workflows/build.yml .github/workflows/release.yml README.md docs/dev/README.md docs/dev/BUILD.md docs/dev/ARCHITECTURE.md docs/dev/RELEASE.md docs/dev/renderer-boundary.md docs/dev/VERSION_POLICY.md package.json babel.config.js yarn.lock test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js
git rm src/index.ejs
git commit -m "chore: finalize modernization baseline"
```

### Task 6: Verify The Final Baseline And Publish The Phase Exit Report

**Files:**
- Create: `docs/dev/phase-5-exit-report.md`
- Modify: `docs/dev/phase-5-cleanup-ledger.md`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Test: `test/unit/specs/phase-5-docs-ci-contract.spec.js`
- Test: `test/unit/specs/phase-5-store-boundary.spec.js`
- Test: `test/unit/specs/pinia-store-actions.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Write the exit report template before final verification**

```md
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
```

- [ ] **Step 2: Run the complete verification suite on the final script surface**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-5-tooling-contract.spec.js test/unit/specs/phase-5-docs-ci-contract.spec.js test/unit/specs/phase-5-store-boundary.spec.js test/unit/specs/pinia-store-actions.spec.js test/unit/specs/renderer-bridge.spec.js
yarn run validate-licenses
yarn run unit
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-4-security-smoke.spec.js
yarn run pack
yarn run build:bin
```

Expected:

- all Phase 5 contract tests pass
- the full unit suite passes through `yarn run unit`
- packaged smoke still passes on the secure Phase 4 runtime
- `yarn run pack` and `yarn run build:bin` work using only the official script surface

- [ ] **Step 3: Update the cleanup ledger with final status**

```md
Completed removals:

- `.electron-vue/*`
- `src/renderer/stores/moduleDispatcher.js`
- `src/renderer/stores/modules/*`
- generic renderer `app.send/invoke` bridge
- `src/index.ejs`
- Node 16 / Travis / AppVeyor references

Still intentionally retained:

- `src/muya/webpack.config.js`
```

- [ ] **Step 4: Save the actual verification output in the exit report**

Record:

- the exact commands run
- any platform-specific deviations
- whether `yarn run build:bin` succeeded in this workspace
- confirmation that docs and workflows now match `.nvmrc`
- confirmation that `.electron-vue` is fully gone from tracked files

- [ ] **Step 5: Commit the exit report**

```bash
git add docs/dev/phase-5-exit-report.md docs/dev/phase-5-cleanup-ledger.md
git commit -m "docs: record phase 5 exit validation"
```
