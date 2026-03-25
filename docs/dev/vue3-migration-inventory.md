# Vue 3 Migration Inventory

Temporary bridges allowed in Phase 3:

- `@vue/compat` in `vite.renderer.config.js`
- `vuex@4` only until Pinia stores and the Pinia legacy bridge are stable
- `src/renderer/stores/legacyBridge.js` until all `$store` consumers are migrated
- `src/renderer/store/*` is now pending deletion once Pinia-backed consumers stop relying on the legacy bridge

Known blockers at plan start:

- `src/renderer/main.js` still uses `new Vue()` and `Vue.use()`
- dialog components still use `:visible.sync`
- table/autocomplete components still use `slot-scope`
- many components still depend on `mapState` and `this.$store.dispatch(...)`
