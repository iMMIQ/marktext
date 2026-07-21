# Build Instructions

Clone the repository:

```
git clone https://github.com/marktext/marktext.git
```

### Prerequisites

Before you can get started developing, you need set up your build environment:

- Node.js `24.x` (the repo pins `24` in `.nvmrc`) and the exact Bun version in `package.json`
- Python `>=v3.6` for node-gyp
- C++ compiler and development tools
- Build is supported on Linux, macOS and Windows

**Additional development dependencies on Linux:**

- libX11 (with headers)
- libxkbfile (with headers)
- libsecret (with headers)
- libfontconfig (with headers)

On Debian-based Linux: `sudo apt-get install libx11-dev libxkbfile-dev libsecret-1-dev libfontconfig-dev`

On Red Hat-based Linux: `sudo dnf install libX11-devel libxkbfile-devel libsecret-devel fontconfig-devel`

**Additional development dependencies on Windows:**

- Windows 10 SDK (only needed before Windows 10)
- Visual Studio 2019 (preferred)

## Official Developer Commands

- `bun run dev` for local development
- `bun run doctor` to validate the local toolchain and E2E prerequisites
- `bun run rebuild` before native packaging
- `bun run rebuild:force` to invalidate the native rebuild cache
- `bun run pack` to build `dist/electron`
- `bun run unit` for the unit suite
- `bun run check` for lint, licenses, unit, CommonMark, and GFM checks
- `bun run format` to auto-fix formatting and lint issues
- `bun run build` to package the app

See [VERSION_POLICY.md](VERSION_POLICY.md) for the maintained baseline.

### Build And Package

1. Go to `marktext` folder
2. Install dependencies: `bun install` or `bun install --frozen-lockfile`
3. Rebuild native modules for the current Electron target: `bun run rebuild`
4. Build the runtime bundle: `bun run pack`
5. Build MarkText binaries and packages: `bun run build`
6. MarkText binary is located under `build` folder

Copy the build app to applications folder, or if on Windows run the executable installer.

### Additional Scripts

```
$ bun run <script>
```

| Script          | Description                                      |
| --------------- | ------------------------------------------------ |
| `build`         | Build MarkText binaries and packages for your OS |
| `build:bin`     | Build MarkText binary for your OS                |
| `check`         | Run non-UI quality checks                        |
| `dev`           | Build and run MarkText in developer mode         |
| `doctor`        | Validate the development and E2E environment     |
| `lint`          | Lint code style                                  |
| `rebuild`       | Rebuild native modules for the current Electron runtime |
| `test`          | Run the unit and end-to-end suites               |
| `unit`          | Run Vitest unit tests                            |

For more scripts please see `package.json`.

## Build Entry Points

The desktop app now uses Bun-native bundling with three entry points:

- `src/main/index.js` is bundled by `tools/build/bun-pack.mjs` to `dist/electron/main.js`.
- `src/main/preload/index.js` is bundled by `tools/build/bun-pack.mjs` to `dist/electron/preload.js`.
- `src/renderer/index.html` is bundled by `tools/build/bun-pack.mjs` to `dist/electron/index.html` and renderer assets, with Vue SFCs transformed through the shared `@vue/compiler-sfc` helper.

`bun run dev` starts `tools/dev/bun-dev-runner.mjs` and serves `dist/electron` on a free local port. Main and preload changes rebuild their own entry and restart Electron. Renderer and Muya changes rebuild only their affected entries and refresh the existing window after a successful build.

`bun run pack` is the easiest way to rebuild the full runtime boundary:

- `bun run pack:runtime` emits `dist/electron/main.js`, `dist/electron/preload.js`, and the renderer bundle
- `bun run pack:main` emits only `dist/electron/main.js` and `dist/electron/preload.js`
- `bun run pack:renderer` emits only `dist/electron/index.html` and the renderer assets

Before packaging on any platform, run:

1. `bun install`
2. `bun run rebuild`
3. `bun run pack`
4. `bun run build`

`bun run rebuild` now skips work when the Electron ABI, platform, arch, Node version, and rebuilt native module versions have not changed. Use `bun run rebuild:force` after toolchain changes or whenever you want to invalidate that cache manually.

Unit tests now run through Vitest with `bun run unit`.

The standalone Muya bundle still uses `src/muya/webpack.config.js`. At runtime, `src/main/config.js` points both BrowserWindow variants at the bundled preload file in `dist/electron/preload.js`, and the renderer consumes native capabilities through `src/renderer/services/nativeApi/*` rather than importing Electron directly.

## Renderer Runtime

The renderer now boots directly with Vue 3, Pinia, and Vue Router. There is no Vuex compatibility bridge in the renderer entrypoint, and the retired `src/renderer/store/*` tree has been replaced by `src/renderer/stores/*`.

Recommended verification commands for the current baseline:

- `bun run doctor`
- `bun run check`
- `bun run pack`
- `bun run e2e:runtime`

## Continuous integration

The main quality gate runs on Linux and builds the native modules and application bundle once. Unit, CommonMark, GFM, and desktop-isolated E2E tests share that output; the packaging smoke test uses `package:dir` without rebuilding. CI caches Bun and Electron downloads, never `node_modules`, and always installs from the frozen lockfile.

GitHub Actions are pinned to immutable commits. Dependency and action updates follow the seven-day waiting period in [VERSION_POLICY.md](VERSION_POLICY.md). Release candidates, checksums, source maps, and the remaining platform-signing boundary are documented in [RELEASE.md](RELEASE.md).
