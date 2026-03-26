# Renderer Boundary

Renderer code must not import or require `electron`, `@electron/remote`, `fontmanager-redux`, `keytar`, or `native-keymap` directly.

ESLint enforces this under `src/renderer/**/*.{js,vue}` with the message:

`Use src/renderer/services/nativeApi instead.`

Allowed path:

- renderer component/store/command
- `src/renderer/services/nativeApi/*`
- preload bridge
- explicit IPC handlers in main process

Security baseline:

- BrowserWindows run with `contextIsolation: true`
- BrowserWindows run with `sandbox: true`
- BrowserWindows run with `nodeIntegration: false`
- BrowserWindows keep `webSecurity: true`

If renderer code needs a new native capability, extend the preload bridge and
the matching facade in `src/renderer/services/nativeApi/` instead of importing
Electron APIs directly.
