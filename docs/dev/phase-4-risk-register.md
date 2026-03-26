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
