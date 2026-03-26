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
