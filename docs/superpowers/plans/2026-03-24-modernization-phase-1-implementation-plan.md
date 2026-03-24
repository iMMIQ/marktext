# Modernization Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove renderer-side `@electron/remote` usage, introduce a `preload + contextBridge + IPC` facade for system capabilities, and keep the current Vue 2 / webpack / Electron 18 application running throughout the migration.

**Architecture:** Phase 1 adds a preload bridge built in the existing webpack main bundle, backed by explicit main-process IPC handlers and a renderer-facing facade under `src/renderer/services/nativeApi/`. Renderer components, stores, commands, and utilities will stop importing `electron` and `@electron/remote` directly, and will instead call the facade. `nodeIntegration` may remain enabled in this phase to limit scope, but `@electron/remote` must be fully removable by the phase exit.

**Tech Stack:** Electron 18, Vue 2, Vuex 3, webpack 5, Karma/Mocha, Playwright, preload + `contextBridge` + IPC.

---

## Planning Notes

- This plan intentionally covers **Phase 1 only**. The approved spec spans five major phases, but later phases will change build layout, test entry points, and dependency graph enough that writing detailed file-by-file tasks now would create stale guidance.
- At Phase 1 exit, create a fresh plan for Phase 2 using the updated codebase.
- The plan assumes the current spec remains the source of truth:
  - `docs/superpowers/specs/2026-03-24-modernization-dependency-migration-design.md`

### Task 1: Lock The Phase 1 Baseline

**Files:**
- Create: `test/e2e/bridge-smoke.spec.js`
- Create: `docs/dev/renderer-boundary.md`
- Modify: `test/e2e/launch.spec.js`
- Modify: `test/e2e/helpers.js`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/e2e/launch.spec.js`

- [ ] **Step 1: Write a failing preload contract smoke test**

```js
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('renderer exposes the native bridge contract', async () => {
  const { app, page } = await launchElectron()
  const bridgeShape = await page.evaluate(() => {
    const bridge = window.mtNative
    return bridge ? Object.keys(bridge).sort() : null
  })

  await app.close()

  expect(bridgeShape).toEqual([
    'app',
    'clipboard',
    'events',
    'menu',
    'shell',
    'window'
  ])
})
```

- [ ] **Step 2: Extend the launch smoke test to assert the app still boots through the new boundary**

```js
test('launches with the native bridge available', async () => {
  const title = await page.title()
  const hasBridge = await page.evaluate(() => !!window.mtNative)

  expect(/^MarkText|Untitled-1 - MarkText$/.test(title)).toBeTruthy()
  expect(hasBridge).toBeTruthy()
})
```

- [ ] **Step 3: Document the renderer boundary contract before changing code**

```md
# Renderer Boundary

Renderer code must not import `electron` or `@electron/remote` directly.

Allowed path:

- renderer component/store/command
- `src/renderer/services/nativeApi/*`
- preload bridge
- explicit IPC handlers in main process
```

- [ ] **Step 4: Run the smoke tests to confirm they fail before implementation**

Run:

```bash
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- Pack succeeds with the current app.
- Playwright fails because `window.mtNative` does not exist yet.

- [ ] **Step 5: Commit the failing baseline**

```bash
git add docs/dev/renderer-boundary.md test/e2e/helpers.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
git commit -m "test: define renderer bridge baseline"
```

### Task 2: Add The Preload Bridge Skeleton

**Files:**
- Create: `test/unit/specs/renderer-bridge.spec.js`
- Create: `src/main/preload/index.js`
- Create: `src/main/ipc/renderer/index.js`
- Create: `src/main/ipc/renderer/window.js`
- Create: `src/main/ipc/renderer/menu.js`
- Create: `src/main/ipc/renderer/clipboard.js`
- Create: `src/main/ipc/renderer/shell.js`
- Create: `src/main/ipc/renderer/app.js`
- Create: `src/renderer/services/nativeApi/index.js`
- Create: `src/renderer/services/nativeApi/window.js`
- Create: `src/renderer/services/nativeApi/menu.js`
- Create: `src/renderer/services/nativeApi/clipboard.js`
- Create: `src/renderer/services/nativeApi/shell.js`
- Create: `src/renderer/services/nativeApi/app.js`
- Create: `src/renderer/services/nativeApi/events.js`
- Modify: `.electron-vue/webpack.main.config.js`
- Modify: `src/main/app/index.js`
- Modify: `src/main/config.js`
- Modify: `src/main/windows/editor.js`
- Modify: `src/main/windows/setting.js`
- Modify: `src/renderer/main.js`
- Modify: `src/renderer/services/index.js`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Write a failing unit-level bridge facade test around the renderer adapter shape**

```js
import nativeApi from '@/services/nativeApi'

describe('renderer native API facade', () => {
  it('exposes the expected top-level modules', () => {
    expect(Object.keys(nativeApi).sort()).to.deep.equal([
      'app',
      'clipboard',
      'events',
      'menu',
      'shell',
      'window'
    ])
  })
})
```

- [ ] **Step 2: Wire a preload bundle into the current webpack main build**

```js
entry: {
  main: path.join(__dirname, '../src/main/index.js'),
  preload: path.join(__dirname, '../src/main/preload/index.js')
}
```

- [ ] **Step 3: Point both BrowserWindow types at the preload bundle and turn on `contextIsolation`**

```js
webPreferences: {
  preload: path.join(__dirname, '../../dist/electron/preload.js'),
  contextIsolation: true,
  spellcheck: true,
  nodeIntegration: true,
  webSecurity: false
}
```

- [ ] **Step 4: Register the initial IPC handlers and expose the preload API**

```js
contextBridge.exposeInMainWorld('mtNative', {
  window: {
    minimize: () => ipcRenderer.send('mt::window-minimize'),
    maximizeOrRestore: () => ipcRenderer.send('mt::window-toggle-maximize'),
    close: () => ipcRenderer.send('mt::window-close'),
    getState: () => ipcRenderer.invoke('mt::window-get-state')
  },
  menu: {
    popupApplicationMenu: (position) => ipcRenderer.send('mt::menu-popup-application', position)
  },
  clipboard: {
    readFilePath: () => ipcRenderer.invoke('mt::clipboard-read-file-path')
  },
  shell: {
    openPath: (target) => ipcRenderer.invoke('mt::shell-open-path', target),
    showItemInFolder: (target) => ipcRenderer.invoke('mt::shell-show-item-in-folder', target),
    openExternal: (target) => ipcRenderer.invoke('mt::shell-open-external', target)
  },
  app: {
    openSettingsWindow: () => ipcRenderer.send('mt::open-setting-window')
  },
  events: {
    on: (channel, handler) => {
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  }
})
```

- [ ] **Step 5: Register the renderer facade in the existing service bootstrap**

```js
import nativeApi from './nativeApi'

export default [
  notification,
  nativeApi
]
```

- [ ] **Step 6: Run the smoke tests and the existing unit suite**

Run:

```bash
yarn run unit
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- The new bridge contract test passes.
- Existing launch smoke still passes.

- [ ] **Step 7: Commit the bridge skeleton**

```bash
git add .electron-vue/webpack.main.config.js src/main/app/index.js src/main/config.js src/main/ipc/renderer src/main/preload/index.js src/main/windows/editor.js src/main/windows/setting.js src/renderer/main.js src/renderer/services/nativeApi src/renderer/services/index.js test/e2e/bridge-smoke.spec.js test/e2e/launch.spec.js
git commit -m "feat: add preload bridge skeleton"
```

### Task 3: Migrate Window Controls And Application Menu

**Files:**
- Modify: `src/main/ipc/renderer/window.js`
- Modify: `src/main/ipc/renderer/menu.js`
- Modify: `src/renderer/components/titleBar/index.vue`
- Modify: `src/renderer/prefComponents/common/titlebar.vue`
- Modify: `src/renderer/contextMenu/tabs/index.js`
- Modify: `src/renderer/contextMenu/sideBar/index.js`
- Modify: `src/renderer/services/nativeApi/window.js`
- Modify: `src/renderer/services/nativeApi/menu.js`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/e2e/launch.spec.js`

- [ ] **Step 1: Add failing tests for title bar window actions through the bridge**

```js
test('custom title bar actions route through mtNative.window', async () => {
  const { app, page } = await launchElectron()
  const before = await page.evaluate(() => window.mtNative.window.getState())
  expect(before.isMaximized).toBeFalsy()
  await app.close()
})
```

- [ ] **Step 2: Replace `getCurrentWindow()` calls in renderer components with bridge-backed actions**

```js
handleCloseClick () {
  this.$nativeApi.window.close()
},

async handleMaximizeClick () {
  await this.$nativeApi.window.maximizeOrRestore()
}
```

- [ ] **Step 3: Replace remote menu popup usage with a main-process popup handler**

```js
handleMenuClick () {
  this.$nativeApi.menu.popupApplicationMenu({ x: 23, y: 20 })
}
```

- [ ] **Step 4: Replace context menu builders that still rely on remote menu classes**

```js
export const showTabsContextMenu = (nativeApi, items, position) => {
  nativeApi.menu.popupTabsMenu({ items, position })
}
```

- [ ] **Step 5: Run targeted smoke tests and then the full unit suite**

Run:

```bash
yarn run unit
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- Title bar behaviors still work.
- No renderer import of `@electron/remote` remains in these files.

- [ ] **Step 6: Commit the window and menu migration**

```bash
git add src/main/ipc/renderer/menu.js src/main/ipc/renderer/window.js src/renderer/components/titleBar/index.vue src/renderer/contextMenu/sideBar/index.js src/renderer/contextMenu/tabs/index.js src/renderer/prefComponents/common/titlebar.vue src/renderer/services/nativeApi/menu.js src/renderer/services/nativeApi/window.js test/e2e/bridge-smoke.spec.js
git commit -m "refactor: migrate window controls to preload bridge"
```

### Task 4: Migrate Clipboard And Shell Access

**Files:**
- Modify: `src/main/ipc/renderer/clipboard.js`
- Modify: `src/main/ipc/renderer/shell.js`
- Modify: `src/renderer/util/clipboard.js`
- Modify: `src/renderer/store/project.js`
- Modify: `src/renderer/store/editor.js`
- Modify: `src/renderer/store/notification.js`
- Modify: `src/renderer/components/tweet/index.vue`
- Modify: `src/renderer/components/editorWithTabs/tabs.vue`
- Modify: `src/renderer/components/editorWithTabs/editor.vue`
- Modify: `src/renderer/prefComponents/common/textBox/index.vue`
- Modify: `src/renderer/prefComponents/common/select/index.vue`
- Modify: `src/renderer/prefComponents/common/range/index.vue`
- Modify: `src/renderer/prefComponents/common/bool/index.vue`
- Modify: `src/renderer/prefComponents/common/fontTextBox/index.vue`
- Modify: `src/renderer/prefComponents/image/components/folderSetting/index.vue`
- Modify: `src/renderer/prefComponents/image/components/uploader/index.vue`
- Modify: `src/renderer/prefComponents/image/components/uploader/legalNoticesCheckbox.vue`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `src/renderer/services/nativeApi/clipboard.js`
- Modify: `src/renderer/services/nativeApi/shell.js`
- Test: `test/e2e/bridge-smoke.spec.js`

- [ ] **Step 1: Add a failing clipboard bridge test for file-path probing**

```js
test('clipboard file path probing is exposed through the preload bridge', async () => {
  const { app, page } = await launchElectron()
  const value = await page.evaluate(() => window.mtNative.clipboard.readFilePath())
  await app.close()
  expect(typeof value).toBe('string')
})
```

- [ ] **Step 2: Move shell and clipboard calls behind the native facade**

```js
const filePath = await this.$nativeApi.clipboard.readFilePath()
await this.$nativeApi.shell.showItemInFolder(pathname)
await this.$nativeApi.shell.openExternal(url)
```

- [ ] **Step 3: Keep renderer-side utility signatures stable while swapping implementations**

```js
export const guessClipboardFilePath = async () => {
  return window.mtNative.clipboard.readFilePath()
}
```

- [ ] **Step 4: Run the unit and smoke suites**

Run:

```bash
yarn run unit
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- Clipboard probing works through the preload API.
- Links and file reveal actions still work.

- [ ] **Step 5: Commit the shell and clipboard migration**

```bash
git add src/main/ipc/renderer/clipboard.js src/main/ipc/renderer/shell.js src/renderer/components/editorWithTabs/editor.vue src/renderer/components/editorWithTabs/tabs.vue src/renderer/components/tweet/index.vue src/renderer/prefComponents/common/bool/index.vue src/renderer/prefComponents/common/fontTextBox/index.vue src/renderer/prefComponents/common/range/index.vue src/renderer/prefComponents/common/select/index.vue src/renderer/prefComponents/common/textBox/index.vue src/renderer/prefComponents/image/components/folderSetting/index.vue src/renderer/prefComponents/image/components/uploader/index.vue src/renderer/prefComponents/image/components/uploader/legalNoticesCheckbox.vue src/renderer/prefComponents/keybindings/index.vue src/renderer/services/nativeApi/clipboard.js src/renderer/services/nativeApi/shell.js src/renderer/store/editor.js src/renderer/store/notification.js src/renderer/store/project.js src/renderer/util/clipboard.js test/e2e/bridge-smoke.spec.js
git commit -m "refactor: move clipboard and shell access behind bridge"
```

### Task 5: Centralize Renderer IPC Usage Behind The Native Facade

**Files:**
- Modify: `src/renderer/services/nativeApi/events.js`
- Modify: `src/renderer/services/nativeApi/app.js`
- Modify: `src/renderer/commands/index.js`
- Modify: `src/renderer/commands/fileEncoding.js`
- Modify: `src/renderer/commands/lineEnding.js`
- Modify: `src/renderer/commands/quickOpen.js`
- Modify: `src/renderer/commands/trailingNewline.js`
- Modify: `src/renderer/bootstrap.js`
- Modify: `src/renderer/mixins/index.js`
- Modify: `src/renderer/pages/app.vue`
- Modify: `src/renderer/store/index.js`
- Modify: `src/renderer/store/layout.js`
- Modify: `src/renderer/store/listenForMain.js`
- Modify: `src/renderer/store/preferences.js`
- Modify: `src/renderer/store/tweet.js`
- Modify: `src/renderer/store/commandCenter.js`
- Modify: `src/renderer/store/notification.js`
- Modify: `src/renderer/store/autoUpdates.js`
- Modify: `src/renderer/spellchecker/index.js`
- Modify: `src/renderer/components/import/index.vue`
- Modify: `src/renderer/prefComponents/sideBar/index.vue`
- Modify: `src/renderer/prefComponents/spellchecker/index.vue`
- Modify: `src/renderer/prefComponents/keybindings/KeybindingConfigurator.js`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Add a failing test for event subscription and command dispatch through the facade**

```js
it('wraps IPC event subscription through the events module', () => {
  expect(nativeApi.events.on).to.be.a('function')
  expect(nativeApi.app.openSettingsWindow).to.be.a('function')
})
```

- [ ] **Step 2: Introduce facade methods for renderer commands instead of scattered `ipcRenderer` imports**

```js
export default {
  app: {
    openSettingsWindow: () => window.mtNative.app.openSettingsWindow(),
    send: (channel, ...args) => window.mtNative.app.send(channel, ...args),
    invoke: (channel, ...args) => window.mtNative.app.invoke(channel, ...args)
  },
  events: {
    on: (channel, handler) => window.mtNative.events.on(channel, handler),
    once: (channel, handler) => window.mtNative.events.once(channel, handler),
    off: (channel, handler) => window.mtNative.events.off(channel, handler),
    emit: (channel, ...args) => window.mtNative.events.emit(channel, ...args)
  }
}
```

- [ ] **Step 3: Migrate the command layer first, then stores and view glue**

```js
execute: async () => {
  this.$nativeApi.app.send('mt::cmd-open-file')
}
```

- [ ] **Step 4: Replace renderer `ipcRenderer.on/off/once/send/invoke/emit` calls module by module**

```js
const unsubscribe = this.$nativeApi.events.on('mt::window-maximize', this.onMaximize)
this._teardowns.push(unsubscribe)
```

- [ ] **Step 5: Run unit tests and smoke tests after each migrated module cluster**

Run:

```bash
yarn run unit
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- No behavior change in preferences, layout, update notifications, or command palette triggers.

- [ ] **Step 6: Commit the IPC facade migration**

```bash
git add src/renderer/bootstrap.js src/renderer/commands/index.js src/renderer/commands/fileEncoding.js src/renderer/commands/lineEnding.js src/renderer/commands/quickOpen.js src/renderer/commands/trailingNewline.js src/renderer/components/import/index.vue src/renderer/mixins/index.js src/renderer/pages/app.vue src/renderer/prefComponents/keybindings/KeybindingConfigurator.js src/renderer/prefComponents/sideBar/index.vue src/renderer/prefComponents/spellchecker/index.vue src/renderer/services/nativeApi/app.js src/renderer/services/nativeApi/events.js src/renderer/spellchecker/index.js src/renderer/store/autoUpdates.js src/renderer/store/commandCenter.js src/renderer/store/index.js src/renderer/store/layout.js src/renderer/store/listenForMain.js src/renderer/store/notification.js src/renderer/store/preferences.js src/renderer/store/tweet.js test/unit/specs/renderer-bridge.spec.js
git commit -m "refactor: centralize renderer ipc access"
```

### Task 6: Remove `@electron/remote` And Add Guardrails

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/main/windows/editor.js`
- Modify: `src/main/windows/setting.js`
- Modify: `package.json`
- Modify: `yarn.lock`
- Modify: `.eslintrc.js`
- Modify: `docs/dev/renderer-boundary.md`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/e2e/launch.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Add a failing lint rule that bans `electron` and `@electron/remote` imports under `src/renderer`**

```js
'no-restricted-imports': ['error', {
  patterns: [{
    group: ['electron', '@electron/remote'],
    message: 'Use src/renderer/services/nativeApi instead.'
  }]
}]
```

- [ ] **Step 2: Remove main-process remote initialization once renderer callers are gone**

```js
// remove:
import { initialize as remoteInitializeServer } from '@electron/remote/main'
remoteInitializeServer()
```

- [ ] **Step 3: Remove per-window `remoteEnable` calls**

```js
// remove:
import { enable as remoteEnable } from '@electron/remote/main'
remoteEnable(win.webContents)
```

- [ ] **Step 4: Remove `@electron/remote` from dependencies and refresh the lockfile**

Run:

```bash
yarn remove @electron/remote
```

Expected:

- `package.json` and `yarn.lock` no longer include `@electron/remote`.

- [ ] **Step 5: Run lint, unit, and smoke suites**

Run:

```bash
yarn run lint
yarn run unit
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/bridge-smoke.spec.js
```

Expected:

- No renderer import of `electron` or `@electron/remote` remains.
- The app still launches and handles core window actions.

- [ ] **Step 6: Commit the remote removal and guardrails**

```bash
git add .eslintrc.js docs/dev/renderer-boundary.md package.json yarn.lock src/main/index.js src/main/windows/editor.js src/main/windows/setting.js
git commit -m "chore: remove electron remote from renderer boundary"
```

### Task 7: Phase 1 Exit Validation And Handoff

**Files:**
- Create: `docs/dev/phase-1-exit-report.md`
- Modify: `docs/dev/BUILD.md`
- Modify: `docs/dev/ARCHITECTURE.md`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/e2e/launch.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Write the exit report with completed scope and deferred items**

```md
# Phase 1 Exit Report

Completed:

- preload bridge added
- renderer `@electron/remote` removed
- renderer `electron` imports replaced by facade

Deferred to Phase 2:

- build-chain migration to Vite
- test runner migration from Karma to Vitest
- broader Node API isolation
```

- [ ] **Step 2: Update architecture and build docs to describe the new preload boundary**

```md
Renderer code must use `src/renderer/services/nativeApi/*` for system interactions.
The preload bridge is bundled to `dist/electron/preload.js`.
```

- [ ] **Step 3: Run the full validation set**

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
- Unit tests pass.
- Markdown spec tests pass.
- Playwright smoke tests pass.

- [ ] **Step 4: Commit the phase exit state**

```bash
git add docs/dev/ARCHITECTURE.md docs/dev/BUILD.md docs/dev/phase-1-exit-report.md
git commit -m "docs: record modernization phase 1 exit"
```

- [ ] **Step 5: Create the Phase 2 planning checkpoint**

```md
Before starting Phase 2, re-evaluate:

- preload surface area that should be reduced
- any remaining renderer Node APIs
- the best Electron + Vite integration strategy
- the minimal smoke suite to preserve during the build migration
```
