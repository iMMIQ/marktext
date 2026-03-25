# Vue 3 Migration Inventory

Phase 3 exit status:

- `@vue/compat` removed from runtime and test tooling
- `vuex@4` removed from renderer dependencies
- `src/renderer/stores/legacyBridge.js` removed from the renderer boot path
- `src/renderer/store/*` deleted
- renderer state now lives under `src/renderer/stores/*`
- shared store implementation helpers now live under `src/renderer/stores/modules/*` and `src/renderer/stores/helpers/*`

Resolved blockers:

- `src/renderer/main.js` now boots Vue 3 directly with Pinia and Vue Router
- dialog components on the migrated renderer path use Vue 3-compatible bindings
- renderer tests run without compat mode
- the editor and preference shells render through the Vue 3 runtime in Electron smoke coverage
