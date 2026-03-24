# Renderer Boundary

Renderer code must not import or require `electron` or `@electron/remote` directly.

ESLint enforces this under `src/renderer/**/*.{js,vue}` with the message:

`Use src/renderer/services/nativeApi instead.`

Allowed path:

- renderer component/store/command
- `src/renderer/services/nativeApi/*`
- preload bridge
- explicit IPC handlers in main process

If renderer code needs a new native capability, extend the preload bridge and
the matching facade in `src/renderer/services/nativeApi/` instead of importing
Electron APIs directly.
