# Build Instructions

Clone the repository:

```
git clone https://github.com/marktext/marktext.git
```

### Prerequisites

Before you can get started developing, you need set up your build environment:

- Node.js `24.x` (the repo pins `24` in `.nvmrc`) and Yarn classic
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

- `yarn run dev` for local development
- `yarn run rebuild` before native packaging
- `yarn run rebuild:force` to invalidate the native rebuild cache
- `yarn run pack` to build `dist/electron`
- `yarn run unit` for the unit suite
- `yarn run format` to auto-fix formatting and lint issues
- `yarn run build` to package the app

See [VERSION_POLICY.md](VERSION_POLICY.md) for the maintained baseline.

### Build And Package

1. Go to `marktext` folder
2. Install dependencies: `yarn install` or `yarn install --frozen-lockfile`
3. Rebuild native modules for the current Electron target: `yarn run rebuild`
4. Build the runtime bundle: `yarn run pack`
5. Build MarkText binaries and packages: `yarn run build`
6. MarkText binary is located under `build` folder

Copy the build app to applications folder, or if on Windows run the executable installer.

### Additional Scripts

```
$ yarn run <script>
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

The desktop app now uses a Vite-based runtime pipeline with three entry points:

- `src/main/index.js` is bundled by `vite.main.config.js` to `dist/electron/main.js`.
- `src/main/preload/index.js` is bundled by `vite.preload.config.js` to `dist/electron/preload.js`.
- `src/renderer/main.js` is bundled by `vite.renderer.config.js`, with `src/renderer/index.html` emitted to `dist/electron/index.html` alongside the renderer assets.

`yarn run dev` starts `tools/dev/vite-dev-runner.js`, which watches the main/preload bundles, serves the renderer with Vite, and restarts Electron when the app bundles change.

`yarn run pack` is the easiest way to rebuild the full runtime boundary:

- `yarn run pack:main` emits both `dist/electron/main.js` and `dist/electron/preload.js`
- `yarn run pack:renderer` emits `dist/electron/index.html` and the renderer assets

Before packaging on any platform, run:

1. `yarn install`
2. `yarn run rebuild`
3. `yarn run pack`
4. `yarn run build`

`yarn run rebuild` now skips work when the Electron ABI, platform, arch, Node version, and rebuilt native module versions have not changed. Use `yarn run rebuild:force` after toolchain changes or whenever you want to invalidate that cache manually.

Unit tests now run through Vitest with `yarn run unit`.

The standalone Muya bundle still uses `src/muya/webpack.config.js`. At runtime, `src/main/config.js` points both BrowserWindow variants at the bundled preload file in `dist/electron/preload.js`, and the renderer consumes native capabilities through `src/renderer/services/nativeApi/*` rather than importing Electron directly.

## Renderer Runtime

The renderer now boots directly with Vue 3, Pinia, and Vue Router. There is no Vuex compatibility bridge in the renderer entrypoint, and the retired `src/renderer/store/*` tree has been replaced by `src/renderer/stores/*`.

Recommended verification commands for the current baseline:

- `yarn run format`
- `./node_modules/.bin/vitest run`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js`
