# Phase 5 Cleanup Ledger

Completed removals:

- `.electron-vue/*`
- `src/renderer/stores/moduleDispatcher.js`
- `src/renderer/stores/modules/*`
- generic renderer `app.send/invoke` bridge
- `src/index.ejs`
- Node 16 / Travis / AppVeyor references in the maintained workflow and docs surface

Still intentionally retained:

- `src/muya/webpack.config.js`
  - reason: standalone Muya publishing is outside the modernization scope
  - follow-up: cover it in a dedicated Muya build modernization plan instead of mixing it into dependency cleanup
