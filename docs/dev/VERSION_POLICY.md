# Version Policy

- Node.js: use the exact major pinned in `.nvmrc` (`24.x` for this phase)
- Electron: stay on the Phase 4 runtime baseline (`41.x`) until a new modernization plan changes it
- Package manager: use the exact Bun version pinned by `packageManager` in `package.json` (`1.3.14`)

## Supply-chain waiting period

New package and GitHub Action versions must have been public for at least seven full days before they are merged. Package changes are checked from `bun.lock` with `bun run check:dependency-age`. Workflow actions must use immutable 40-character commit SHAs with the audited release tag in a comment; floating tags and `@latest` are not accepted.

## Official Scripts

- `bun run dev`
- `bun run doctor`
- `bun run check`
- `bun run rebuild`
- `bun run pack`
- `bun run unit`
- `bun run format`
- `bun run build`
- `bun run check:dependency-age`

## Explicit Exception

- `src/muya/webpack.config.js` remains for the standalone Muya bundle and is not part of the desktop runtime path
