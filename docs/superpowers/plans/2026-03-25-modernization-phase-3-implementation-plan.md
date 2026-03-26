# Modernization Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the renderer from the Vue 2 stack to a stable Vue 3 renderer built on Vue Router 4, Pinia, and Element Plus, while keeping the Vite/Electron Phase 2 baseline runnable throughout the migration.

**Architecture:** Phase 3 should separate bootstrapping risk from feature risk. First switch the renderer toolchain and app mount to Vue 3 with a temporary compatibility bridge, then migrate route shells and shared UI syntax blockers, then move state from Vuex semantics into Pinia with a legacy dispatch/commit facade so feature code can be converted incrementally. End the phase by removing the temporary compatibility layer and all Vue 2-only dependencies from the main path.

**Tech Stack:** Electron 18, Vite, Vue 3, Vue Router 4, Pinia, Element Plus, Vitest, Playwright.

---

## Planning Notes

- This plan intentionally covers **Phase 3 only** from `docs/superpowers/specs/2026-03-24-modernization-dependency-migration-design.md`.
- Do not combine this work with Electron, Node, or native-module upgrades. Those remain Phase 4 work.
- Keep the Phase 2 runtime/package contract intact:
  - `package.json#main` stays `./dist/electron/main.js`
  - renderer output still lands under `dist/electron`
  - `yarn run dev`, `yarn run pack`, `yarn run unit`, and Playwright smoke runs remain the acceptance path
- Use `@superpowers:test-driven-development` while implementing each task and `@superpowers:verification-before-completion` before claiming the phase is complete.
- Temporary bridges are allowed only where they shrink migration risk:
  - `@vue/compat` may be used to get the Vue 3 runtime mounted early
  - `vuex@4` may exist briefly only to keep the boot path running before Pinia takes over
  - the Pinia legacy bridge created in this phase must have an explicit removal task before phase exit
- Treat `src/renderer/pages/app.vue`, `src/renderer/pages/preference.vue`, `src/renderer/router/index.js`, and the state layer as the critical path. If these are unstable, the whole phase is unstable.

## File Structure

### Tooling And Boot

- Modify `package.json`
  - Replace Vue 2 renderer dependencies with Vue 3 equivalents and add the libraries needed for Vue 3 testing and Pinia.
- Modify `vite.renderer.config.js`
  - Swap `vite-plugin-vue2` for `@vitejs/plugin-vue`; temporarily alias `vue` to `@vue/compat` until syntax blockers are removed.
- Modify `vitest.config.js`
  - Use the Vue 3 Vite plugin so `.vue` tests run under the same compiler as the app.
- Modify `src/renderer/main.js`
  - Replace `new Vue()` bootstrapping with `createApp()`, plugin registration, router installation, and Pinia/compat installation.
- Create `src/renderer/plugins/elementPlus.js`
  - Centralize Element Plus component registration and global config.
- Create `src/renderer/plugins/services.js`
  - Install `$http`, `$notify`, `$nativeApi`, and any remaining app-wide globals through `app.config.globalProperties` and/or `provide`.

### Routing And Shell

- Create `src/renderer/router/routes.js`
  - Hold the route records separately from router creation so tests can reuse them.
- Modify `src/renderer/router/index.js`
  - Export a Vue Router 4 factory based on `createRouter()` and `createWebHashHistory()`.
- Modify `src/renderer/pages/app.vue`
  - Convert the editor shell to Vue 3-compatible lifecycle hooks, store usage, and drag/drop event wiring.
- Modify `src/renderer/pages/preference.vue`
  - Convert the preference shell to Vue 3-compatible hooks and router-view usage.

### Temporary Compatibility Bridge

- Modify `src/renderer/store/index.js`
  - If needed, move the existing store to `vuex@4` long enough to keep the renderer booting while Pinia stores are introduced.
- Create `src/renderer/stores/index.js`
  - Create the Pinia root and export helpers used by components and tests.
- Create `src/renderer/stores/legacyBridge.js`
  - Expose a temporary `$store` facade backed by Pinia so `dispatch`, `commit`, and `state` calls can be migrated incrementally instead of in one unsafe cutover.

### Pinia Domain Stores

- Create `src/renderer/stores/app.js`
  - Global runtime state previously owned by the root Vuex store.
- Create `src/renderer/stores/preferences.js`
  - Preference state and preference actions.
- Create `src/renderer/stores/layout.js`
  - Sidebar/tab/titlebar layout state.
- Create `src/renderer/stores/project.js`
  - Project-tree state and file/folder operations.
- Create `src/renderer/stores/editor.js`
  - Current file, tabs, save state, search state, and editor actions.
- Create `src/renderer/stores/commandCenter.js`
  - Command palette registration, search, and execution wiring.
- Create `src/renderer/stores/autoUpdates.js`
  - Update-notification state and listeners.
- Create `src/renderer/stores/notification.js`
  - Notification queue state and bridge wiring.
- Create `src/renderer/stores/tweet.js`
  - Tweet modal state and actions.
- Create `src/renderer/stores/listenForMain.js`
  - Main-process event listeners currently bundled into Vuex modules.

### Shared UI And Preference Surface

- Modify `src/renderer/prefComponents/common/bool/index.vue`
- Modify `src/renderer/prefComponents/common/compound/index.vue`
- Modify `src/renderer/prefComponents/common/fontTextBox/index.vue`
- Modify `src/renderer/prefComponents/common/range/index.vue`
- Modify `src/renderer/prefComponents/common/select/index.vue`
- Modify `src/renderer/prefComponents/common/textBox/index.vue`
- Modify `src/renderer/prefComponents/common/titlebar.vue`
  - Convert Element UI slot syntax, `v-model` contracts, and deprecated lifecycle hooks.
- Modify `src/renderer/prefComponents/general/index.vue`
- Modify `src/renderer/prefComponents/editor/index.vue`
- Modify `src/renderer/prefComponents/markdown/index.vue`
- Modify `src/renderer/prefComponents/spellchecker/index.vue`
- Modify `src/renderer/prefComponents/theme/index.vue`
- Modify `src/renderer/prefComponents/image/index.vue`
- Modify `src/renderer/prefComponents/image/components/folderSetting/index.vue`
- Modify `src/renderer/prefComponents/image/components/uploader/index.vue`
- Modify `src/renderer/prefComponents/image/components/uploader/legalNoticesCheckbox.vue`
- Modify `src/renderer/prefComponents/keybindings/index.vue`
- Modify `src/renderer/prefComponents/keybindings/key-input-dialog.vue`
- Modify `src/renderer/prefComponents/sideBar/index.vue`
  - Move preference flows off `mapState`/`this.$store` and onto Pinia/composables while converting Element UI widgets to Element Plus.

### Editor Workspace And Dialog Surface

- Create `src/renderer/composables/useEventBus.js`
  - Replace `new Vue()` event-bus usage with a small emitter that works under Vue 3.
- Modify `src/renderer/bus/index.js`
  - Either export the new emitter or reduce the file to a compat shim scheduled for deletion.
- Modify `src/renderer/mixins/index.js`
  - Stop assuming Vue 2 instance APIs and old store contracts.
- Modify `src/renderer/components/titleBar/index.vue`
- Modify `src/renderer/components/about/index.vue`
- Modify `src/renderer/components/import/index.vue`
- Modify `src/renderer/components/rename/index.vue`
- Modify `src/renderer/components/tweet/index.vue`
- Modify `src/renderer/components/commandPalette/index.vue`
- Modify `src/renderer/components/exportSettings/index.vue`
- Modify `src/renderer/components/recent/index.vue`
- Modify `src/renderer/components/search/index.vue`
- Modify `src/renderer/components/sideBar/index.vue`
- Modify `src/renderer/components/sideBar/tree.vue`
- Modify `src/renderer/components/sideBar/treeFile.vue`
- Modify `src/renderer/components/sideBar/treeFolder.vue`
- Modify `src/renderer/components/sideBar/treeOpenedTab.vue`
- Modify `src/renderer/components/sideBar/search.vue`
- Modify `src/renderer/components/sideBar/searchResultItem.vue`
- Modify `src/renderer/components/sideBar/toc.vue`
- Modify `src/renderer/components/editorWithTabs/index.vue`
- Modify `src/renderer/components/editorWithTabs/editor.vue`
- Modify `src/renderer/components/editorWithTabs/sourceCode.vue`
- Modify `src/renderer/components/editorWithTabs/tabs.vue`
- Modify `src/renderer/components/editorWithTabs/notifications.vue`
  - Remove `.sync`, `slot-scope`, `beforeDestroy`, and Vue 2 event-bus/store assumptions from the editor path.

### Styling, Tests, And Docs

- Modify `src/renderer/assets/styles/index.css`
- Modify `src/renderer/assets/themes/one-dark.theme.css`
  - Update selectors and spacing rules affected by Element Plus markup changes.
- Create `test/unit/specs/renderer-vue3-deps.spec.js`
  - Dependency/config contract for Vue 3, Router 4, Pinia, Element Plus, and the Vite plugin.
- Create `test/unit/specs/renderer-vue3-syntax.spec.js`
  - Guard against remaining `.sync`, `slot-scope`, `beforeDestroy`, `new Vue`, and `element-ui` usage in the renderer main path.
- Create `test/unit/specs/renderer-app-shell.spec.js`
  - Mount-level tests for `createApp`, router creation, and plugin wiring.
- Create `test/unit/specs/pinia-legacy-bridge.spec.js`
  - Pinia bridge contract tests.
- Create `test/unit/specs/preferences-shell.spec.js`
  - Preference route rendering and Element Plus component smoke coverage.
- Create `test/e2e/phase-3-smoke.spec.js`
  - End-to-end checks for editor shell, preferences shell, and a minimal dialog path.
- Create `docs/dev/vue3-migration-inventory.md`
  - Inventory of temporary bridges, syntax blockers, and removal checkpoints.
- Create `docs/dev/phase-3-exit-report.md`
  - Final validation run and deferred items.
- Modify `docs/dev/ARCHITECTURE.md`
- Modify `docs/dev/BUILD.md`
  - Keep implementation docs aligned with the new renderer stack.

### Final Cleanup

- Delete `src/renderer/store/index.js`
  - Only after every consumer is using Pinia or the Pinia-backed legacy bridge has been removed.
- Delete `src/renderer/store/autoUpdates.js`
- Delete `src/renderer/store/commandCenter.js`
- Delete `src/renderer/store/editor.js`
- Delete `src/renderer/store/help.js`
- Delete `src/renderer/store/layout.js`
- Delete `src/renderer/store/listenForMain.js`
- Delete `src/renderer/store/notification.js`
- Delete `src/renderer/store/preferences.js`
- Delete `src/renderer/store/project.js`
- Delete `src/renderer/store/treeCtrl.js`
- Delete `src/renderer/store/tweet.js`
  - Remove the old Vuex module tree from the main path before phase exit.

### Task 1: Lock The Vue 3 Migration Contracts

**Files:**
- Create: `test/unit/specs/renderer-vue3-deps.spec.js`
- Create: `test/unit/specs/renderer-vue3-syntax.spec.js`
- Create: `docs/dev/vue3-migration-inventory.md`
- Test: `test/unit/specs/renderer-vue3-deps.spec.js`
- Test: `test/unit/specs/renderer-vue3-syntax.spec.js`

- [ ] **Step 1: Write a failing dependency/config contract test**

```js
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const viteRendererConfig = fs.readFileSync(path.join(root, 'vite.renderer.config.js'), 'utf8')

describe('renderer Vue 3 dependency contract', () => {
  it('uses the Vue 3 renderer stack', () => {
    expect(pkg.dependencies.vue).toMatch(/^\\^3\\./)
    expect(pkg.dependencies['vue-router']).toMatch(/^\\^4\\./)
    expect(pkg.dependencies.pinia).toBeTruthy()
    expect(pkg.dependencies['element-plus']).toBeTruthy()
    expect(viteRendererConfig).toMatch(/@vitejs\\/plugin-vue/)
  })
})
```

- [ ] **Step 2: Write a failing syntax-blocker audit test**

```js
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const files = [
  'src/renderer/main.js',
  'src/renderer/components/tweet/index.vue',
  'src/renderer/components/rename/index.vue',
  'src/renderer/prefComponents/spellchecker/index.vue',
  'src/renderer/prefComponents/keybindings/index.vue'
]

describe('renderer Vue 3 syntax blockers', () => {
  it('removes Vue 2-only patterns from the main migration path', () => {
    const source = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\\n')
    expect(source).not.toMatch(/new Vue\\(|Vue\\.use\\(|:visible\\.sync=|slot-scope=|beforeDestroy\\s*\\(/)
    expect(source).not.toMatch(/element-ui|vue-template-compiler|vue-electron/)
  })
})
```

- [ ] **Step 3: Record the migration inventory before changing the stack**

```md
# Vue 3 Migration Inventory

Temporary bridges allowed in Phase 3:

- `@vue/compat` in `vite.renderer.config.js`
- `vuex@4` only until Pinia stores and the Pinia legacy bridge are stable
- `src/renderer/stores/legacyBridge.js` until all `$store` consumers are migrated

Known blockers at plan start:

- `src/renderer/main.js` still uses `new Vue()` and `Vue.use()`
- dialog components still use `:visible.sync`
- table/autocomplete components still use `slot-scope`
- many components still depend on `mapState` and `this.$store.dispatch(...)`
```

- [ ] **Step 4: Run the contract tests to verify they fail before implementation**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/renderer-vue3-deps.spec.js test/unit/specs/renderer-vue3-syntax.spec.js
```

Expected:

- `renderer-vue3-deps.spec.js` fails because `package.json` still points at Vue 2 / Router 3 / Element UI / `vite-plugin-vue2`
- `renderer-vue3-syntax.spec.js` fails because the renderer still contains `new Vue()`, `.sync`, `slot-scope`, and `beforeDestroy`

- [ ] **Step 5: Commit the failing migration contracts**

```bash
git add docs/dev/vue3-migration-inventory.md test/unit/specs/renderer-vue3-deps.spec.js test/unit/specs/renderer-vue3-syntax.spec.js
git commit -m "test: define phase 3 migration contracts"
```

### Task 2: Switch The Renderer Boot Path To Vue 3

**Files:**
- Create: `src/renderer/plugins/elementPlus.js`
- Create: `src/renderer/plugins/services.js`
- Create: `src/renderer/router/routes.js`
- Create: `test/unit/specs/renderer-app-shell.spec.js`
- Modify: `package.json`
- Modify: `vite.renderer.config.js`
- Modify: `vitest.config.js`
- Modify: `src/renderer/main.js`
- Modify: `src/renderer/router/index.js`
- Modify: `src/renderer/store/index.js`
- Test: `test/unit/specs/renderer-app-shell.spec.js`
- Test: `test/unit/specs/renderer-vue3-deps.spec.js`

- [ ] **Step 1: Write a failing renderer-shell mount test**

```js
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import routes from '@/router/routes'

describe('renderer app shell', () => {
  it('builds a Vue 3 router for the editor shell', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routes('editor')
    })

    expect(router.getRoutes().map(route => route.path)).toContain('/editor')
  })
})
```

- [ ] **Step 2: Replace the Vue 2 renderer dependencies and compiler plugin**

```json
{
  "dependencies": {
    "element-plus": "^2.9.6",
    "mitt": "^3.0.1",
    "pinia": "^2.3.1",
    "vue": "^3.5.13",
    "vue-router": "^4.5.1",
    "vuex": "^4.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.3",
    "@vue/compiler-sfc": "^3.5.13",
    "@vue/test-utils": "^2.4.6"
  }
}
```

- [ ] **Step 3: Move bootstrapping to `createApp()` and Router 4 while keeping a temporary compatibility bridge**

```js
import { createApp, configureCompat } from 'vue'
import { createStore } from 'vuex'
import bootstrapRenderer from './bootstrap'
import { createMarkTextRouter } from './router'
import { installElementPlus } from './plugins/elementPlus'
import { installServices } from './plugins/services'

configureCompat({ MODE: 2 })

const start = async () => {
  await bootstrapRenderer()

  const [{ default: App }, { default: legacyStore }] = await Promise.all([
    import('./pages/app.vue'),
    import('./store')
  ])

  const app = createApp(App)
  const store = createStore(legacyStore)
  const router = createMarkTextRouter()

  installElementPlus(app)
  installServices(app)
  app.use(store)
  app.use(router)
  app.mount('#app')
}
```

- [ ] **Step 4: Run the targeted unit tests to confirm the new boot path works**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/renderer-vue3-deps.spec.js test/unit/specs/renderer-app-shell.spec.js
```

Expected:

- Both specs pass
- The dependency contract now shows Vue 3, Router 4, Pinia, Element Plus, and `@vitejs/plugin-vue`

- [ ] **Step 5: Commit the renderer boot migration**

```bash
git add package.json vite.renderer.config.js vitest.config.js src/renderer/main.js src/renderer/router/index.js src/renderer/router/routes.js src/renderer/store/index.js src/renderer/plugins/elementPlus.js src/renderer/plugins/services.js test/unit/specs/renderer-app-shell.spec.js
git commit -m "feat: boot renderer with vue 3"
```

### Task 3: Remove Vue 2 Template Syntax And Element UI Dialog Contracts

**Files:**
- Modify: `src/renderer/pages/app.vue`
- Modify: `src/renderer/pages/preference.vue`
- Modify: `src/renderer/components/about/index.vue`
- Modify: `src/renderer/components/commandPalette/index.vue`
- Modify: `src/renderer/components/exportSettings/index.vue`
- Modify: `src/renderer/components/import/index.vue`
- Modify: `src/renderer/components/rename/index.vue`
- Modify: `src/renderer/components/tweet/index.vue`
- Modify: `src/renderer/components/editorWithTabs/editor.vue`
- Modify: `src/renderer/prefComponents/keybindings/key-input-dialog.vue`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `src/renderer/prefComponents/sideBar/index.vue`
- Modify: `src/renderer/prefComponents/spellchecker/index.vue`
- Modify: `src/renderer/prefComponents/common/fontTextBox/index.vue`
- Modify: `src/renderer/assets/styles/index.css`
- Modify: `src/renderer/assets/themes/one-dark.theme.css`
- Test: `test/unit/specs/renderer-vue3-syntax.spec.js`

- [ ] **Step 1: Extend the syntax audit to cover dialog and slot conversions that must be completed in this task**

```js
expect(source).not.toMatch(/:visible\\.sync=|slot-scope=|slot=\"title\"|slot=\"suffix\"|beforeDestroy\\s*\\(/)
expect(source).not.toMatch(/el-icon-[a-z-]+/)
```

- [ ] **Step 2: Convert `.sync`, legacy slots, and lifecycle hooks to Vue 3/Element Plus syntax**

```vue
<el-dialog v-model="showRename" destroy-on-close>
  <template #header>
    <div class="search-wrapper">{{ filename }}</div>
  </template>
</el-dialog>

<el-autocomplete v-model="searchText">
  <template #suffix>
    <i class="icon-search"></i>
  </template>
  <template #default="{ item }">
    <span>{{ item.label }}</span>
  </template>
</el-autocomplete>
```

- [ ] **Step 3: Rename Vue 2 lifecycle hooks and update style selectors that depend on Element UI markup**

```js
export default {
  beforeUnmount () {
    this.unlisten?.()
  }
}
```

```css
.marktext-dialog :deep(.el-dialog__header) {
  padding: 12px 16px;
}
```

- [ ] **Step 4: Run the syntax audit to verify the main path is free of the known blockers**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/renderer-vue3-syntax.spec.js
```

Expected:

- The syntax audit passes
- The targeted files no longer contain `.sync`, `slot-scope`, `slot="..."`, or `beforeDestroy`

- [ ] **Step 5: Commit the syntax and dialog migration**

```bash
git add src/renderer/pages/app.vue src/renderer/pages/preference.vue src/renderer/components/about/index.vue src/renderer/components/commandPalette/index.vue src/renderer/components/exportSettings/index.vue src/renderer/components/import/index.vue src/renderer/components/rename/index.vue src/renderer/components/tweet/index.vue src/renderer/components/editorWithTabs/editor.vue src/renderer/prefComponents/keybindings/key-input-dialog.vue src/renderer/prefComponents/keybindings/index.vue src/renderer/prefComponents/sideBar/index.vue src/renderer/prefComponents/spellchecker/index.vue src/renderer/prefComponents/common/fontTextBox/index.vue src/renderer/assets/styles/index.css src/renderer/assets/themes/one-dark.theme.css test/unit/specs/renderer-vue3-syntax.spec.js
git commit -m "refactor: remove vue 2 template syntax"
```

### Task 4: Introduce Pinia And The Temporary Legacy Store Bridge

**Files:**
- Create: `src/renderer/stores/index.js`
- Create: `src/renderer/stores/app.js`
- Create: `src/renderer/stores/preferences.js`
- Create: `src/renderer/stores/layout.js`
- Create: `src/renderer/stores/project.js`
- Create: `src/renderer/stores/editor.js`
- Create: `src/renderer/stores/commandCenter.js`
- Create: `src/renderer/stores/autoUpdates.js`
- Create: `src/renderer/stores/notification.js`
- Create: `src/renderer/stores/tweet.js`
- Create: `src/renderer/stores/listenForMain.js`
- Create: `src/renderer/stores/legacyBridge.js`
- Create: `test/unit/specs/pinia-legacy-bridge.spec.js`
- Modify: `src/renderer/main.js`
- Modify: `docs/dev/vue3-migration-inventory.md`
- Test: `test/unit/specs/pinia-legacy-bridge.spec.js`

- [ ] **Step 1: Write a failing Pinia bridge contract test**

```js
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { createLegacyStoreBridge } from '@/stores/legacyBridge'
import { usePreferencesStore } from '@/stores/preferences'

describe('pinia legacy bridge', () => {
  it('maps legacy dispatch calls onto pinia actions', async () => {
    setActivePinia(createPinia())
    const bridge = createLegacyStoreBridge()
    const preferences = usePreferencesStore()

    await bridge.dispatch('SET_SINGLE_PREFERENCE', { type: 'theme', value: 'dark' })

    expect(preferences.theme).toBe('dark')
    expect(bridge.state.preferences.theme).toBe('dark')
  })
})
```

- [ ] **Step 2: Create Pinia domain stores that mirror the current Vuex module responsibilities**

```js
import { defineStore } from 'pinia'

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    theme: 'light',
    sourceCode: false,
    titleBarStyle: 'native'
  }),
  actions: {
    async setSinglePreference ({ type, value }) {
      this[type] = value
    }
  }
})
```

- [ ] **Step 3: Install the legacy bridge so old `$store.dispatch()` callers keep working while components migrate**

```js
import { createPinia } from 'pinia'
import { createLegacyStoreBridge } from './stores/legacyBridge'

const pinia = createPinia()
const legacyStore = createLegacyStoreBridge(pinia)

app.use(pinia)
app.config.globalProperties.$store = legacyStore
app.provide('legacyStore', legacyStore)
```

- [ ] **Step 4: Run the bridge tests and update the inventory to show Vuex is now in shrinking scope**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/pinia-legacy-bridge.spec.js test/unit/specs/renderer-app-shell.spec.js
```

Expected:

- The bridge test passes
- The renderer shell still mounts with Pinia installed
- `docs/dev/vue3-migration-inventory.md` now marks the old `src/renderer/store/*` tree as pending deletion

- [ ] **Step 5: Commit the Pinia bridge introduction**

```bash
git add src/renderer/main.js src/renderer/stores/index.js src/renderer/stores/app.js src/renderer/stores/preferences.js src/renderer/stores/layout.js src/renderer/stores/project.js src/renderer/stores/editor.js src/renderer/stores/commandCenter.js src/renderer/stores/autoUpdates.js src/renderer/stores/notification.js src/renderer/stores/tweet.js src/renderer/stores/listenForMain.js src/renderer/stores/legacyBridge.js test/unit/specs/pinia-legacy-bridge.spec.js docs/dev/vue3-migration-inventory.md
git commit -m "feat: add pinia compatibility bridge"
```

### Task 5: Migrate The Preference Surface To Pinia And Element Plus

**Files:**
- Create: `test/unit/specs/preferences-shell.spec.js`
- Modify: `src/renderer/pages/preference.vue`
- Modify: `src/renderer/prefComponents/common/bool/index.vue`
- Modify: `src/renderer/prefComponents/common/compound/index.vue`
- Modify: `src/renderer/prefComponents/common/fontTextBox/index.vue`
- Modify: `src/renderer/prefComponents/common/range/index.vue`
- Modify: `src/renderer/prefComponents/common/select/index.vue`
- Modify: `src/renderer/prefComponents/common/textBox/index.vue`
- Modify: `src/renderer/prefComponents/common/titlebar.vue`
- Modify: `src/renderer/prefComponents/general/index.vue`
- Modify: `src/renderer/prefComponents/editor/index.vue`
- Modify: `src/renderer/prefComponents/markdown/index.vue`
- Modify: `src/renderer/prefComponents/spellchecker/index.vue`
- Modify: `src/renderer/prefComponents/theme/index.vue`
- Modify: `src/renderer/prefComponents/image/index.vue`
- Modify: `src/renderer/prefComponents/image/components/folderSetting/index.vue`
- Modify: `src/renderer/prefComponents/image/components/uploader/index.vue`
- Modify: `src/renderer/prefComponents/image/components/uploader/legalNoticesCheckbox.vue`
- Modify: `src/renderer/prefComponents/keybindings/index.vue`
- Modify: `src/renderer/prefComponents/keybindings/key-input-dialog.vue`
- Modify: `src/renderer/prefComponents/sideBar/index.vue`
- Test: `test/unit/specs/preferences-shell.spec.js`

- [ ] **Step 1: Write a failing preference-shell smoke test**

```js
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Preference from '@/pages/preference.vue'
import routes from '@/router/routes'

it('renders the general preference route with pinia-backed state', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: routes('preferences') })
  router.push('/preference/general')
  await router.isReady()

  const wrapper = mount(Preference, {
    global: {
      plugins: [createPinia(), router]
    }
  })

  expect(wrapper.find('.pref-container').exists()).toBe(true)
})
```

- [ ] **Step 2: Replace `mapState` and direct `this.$store.dispatch()` preference flows with Pinia store access**

```js
import { mapState, mapActions } from 'pinia'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  computed: {
    ...mapState(usePreferencesStore, ['theme', 'titleBarStyle'])
  },
  methods: {
    ...mapActions(usePreferencesStore, ['setSinglePreference'])
  }
}
```

- [ ] **Step 3: Finish the Element Plus control migration on the preference path**

```vue
<el-table :data="words">
  <el-table-column prop="word" label="Word" />
  <el-table-column fixed="right" label="Options" width="90">
    <template #default="{ row }">
      <el-button link @click="handleDeleteClick(row)">
        <i class="icon-delete"></i>
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

- [ ] **Step 4: Run the preference-shell tests**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/preferences-shell.spec.js test/unit/specs/renderer-vue3-syntax.spec.js
```

Expected:

- The preference shell mounts through Router 4 and Pinia
- The syntax audit still passes after the broader preference-surface conversion

- [ ] **Step 5: Commit the preference migration**

```bash
git add src/renderer/pages/preference.vue src/renderer/prefComponents/common/bool/index.vue src/renderer/prefComponents/common/compound/index.vue src/renderer/prefComponents/common/fontTextBox/index.vue src/renderer/prefComponents/common/range/index.vue src/renderer/prefComponents/common/select/index.vue src/renderer/prefComponents/common/textBox/index.vue src/renderer/prefComponents/common/titlebar.vue src/renderer/prefComponents/general/index.vue src/renderer/prefComponents/editor/index.vue src/renderer/prefComponents/markdown/index.vue src/renderer/prefComponents/spellchecker/index.vue src/renderer/prefComponents/theme/index.vue src/renderer/prefComponents/image/index.vue src/renderer/prefComponents/image/components/folderSetting/index.vue src/renderer/prefComponents/image/components/uploader/index.vue src/renderer/prefComponents/image/components/uploader/legalNoticesCheckbox.vue src/renderer/prefComponents/keybindings/index.vue src/renderer/prefComponents/keybindings/key-input-dialog.vue src/renderer/prefComponents/sideBar/index.vue test/unit/specs/preferences-shell.spec.js
git commit -m "refactor: migrate preference ui to pinia"
```

### Task 6: Migrate The Editor Workspace, Sidebar, And Dialog Path

**Files:**
- Create: `src/renderer/composables/useEventBus.js`
- Create: `test/e2e/phase-3-smoke.spec.js`
- Modify: `src/renderer/bus/index.js`
- Modify: `src/renderer/mixins/index.js`
- Modify: `src/renderer/pages/app.vue`
- Modify: `src/renderer/components/titleBar/index.vue`
- Modify: `src/renderer/components/about/index.vue`
- Modify: `src/renderer/components/import/index.vue`
- Modify: `src/renderer/components/rename/index.vue`
- Modify: `src/renderer/components/tweet/index.vue`
- Modify: `src/renderer/components/commandPalette/index.vue`
- Modify: `src/renderer/components/exportSettings/index.vue`
- Modify: `src/renderer/components/recent/index.vue`
- Modify: `src/renderer/components/search/index.vue`
- Modify: `src/renderer/components/sideBar/index.vue`
- Modify: `src/renderer/components/sideBar/tree.vue`
- Modify: `src/renderer/components/sideBar/treeFile.vue`
- Modify: `src/renderer/components/sideBar/treeFolder.vue`
- Modify: `src/renderer/components/sideBar/treeOpenedTab.vue`
- Modify: `src/renderer/components/sideBar/search.vue`
- Modify: `src/renderer/components/sideBar/searchResultItem.vue`
- Modify: `src/renderer/components/sideBar/toc.vue`
- Modify: `src/renderer/components/editorWithTabs/index.vue`
- Modify: `src/renderer/components/editorWithTabs/editor.vue`
- Modify: `src/renderer/components/editorWithTabs/sourceCode.vue`
- Modify: `src/renderer/components/editorWithTabs/tabs.vue`
- Modify: `src/renderer/components/editorWithTabs/notifications.vue`
- Test: `test/e2e/phase-3-smoke.spec.js`

- [ ] **Step 1: Write a failing end-to-end smoke test for the Vue 3 editor shell**

```js
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('editor and preference shells load on the Vue 3 renderer', async () => {
  const { app, page } = await launchElectron()

  await expect(page.locator('.editor-container')).toBeVisible()
  await page.evaluate(() => { window.location.hash = '#/preference/general' })
  await expect(page.locator('.pref-container')).toBeVisible()

  await app.close()
})
```

- [ ] **Step 2: Replace the Vue instance event bus with a Vue 3-safe emitter and move editor consumers off `mapState`**

```js
import mitt from 'mitt'

const emitter = mitt()

export const useEventBus = () => emitter
export default emitter
```

```js
import { mapState, mapActions } from 'pinia'
import { useEditorStore } from '@/stores/editor'

export default {
  computed: {
    ...mapState(useEditorStore, ['currentFile', 'tabs'])
  },
  methods: {
    ...mapActions(useEditorStore, ['closeTab', 'search'])
  }
}
```

- [ ] **Step 3: Migrate the editor path off the legacy bridge and onto direct Pinia/composable usage**

```js
import { useEditorStore } from '@/stores/editor'
import { useLayoutStore } from '@/stores/layout'
import { useEventBus } from '@/composables/useEventBus'

const editor = useEditorStore()
const layout = useLayoutStore()
const bus = useEventBus()

await editor.askForUserPreference()
bus.emit('importDialog', true)
layout.changeSideBarWidth(280)
```

- [ ] **Step 4: Run the editor smoke checks and the core unit suite**

Run:

```bash
./node_modules/.bin/vitest run test/unit/specs/renderer-app-shell.spec.js test/unit/specs/pinia-legacy-bridge.spec.js test/unit/specs/preferences-shell.spec.js
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js
```

Expected:

- The unit suite passes with the editor path using Pinia stores directly
- Playwright confirms the editor shell and preference shell both render under the Vue 3 renderer

- [ ] **Step 5: Commit the editor-surface migration**

```bash
git add src/renderer/composables/useEventBus.js src/renderer/bus/index.js src/renderer/mixins/index.js src/renderer/pages/app.vue src/renderer/components/titleBar/index.vue src/renderer/components/about/index.vue src/renderer/components/import/index.vue src/renderer/components/rename/index.vue src/renderer/components/tweet/index.vue src/renderer/components/commandPalette/index.vue src/renderer/components/exportSettings/index.vue src/renderer/components/recent/index.vue src/renderer/components/search/index.vue src/renderer/components/sideBar/index.vue src/renderer/components/sideBar/tree.vue src/renderer/components/sideBar/treeFile.vue src/renderer/components/sideBar/treeFolder.vue src/renderer/components/sideBar/treeOpenedTab.vue src/renderer/components/sideBar/search.vue src/renderer/components/sideBar/searchResultItem.vue src/renderer/components/sideBar/toc.vue src/renderer/components/editorWithTabs/index.vue src/renderer/components/editorWithTabs/editor.vue src/renderer/components/editorWithTabs/sourceCode.vue src/renderer/components/editorWithTabs/tabs.vue src/renderer/components/editorWithTabs/notifications.vue test/e2e/phase-3-smoke.spec.js
git commit -m "refactor: migrate editor ui to pinia"
```

### Task 7: Remove The Compatibility Layer And Finalize Phase 3

**Files:**
- Create: `docs/dev/phase-3-exit-report.md`
- Modify: `package.json`
- Modify: `vite.renderer.config.js`
- Modify: `vitest.config.js`
- Modify: `src/renderer/main.js`
- Modify: `docs/dev/vue3-migration-inventory.md`
- Modify: `docs/dev/ARCHITECTURE.md`
- Modify: `docs/dev/BUILD.md`
- Modify: `test/unit/specs/renderer-vue3-deps.spec.js`
- Delete: `src/renderer/store/index.js`
- Delete: `src/renderer/store/autoUpdates.js`
- Delete: `src/renderer/store/commandCenter.js`
- Delete: `src/renderer/store/editor.js`
- Delete: `src/renderer/store/help.js`
- Delete: `src/renderer/store/layout.js`
- Delete: `src/renderer/store/listenForMain.js`
- Delete: `src/renderer/store/notification.js`
- Delete: `src/renderer/store/preferences.js`
- Delete: `src/renderer/store/project.js`
- Delete: `src/renderer/store/treeCtrl.js`
- Delete: `src/renderer/store/tweet.js`
- Test: `test/unit/specs/renderer-vue3-deps.spec.js`
- Test: `test/e2e/phase-3-smoke.spec.js`

- [ ] **Step 1: Tighten the dependency contract so temporary bridges are no longer allowed**

```js
expect(pkg.dependencies.vuex).toBeUndefined()
expect(pkg.dependencies['element-ui']).toBeUndefined()
expect(pkg.dependencies['vue-electron']).toBeUndefined()
expect(pkg.devDependencies['vite-plugin-vue2']).toBeUndefined()
expect(viteRendererConfig).not.toMatch(/@vue\\/compat/)
```

- [ ] **Step 2: Remove the temporary compatibility layer from the renderer boot path**

```js
import { createApp } from 'vue'

const pinia = createPinia()

app.use(pinia)
app.use(createMarkTextRouter())
app.mount('#app')
```

- [ ] **Step 3: Delete the old Vuex module tree and update the docs to reflect the permanent Vue 3 architecture**

```md
# Phase 3 Exit Report

Validation:

- `yarn run lint`
- `yarn run unit`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js`

Deferred:

- Electron / Node / native-module upgrades for Phase 4
```

- [ ] **Step 4: Run the full Phase 3 verification suite**

Run:

```bash
yarn run lint
./node_modules/.bin/vitest run
yarn run pack
./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js
```

Expected:

- Lint passes
- All Vitest specs pass
- Pack succeeds with the Vue 3 renderer
- Playwright smoke passes for the editor and preference shells

- [ ] **Step 5: Commit the finalized Phase 3 stack**

```bash
git add package.json vite.renderer.config.js vitest.config.js src/renderer/main.js docs/dev/vue3-migration-inventory.md docs/dev/ARCHITECTURE.md docs/dev/BUILD.md docs/dev/phase-3-exit-report.md test/unit/specs/renderer-vue3-deps.spec.js
git add -u src/renderer/store
git commit -m "feat: complete phase 3 renderer migration"
```
