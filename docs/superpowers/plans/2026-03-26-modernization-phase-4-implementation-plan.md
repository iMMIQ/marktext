# Modernization Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade MarkText onto a modern Electron runtime baseline, keep native dependencies rebuildable/packageable on that baseline, and enforce a sandboxed renderer security model without regressing the Phase 3 Vue 3 renderer path.

**Architecture:** Phase 4 should separate native-risk work from security-risk work. First lock the runtime/security contracts with tests, then move native modules behind safe main-process adapters and typed preload APIs, then remove remaining synchronous bridge assumptions that block sandboxing, then flip BrowserWindow security defaults, and only after the runtime contract is stable upgrade Electron, builder, and rebuild tooling. Finish with packaged smoke validation and explicit platform-specific exit notes so the next engineer can distinguish real native regressions from release-environment gaps.

**Tech Stack:** Electron 41.x, Node 24 LTS for local tooling, Vite, Vue 3, Pinia, Playwright, Vitest, electron-builder 26.x, `@electron/rebuild` 4.x.

---

## Planning Notes

- This plan intentionally covers **Phase 4 only** from `docs/superpowers/specs/2026-03-24-modernization-dependency-migration-design.md`.
- Do not combine this work with Phase 5 cleanup. If a bridge or fallback is still needed after the runtime jump, record it in the Phase 4 exit report and defer deletion to Phase 5.
- Keep the Phase 3 runtime contract intact while doing this work:
  - `package.json#main` remains `./dist/electron/main.js`
  - the app still builds to `dist/electron`
  - `yarn run dev`, `yarn run pack`, `yarn run unit`, and Playwright smoke runs remain the primary acceptance path
- Use `@superpowers:test-driven-development` while implementing each task and `@superpowers:verification-before-completion` before claiming the phase is complete.
- Runtime targets for this phase:
  - Electron major line: `41.x`
  - Local Node baseline for contributors and CI: `24.x`
  - `electron-builder`: `26.x`
  - `@electron/rebuild`: `4.x`
- Native module strategy for this phase:
  - `native-keymap` should be bumped to the current registry line and moved behind a lazy adapter
  - `keytar` and `fontmanager-redux` are already on their latest published versions in this repo snapshot, so Phase 4 should focus on rebuildability, lazy loading, fallbacks, and packaging validation rather than chasing a nonexistent version bump
- Treat `src/main/config.js`, `src/main/preload/index.js`, `src/main/dataCenter/index.js`, `src/main/keyboard/index.js`, and `src/renderer/prefComponents/common/fontTextBox/index.vue` as the critical path. If these are unstable, the runtime jump is not safe.

## File Structure

### Runtime Contract And Risk Tracking

- Create `test/unit/specs/phase-4-runtime-deps.spec.js`
  - Guard the target Electron/Node/builder/rebuild dependency contract for this phase.
- Create `test/unit/specs/phase-4-security-audit.spec.js`
  - Guard the insecure patterns that must disappear before sandboxing is enabled.
- Create `docs/dev/phase-4-risk-register.md`
  - Record the native-module decision matrix, remaining temporary exceptions, and platform-specific verification notes.

### Native Module Adapters And Typed Bridge APIs

- Create `src/main/native/keytar.js`
  - Lazily load `keytar`, centralize error handling, and expose safe credential helpers that return neutral fallbacks instead of crashing app startup.
- Create `src/main/native/nativeKeymap.js`
  - Lazily load `native-keymap`, centralize keyboard-layout reads, and isolate the monitor registration logic from Electron boot.
- Create `src/main/native/fontManager.js`
  - Lazily load `fontmanager-redux` in the main process and expose a single async font-list API.
- Create `src/main/ipc/renderer/fonts.js`
  - Register typed IPC handlers for font lookup.
- Create `src/main/ipc/renderer/keyboard.js`
  - Register typed IPC handlers for keyboard-layout lookup and debug dump.
- Modify `src/main/dataCenter/index.js`
  - Replace direct `keytar` imports with the adapter and keep all secure-storage access inside main.
- Modify `src/main/keyboard/index.js`
  - Replace direct `native-keymap` imports with the adapter and keep monitor setup resilient to native load failures.
- Modify `src/main/ipc/renderer/index.js`
  - Register the new typed fonts/keyboard handlers.
- Modify `src/main/preload/index.js`
  - Expose `fonts` and `keyboard` modules on `window.mtNative` instead of leaving renderer code to import native modules.
- Create `src/renderer/services/nativeApi/fonts.js`
  - Renderer facade for async font-family lookup.
- Create `src/renderer/services/nativeApi/keyboard.js`
  - Renderer facade for keyboard-layout reads and debug dump.
- Modify `src/renderer/services/nativeApi/index.js`
  - Export the new typed bridge modules.
- Modify `src/renderer/prefComponents/common/fontTextBox/index.vue`
  - Replace renderer-side `require('fontmanager-redux')` with the typed bridge.
- Modify `src/renderer/prefComponents/keybindings/index.vue`
  - Replace raw app-level keyboard IPC usage with the typed keyboard facade.
- Create `test/unit/specs/native-module-adapters.spec.js`
  - Lock adapter fallbacks and verify native load failures do not crash imports.
- Modify `test/unit/specs/renderer-bridge.spec.js`
  - Verify the typed `fonts` and `keyboard` modules are part of the preload contract.
- Modify `test/unit/specs/renderer-boundary-eslint.spec.js`
  - Reject direct renderer imports/requires of native modules such as `fontmanager-redux`.

### Async-Only Runtime Reads

- Create `test/unit/specs/phase-4-async-bridge.spec.js`
  - Lock the removal of the generic `sendSync` bridge and the move to typed async runtime metadata.
- Modify `src/main/ipc/renderer/runtime.js`
  - Fold updateability information into `mt::runtime-get-info` so the renderer can read it from cached bootstrap state instead of a sync IPC call.
- Modify `src/main/dataCenter/index.js`
  - Change image-path selection to `ipcMain.handle(...)` so the renderer no longer needs `sendSync`.
- Modify `src/main/preload/index.js`
  - Remove the generic `app.sendSync` surface and stop exposing runtime sync helpers.
- Modify `src/renderer/services/nativeApi/app.js`
  - Remove the `sendSync` facade.
- Modify `src/renderer/services/nativeApi/runtime.js`
  - Keep only async runtime reads that reflect the preload contract.
- Modify `src/renderer/services/runtime/index.js`
  - Cache the new `canAutoUpdate` value during bootstrap.
- Modify `src/renderer/stores/modules/editor.js`
  - Change `ASK_FOR_IMAGE_PATH` to async `invoke(...)`.
- Modify `src/renderer/commands/utils.js`
  - Read updateability from initialized runtime state instead of sync IPC.
- Modify `test/unit/specs/renderer-runtime.spec.js`
  - Assert that runtime bootstrap now carries update metadata.
- Modify `test/unit/specs/renderer-bridge.spec.js`
  - Assert that `sendSync` is gone from the renderer bridge surface.

### Security Baseline

- Create `test/unit/specs/window-security.spec.js`
  - Lock `contextIsolation`, `sandbox`, `nodeIntegration`, and `webSecurity` defaults for both window variants.
- Create `test/e2e/phase-4-security-smoke.spec.js`
  - Verify the packaged renderer still boots with sandboxed settings and does not expose Node globals on `window`.
- Modify `src/main/config.js`
  - Flip BrowserWindow `webPreferences` to the secure baseline.
- Modify `src/main/app/index.js`
  - Add session-level hardening that belongs with the main process lifecycle.
- Modify `src/renderer/index.html`
  - Remove the `require/__dirname` bootstrap path and prepare the file for a stricter CSP.
- Modify `src/renderer/bootstrap.js`
  - Move the loading-screen theme bootstrap and any remaining startup logic out of inline HTML scripts.
- Modify `test/e2e/xss.spec.js`
  - Assert that loading hostile markdown still does not reveal `process`, `require`, or other Node globals to the renderer.
- Modify `docs/dev/renderer-boundary.md`
  - Document the new security baseline and any explicitly allowed preload exceptions.

### Runtime And Packaging Toolchain

- Create `.nvmrc`
  - Pin the local contributor baseline to Node 24.
- Create `test/unit/specs/native-build-contract.spec.js`
  - Guard the package/build script contract for Electron 41, `@electron/rebuild`, and explicit native rebuilds before packaging.
- Modify `package.json`
  - Bump Electron/runtime tooling dependencies, add the Node engine contract, and route rebuild scripts through `@electron/rebuild`.
- Modify `electron-builder.yml`
  - Keep native module packaging explicit and disable implicit builder-side rebuilds once explicit rebuild scripts are in place.
- Modify `docs/dev/BUILD.md`
  - Update prerequisites and commands for the new Node/Electron/native-rebuild baseline.
- Modify `docs/dev/RELEASE.md`
  - Record the native rebuild and package validation steps release engineers must run on each platform.

### Phase Exit Validation

- Create `test/e2e/phase-4-runtime-smoke.spec.js`
  - Verify the packaged app can exercise the typed runtime/font/keyboard bridge without exposing Node globals.
- Create `docs/dev/phase-4-exit-report.md`
  - Capture the final command log, package results, manual secure-storage verification results, and deferred items for Phase 5.
- Modify `docs/dev/ARCHITECTURE.md`
  - Update the runtime/security/native-dependency architecture notes so the repo documentation matches the new baseline.

### Task 1: Lock The Phase 4 Runtime And Security Contracts

**Files:**
- Create: `test/unit/specs/phase-4-runtime-deps.spec.js`
- Create: `test/unit/specs/phase-4-security-audit.spec.js`
- Create: `docs/dev/phase-4-risk-register.md`
- Test: `test/unit/specs/phase-4-runtime-deps.spec.js`
- Test: `test/unit/specs/phase-4-security-audit.spec.js`

- [ ] **Step 1: Write a failing runtime dependency contract test**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const nvmrc = fs.existsSync(path.join(root, '.nvmrc'))
  ? fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
  : ''

describe('phase 4 runtime dependency contract', () => {
  it('targets the modern Electron runtime baseline', () => {
    expect(pkg.devDependencies.electron).toMatch(/^\\^41\\./)
    expect(pkg.devDependencies['electron-builder']).toMatch(/^\\^26\\./)
    expect(pkg.devDependencies['@electron/rebuild']).toMatch(/^\\^4\\./)
    expect(pkg.devDependencies['electron-updater']).toMatch(/^\\^6\\./)
    expect(pkg.dependencies['native-keymap']).toMatch(/^\\^3\\.3\\.9$/)
    expect(pkg.engines.node).toBe('>=24 <25')
    expect(nvmrc).toBe('24')
  })
})
```

- [ ] **Step 2: Write a failing security audit that captures the current sandbox blockers**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const mainConfig = fs.readFileSync(path.join(root, 'src/main/config.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')
const rendererHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8')
const fontTextbox = fs.readFileSync(path.join(root, 'src/renderer/prefComponents/common/fontTextBox/index.vue'), 'utf8')

describe('phase 4 security blockers', () => {
  it('removes insecure runtime defaults from the main path', () => {
    expect(mainConfig).not.toMatch(/contextIsolation:\\s*false/)
    expect(mainConfig).not.toMatch(/nodeIntegration:\\s*true/)
    expect(mainConfig).not.toMatch(/webSecurity:\\s*false/)
    expect(preload).not.toMatch(/sendSync\\s*:/)
    expect(rendererHtml).not.toMatch(/typeof require === 'function'/)
    expect(fontTextbox).not.toMatch(/require\\('fontmanager-redux'\\)/)
  })
})
```

- [ ] **Step 3: Record the Phase 4 native/runtime risks before changing the runtime**

```md
# Phase 4 Risk Register

Target runtime line:

- Electron `41.x`
- Node `24.x`
- `electron-builder` `26.x`
- `@electron/rebuild` `4.x`

Native module notes:

- `keytar`: keep current published version, move behind lazy adapter, verify secure storage manually on each OS
- `native-keymap`: bump to `^3.3.9`, move behind lazy adapter, verify keyboard layout reads and debug dump
- `fontmanager-redux`: keep current published version, move to main-process adapter, verify font listing in preferences

Temporary exceptions allowed during Phase 4:

- dedicated sync clipboard file-path read may remain until Muya no longer needs a synchronous callback
- generic `nativeApi.app.send/invoke` may remain temporarily, but no generic `sendSync` surface is allowed
```

- [ ] **Step 4: Run the contract tests to verify they fail before implementation**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-4-runtime-deps.spec.js test/unit/specs/phase-4-security-audit.spec.js
```

Expected:

- `phase-4-runtime-deps.spec.js` fails because the repo still targets Electron 18, old builder tooling, and has no Node 24 contract
- `phase-4-security-audit.spec.js` fails because `contextIsolation` is still off, `nodeIntegration` is still on, `sendSync` still exists in preload, `index.html` still references `require`, and the renderer still imports `fontmanager-redux`

- [ ] **Step 5: Commit the failing Phase 4 contracts**

```bash
git add test/unit/specs/phase-4-runtime-deps.spec.js test/unit/specs/phase-4-security-audit.spec.js docs/dev/phase-4-risk-register.md
git commit -m "test: define phase 4 runtime contracts"
```

### Task 2: Move Native Modules Behind Safe Main-Process Adapters

**Files:**
- Create: `src/main/native/keytar.js`
- Create: `src/main/native/nativeKeymap.js`
- Create: `src/main/native/fontManager.js`
- Create: `src/main/ipc/renderer/fonts.js`
- Create: `src/main/ipc/renderer/keyboard.js`
- Create: `src/renderer/services/nativeApi/fonts.js`
- Create: `src/renderer/services/nativeApi/keyboard.js`
- Create: `test/unit/specs/native-module-adapters.spec.js`
- Modify: `src/main/dataCenter/index.js`
- Modify: `src/main/keyboard/index.js`
- Modify: `src/main/ipc/renderer/index.js`
- Modify: `src/main/preload/index.js`
- Modify: `src/renderer/services/nativeApi/index.js`
- Modify: `src/renderer/prefComponents/common/fontTextBox/index.vue`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `test/unit/specs/renderer-bridge.spec.js`
- Modify: `test/unit/specs/renderer-boundary-eslint.spec.js`
- Test: `test/unit/specs/native-module-adapters.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`
- Test: `test/unit/specs/renderer-boundary-eslint.spec.js`

- [ ] **Step 1: Write failing adapter tests that describe the non-crashing native-module contract**

```js
import { describe, expect, it, vi } from 'vitest'

vi.mock('keytar', () => {
  throw new Error('native load failed')
})

describe('native adapters', () => {
  it('returns neutral fallbacks when keytar cannot be loaded', async () => {
    const { getPassword, setPassword } = await import('../../../src/main/native/keytar')

    await expect(getPassword('marktext', 'githubToken')).resolves.toBe('')
    await expect(setPassword('marktext', 'githubToken', 'token')).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Create lazy adapters and typed bridge modules for fonts and keyboard layout**

```js
// src/main/native/fontManager.js
import log from 'electron-log'

let fontManager = null

const loadFontManager = () => {
  if (fontManager !== null) {
    return fontManager
  }

  try {
    fontManager = require('fontmanager-redux')
  } catch (error) {
    log.error('Unable to load fontmanager-redux:', error)
    fontManager = false
  }

  return fontManager
}

export const listFontFamilies = async ({ onlyMonospace = false } = {}) => {
  const api = loadFontManager()
  if (!api) {
    return []
  }

  const fonts = api.getAvailableFontsSync()
  return [...new Set(fonts
    .filter(font => font.family && (!onlyMonospace || font.monospace))
    .map(font => font.family))].sort((a, b) => a.localeCompare(b))
}
```

```js
// src/main/preload/index.js
fonts: {
  listFamilies: options => ipcRenderer.invoke('mt::fonts-list-families', options)
},
keyboard: {
  getInfo: () => ipcRenderer.invoke('mt::keyboard-get-info'),
  dumpInfo: () => ipcRenderer.send('mt::keyboard-dump-info')
}
```

- [ ] **Step 3: Update renderer consumers and guardrails to use the typed bridge instead of importing native code**

```js
// src/renderer/services/nativeApi/fonts.js
const fallbackFontsApi = {
  listFamilies: async () => []
}

const getFontsApi = () => {
  if (typeof window !== 'undefined' && window.mtNative && window.mtNative.fonts) {
    return window.mtNative.fonts
  }

  return fallbackFontsApi
}

export default {
  listFamilies: options => getFontsApi().listFamilies(options)
}
```

```vue
// src/renderer/prefComponents/common/fontTextBox/index.vue
async mounted () {
  this.fontFamilies = await this.$nativeApi.fonts.listFamilies({
    onlyMonospace: this.onlyMonospace
  })
}
```

```js
// test/unit/specs/renderer-boundary-eslint.spec.js
it('rejects direct fontmanager requires in renderer sources', () => {
  const messages = getBoundaryMessages(lintRendererSource("require('fontmanager-redux')\n"))

  expect(messages).toHaveLength(1)
  expect(messages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
})
```

- [ ] **Step 4: Run the targeted tests to prove the adapters and bridge contract are correct**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/native-module-adapters.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js
```

Expected:

- adapter tests pass with native load failures mocked
- `renderer-bridge.spec.js` passes with `fonts` and `keyboard` present on the preload contract
- `renderer-boundary-eslint.spec.js` now rejects direct renderer access to `fontmanager-redux`

- [ ] **Step 5: Commit the native adapter and typed bridge work**

```bash
git add src/main/native/keytar.js src/main/native/nativeKeymap.js src/main/native/fontManager.js src/main/ipc/renderer/fonts.js src/main/ipc/renderer/keyboard.js src/main/dataCenter/index.js src/main/keyboard/index.js src/main/ipc/renderer/index.js src/main/preload/index.js src/renderer/services/nativeApi/fonts.js src/renderer/services/nativeApi/keyboard.js src/renderer/services/nativeApi/index.js src/renderer/prefComponents/common/fontTextBox/index.vue src/renderer/prefComponents/keybindings/index.vue test/unit/specs/native-module-adapters.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/renderer-boundary-eslint.spec.js
git commit -m "refactor: isolate native module access"
```

### Task 3: Remove Generic Sync Bridge Usage From The Renderer Path

**Files:**
- Create: `test/unit/specs/phase-4-async-bridge.spec.js`
- Modify: `src/main/ipc/renderer/runtime.js`
- Modify: `src/main/dataCenter/index.js`
- Modify: `src/main/preload/index.js`
- Modify: `src/renderer/services/nativeApi/app.js`
- Modify: `src/renderer/services/nativeApi/runtime.js`
- Modify: `src/renderer/services/runtime/index.js`
- Modify: `src/renderer/stores/modules/editor.js`
- Modify: `src/renderer/commands/utils.js`
- Modify: `test/unit/specs/renderer-runtime.spec.js`
- Modify: `test/unit/specs/renderer-bridge.spec.js`
- Modify: `test/unit/specs/phase-4-security-audit.spec.js`
- Test: `test/unit/specs/phase-4-async-bridge.spec.js`
- Test: `test/unit/specs/renderer-runtime.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] **Step 1: Write a failing async-bridge contract test**

```js
import { describe, expect, it } from 'vitest'
import nativeApi from '../../../src/renderer/services/nativeApi'

describe('phase 4 async bridge contract', () => {
  it('does not expose a generic sync IPC escape hatch', () => {
    expect(nativeApi.app.sendSync).toBeUndefined()
  })
})
```

- [ ] **Step 2: Move updateability and image-path flows off sync IPC**

```js
// src/main/ipc/renderer/runtime.js
ipcMain.handle('mt::runtime-get-info', event => {
  return {
    platform: process.platform,
    appVersion: global.MARKTEXT_VERSION_STRING || `v${electronApp.getVersion()}`,
    env: { /* existing values */ },
    paths: { /* existing values */ },
    update: {
      canAutoUpdate: isUpdatableAtRuntime()
    }
  }
})
```

```js
// src/main/dataCenter/index.js
ipcMain.handle('mt::ask-for-image-path', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
  })

  return filePaths && filePaths[0] ? filePaths[0] : ''
})
```

```js
// src/renderer/commands/utils.js
import { getRuntime } from '../services/runtime'

export const isUpdatable = () => {
  try {
    return getRuntime().update.canAutoUpdate
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Remove `sendSync` from the preload/app facade and update the renderer callers**

```js
// src/renderer/services/nativeApi/app.js
const fallbackAppApi = {
  openSettingsWindow: () => {},
  send: () => {},
  invoke: async () => undefined
}
```

```js
// src/renderer/stores/modules/editor.js
ASK_FOR_IMAGE_PATH () {
  return app.invoke('mt::ask-for-image-path')
}
```

- [ ] **Step 4: Run the targeted runtime and bridge tests**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-4-async-bridge.spec.js test/unit/specs/renderer-runtime.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/phase-4-security-audit.spec.js
```

Expected:

- the bridge contract passes without `sendSync`
- runtime bootstrap includes `update.canAutoUpdate`
- the security audit no longer finds generic sync bridge exposure

- [ ] **Step 5: Commit the async bridge cleanup**

```bash
git add src/main/ipc/renderer/runtime.js src/main/dataCenter/index.js src/main/preload/index.js src/renderer/services/nativeApi/app.js src/renderer/services/nativeApi/runtime.js src/renderer/services/runtime/index.js src/renderer/stores/modules/editor.js src/renderer/commands/utils.js test/unit/specs/phase-4-async-bridge.spec.js test/unit/specs/renderer-runtime.spec.js test/unit/specs/renderer-bridge.spec.js test/unit/specs/phase-4-security-audit.spec.js
git commit -m "refactor: remove sync runtime bridge usage"
```

### Task 4: Enable The Sandboxed Renderer Security Baseline

**Files:**
- Create: `test/unit/specs/window-security.spec.js`
- Create: `test/e2e/phase-4-security-smoke.spec.js`
- Modify: `src/main/config.js`
- Modify: `src/main/app/index.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/bootstrap.js`
- Modify: `test/e2e/xss.spec.js`
- Modify: `docs/dev/renderer-boundary.md`
- Test: `test/unit/specs/window-security.spec.js`
- Test: `test/e2e/phase-4-security-smoke.spec.js`
- Test: `test/e2e/xss.spec.js`

- [ ] **Step 1: Write a failing BrowserWindow security contract test**

```js
import { describe, expect, it } from 'vitest'
import { editorWinOptions, preferencesWinOptions } from '../../../src/main/config'

for (const [name, options] of Object.entries({ editorWinOptions, preferencesWinOptions })) {
  describe(`${name} security defaults`, () => {
    it('uses the sandboxed renderer baseline', () => {
      expect(options.webPreferences.contextIsolation).toBe(true)
      expect(options.webPreferences.sandbox).toBe(true)
      expect(options.webPreferences.nodeIntegration).toBe(false)
      expect(options.webPreferences.webSecurity).toBe(true)
    })
  })
}
```

- [ ] **Step 2: Flip BrowserWindow defaults and add session-level hardening**

```js
// src/main/config.js
webPreferences: {
  preload,
  contextIsolation: true,
  sandbox: true,
  spellcheck: true,
  nodeIntegration: false,
  webSecurity: true
}
```

```js
// src/main/app/index.js
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  contents.on('will-attach-webview', event => {
    event.preventDefault()
  })

  contents.on('will-navigate', event => {
    event.preventDefault()
  })

  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})
```

- [ ] **Step 3: Remove the renderer bootstrap patterns that assume Node globals and add a CSP-friendly startup path**

```html
<!-- src/renderer/index.html -->
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; img-src 'self' data: blob: file:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://127.0.0.1:9091 ws://127.0.0.1:9091 https:;"
>
```

```js
// src/renderer/bootstrap.js
const hydrateLoadingTheme = () => {
  const params = new URLSearchParams(window.location.search)
  const theme = params.get('theme')
  const color = THEMES_COLOR[theme] || 'rgba(33, 181, 111, 1)'

  document.querySelectorAll('.dot').forEach(dot => {
    dot.style.background = color
  })
}

const bootstrapRenderer = async () => {
  hydrateLoadingTheme()
  window.addEventListener('error', event => {
    if (event.error) {
      const { message, name, stack } = event.error
      app.send('mt::handle-renderer-error', { message, name, stack })
    }
  })

  const { initialState } = parseUrlArgs()
  await initializeRuntime({ initialState })
  configureLogger()
}
```

- [ ] **Step 4: Run unit and packaged security smoke checks**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/window-security.spec.js
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/phase-4-security-smoke.spec.js test/e2e/xss.spec.js
```

Expected:

- `window-security.spec.js` passes with sandboxed BrowserWindow defaults
- the packaged app still launches
- `window.process` and `window.require` are absent in the renderer
- the hostile markdown smoke still shows a visible, non-crashed window

- [ ] **Step 5: Commit the security baseline flip**

```bash
git add src/main/config.js src/main/app/index.js src/renderer/index.html src/renderer/bootstrap.js test/unit/specs/window-security.spec.js test/e2e/phase-4-security-smoke.spec.js test/e2e/xss.spec.js docs/dev/renderer-boundary.md
git commit -m "feat: enable sandboxed renderer security baseline"
```

### Task 5: Upgrade Electron And The Native Rebuild Toolchain

**Files:**
- Create: `.nvmrc`
- Create: `test/unit/specs/native-build-contract.spec.js`
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `docs/dev/BUILD.md`
- Modify: `docs/dev/RELEASE.md`
- Test: `test/unit/specs/phase-4-runtime-deps.spec.js`
- Test: `test/unit/specs/native-build-contract.spec.js`

- [ ] **Step 1: Write a failing build-script contract test**

```js
// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')

describe('phase 4 native build contract', () => {
  it('rebuilds native modules explicitly before packaging', () => {
    expect(pkg.scripts.rebuild).toContain('electron-rebuild')
    expect(pkg.scripts.build).toContain('yarn run rebuild')
    expect(builder).toMatch(/npmRebuild:\\s*false/)
    expect(builder).toMatch(/asarUnpack:\\n- "\\*\\*\\/\\*\\.node"/)
  })
})
```

- [ ] **Step 2: Bump the runtime packages and pin the Node baseline**

```json
{
  "engines": {
    "node": ">=24 <25"
  },
  "devDependencies": {
    "electron": "^41.0.4",
    "electron-builder": "^26.8.1",
    "@electron/rebuild": "^4.0.3",
    "electron-updater": "^6.8.3"
  },
  "dependencies": {
    "native-keymap": "^3.3.9"
  },
  "scripts": {
    "rebuild": "electron-rebuild -f -w keytar -w native-keymap -w fontmanager-redux",
    "build": "yarn run rebuild && yarn run pack:vite && electron-builder",
    "build:bin": "yarn run rebuild && yarn run pack:vite && electron-builder --dir",
    "release:linux": "yarn run rebuild && yarn run pack:vite && electron-builder build --linux"
  }
}
```

```text
# .nvmrc
24
```

- [ ] **Step 3: Align builder config and contributor docs with explicit native rebuilds**

```yaml
# electron-builder.yml
npmRebuild: false
asar: true
asarUnpack:
  - "**/*.node"
buildDependenciesFromSource: true
```

```md
## Prerequisites

- Node.js `24.x`
- Yarn classic
- Python and platform build tools for `node-gyp`

Before packaging:

1. `yarn install`
2. `yarn run rebuild`
3. `yarn run pack`
4. `yarn run build`
```

- [ ] **Step 4: Run the dependency/build contract tests and a real rebuild**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/phase-4-runtime-deps.spec.js test/unit/specs/native-build-contract.spec.js
yarn run rebuild
yarn run pack
```

Expected:

- both contract specs pass
- native modules rebuild against Electron 41 without startup-time import crashes
- `yarn run pack` emits a fresh `dist/electron` bundle on the upgraded runtime line

- [ ] **Step 5: Commit the runtime/tooling upgrade**

```bash
git add .nvmrc package.json electron-builder.yml docs/dev/BUILD.md docs/dev/RELEASE.md test/unit/specs/native-build-contract.spec.js test/unit/specs/phase-4-runtime-deps.spec.js
git commit -m "build: upgrade electron runtime baseline"
```

### Task 6: Verify The Packaged Runtime And Publish The Phase 4 Exit Report

**Files:**
- Create: `test/e2e/phase-4-runtime-smoke.spec.js`
- Create: `docs/dev/phase-4-exit-report.md`
- Modify: `docs/dev/ARCHITECTURE.md`
- Test: `test/e2e/launch.spec.js`
- Test: `test/e2e/phase-3-smoke.spec.js`
- Test: `test/e2e/build-contract.spec.js`
- Test: `test/e2e/bridge-smoke.spec.js`
- Test: `test/e2e/phase-4-security-smoke.spec.js`
- Test: `test/e2e/phase-4-runtime-smoke.spec.js`
- Test: `test/e2e/xss.spec.js`

- [ ] **Step 1: Write a packaged runtime smoke test for the new typed bridge**

```js
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('phase 4 runtime bridge stays available without Node globals', async () => {
  const { app, page } = await launchElectron([])

  const result = await page.evaluate(async () => {
    const runtime = await window.mtNative.runtime.getInfo()
    const fonts = await window.mtNative.fonts.listFamilies({ onlyMonospace: true })
    const keyboard = await window.mtNative.keyboard.getInfo()

    return {
      hasProcess: typeof window.process !== 'undefined',
      hasRequire: typeof window.require !== 'undefined',
      canAutoUpdate: runtime.update.canAutoUpdate,
      fontsType: Array.isArray(fonts),
      hasKeyboardLayout: typeof keyboard.layout === 'string'
    }
  })

  expect(result.hasProcess).toBe(false)
  expect(result.hasRequire).toBe(false)
  expect(result.fontsType).toBe(true)
  expect(result.hasKeyboardLayout).toBe(true)

  await app.close()
})
```

- [ ] **Step 2: Record the Phase 4 verification evidence and manual platform checks**

```md
# Phase 4 Exit Report

Verification commands:

- run `yarn run dev` in a separate terminal, verify the main editor window plus settings window both open, then stop the dev process
- `./node_modules/.bin/vitest run`
- `yarn run rebuild`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js test/e2e/build-contract.spec.js test/e2e/bridge-smoke.spec.js test/e2e/phase-4-security-smoke.spec.js test/e2e/phase-4-runtime-smoke.spec.js test/e2e/xss.spec.js`

Manual native verification:

- macOS: GitHub token save/load reaches Keychain through `keytar`
- Windows: GitHub token save/load reaches Credential Manager
- Linux: GitHub token save/load reaches libsecret
- preferences font dropdown still lists fonts
- keyboard debug dump still writes a file from the preferences page

Deferred to Phase 5:

- shrinking the remaining generic `nativeApi.app.send/invoke` surface
- removing any fallback branches only needed during runtime migration
```

- [ ] **Step 3: Update architecture docs to match the new runtime baseline**

```md
### Main- and renderer process communication

The preload bridge now runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
Renderer code can only access system capabilities through typed facade modules in `src/renderer/services/nativeApi/*`.
Native modules such as `keytar`, `native-keymap`, and `fontmanager-redux` are loaded lazily in main-process adapters under `src/main/native/*`.
```

- [ ] **Step 4: Run the packaged verification suite**

Run:

```bash
./node_modules/.bin/vitest run
yarn run rebuild
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js test/e2e/build-contract.spec.js test/e2e/bridge-smoke.spec.js test/e2e/phase-4-security-smoke.spec.js test/e2e/phase-4-runtime-smoke.spec.js test/e2e/xss.spec.js
```

Expected:

- a separate `yarn run dev` smoke run starts the upgraded runtime and both the editor window and settings window open successfully
- the full Vitest suite passes on the upgraded runtime baseline
- packaged launch/editor/security/build smoke tests all pass
- the Phase 4 exit report has concrete command evidence plus any remaining platform-specific manual findings

- [ ] **Step 5: Commit the Phase 4 exit report**

```bash
git add docs/dev/ARCHITECTURE.md docs/dev/phase-4-exit-report.md test/e2e/phase-4-runtime-smoke.spec.js
git commit -m "docs: record phase 4 runtime verification"
```
