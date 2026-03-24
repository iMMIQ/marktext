# Renderer Boundary

Renderer code must not import `electron` or `@electron/remote` directly.

Allowed path:

- renderer component/store/command
- `src/renderer/services/nativeApi/*`
- preload bridge
- explicit IPC handlers in main process
