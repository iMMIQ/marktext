# Build Instructions

Clone the repository:

```
git clone https://github.com/marktext/marktext.git
```

### Prerequisites

Before you can get started developing, you need set up your build environment:

- Node.js `>=v16` but `<v17` and yarn
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

### Let's build

1. Go to `marktext` folder
2. Install dependencies: `yarn install` or `yarn install --frozen-lockfile`
3. Build MarkText binaries and packages: `yarn run build`
4. MarkText binary is located under `build` folder

Copy the build app to applications folder, or if on Windows run the executable installer.

### Important scripts

```
$ yarn run <script> # or npm run <script>
```

| Script          | Description                                      |
| --------------- | ------------------------------------------------ |
| `build`         | Build MarkText binaries and packages for your OS |
| `build:bin`     | Build MarkText binary for your OS                |
| `dev`           | Build and run MarkText in developer mode         |
| `lint`          | Lint code style                                  |
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

Unit tests now run through Vitest:

- `yarn run unit` and `yarn run unit:vite` both execute `vitest run`

The standalone Muya bundle still uses `src/muya/webpack.config.js`. At runtime, `src/main/config.js` points both BrowserWindow variants at the bundled preload file in `dist/electron/preload.js`, and the renderer consumes native capabilities through `src/renderer/services/nativeApi/*` rather than importing Electron directly.

## Renderer Runtime

The renderer now boots directly with Vue 3, Pinia, and Vue Router. There is no Vuex compatibility bridge in the renderer entrypoint, and the retired `src/renderer/store/*` tree has been replaced by `src/renderer/stores/*`.

Phase 3 verification commands:

- `yarn run lint`
- `./node_modules/.bin/vitest run`
- `yarn run pack`
- `./node_modules/.bin/playwright test -c test/e2e/playwright.config.js test/e2e/launch.spec.js test/e2e/phase-3-smoke.spec.js`
