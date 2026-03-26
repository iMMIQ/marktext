# Version Policy

- Node.js: use the exact major pinned in `.nvmrc` (`24.x` for this phase)
- Electron: stay on the Phase 4 runtime baseline (`41.x`) until a new modernization plan changes it
- Package manager: Yarn classic

## Official Scripts

- `yarn run dev`
- `yarn run rebuild`
- `yarn run pack`
- `yarn run unit`
- `yarn run format`
- `yarn run build`

## Explicit Exception

- `src/muya/webpack.config.js` remains for the standalone Muya bundle and is not part of the desktop runtime path
