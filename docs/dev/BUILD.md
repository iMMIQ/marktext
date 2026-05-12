# Build Instructions

Clone the repository:

```
git clone https://github.com/marktext/marktext.git
```

### Prerequisites

Before you can get started developing, you need set up your build environment:

- Node.js `24.x` (the repo pins `24` in `.nvmrc`) and Bun `1.3.x`
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
- `bun run rebuild` before native packaging
- `bun run rebuild:force` to invalidate the native rebuild cache
- `bun run pack` to build `dist/electron`
- `bun run unit` for the unit suite
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
| `dev`           | Build and run MarkText in developer mode         |
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

`bun run dev` starts `tools/dev/bun-dev-runner.mjs`, which rebuilds the Bun bundles, serves `dist/electron` on `127.0.0.1:9091`, and restarts Electron when the app bundles change.

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

- `bun run format`
- `./node_modules/.bin/vitest run`
- `bun run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js`
