# `muya-e2e`

Playwright end-to-end test suite for `@muyajs/core`. Real-browser tests that exercise muya's contenteditable surface, floating UI plugins, KaTeX / Mermaid rendering, and public API — the things `happy-dom` unit tests can't cover.

## Layout

```
e2e/
├── host/              # Minimal SUT (system-under-test) page
│   ├── index.html     # #editor + toolbar buttons (#undo, #search, …)
│   └── main.ts        # Registers all UI plugins, exposes window.muya
├── vite.config.ts     # Vite dev server, port 5174 (avoids examples 5173)
├── playwright.config.ts
├── types.d.ts         # Augments Window.muya?: Muya for evaluate callbacks
└── tests/
    ├── fixtures/      # Auto-wait-for-muya-init fixture
    ├── helpers/       # selectors / keyboard / api wrappers
    ├── smoke/         # P0 boot + public API
    ├── typing/        # block creation via typing/slash menu
    ├── inline/        # IFT, emoji, links, shortcuts
    ├── ui/            # slash menu, paragraph-front, image, footnote
    ├── editing/       # undo/redo, selection, search/replace, clipboard
    └── i18n/          # locale switching
```

The host page is intentionally decoupled from `examples/` — that folder is undergoing a parallel refactor, and a self-owned SUT keeps the two workstreams independent.

## Running locally

From the repo root:

```sh
pnpm install                    # one-time, picks up @playwright/test
pnpm e2e                        # full matrix — Chromium + Firefox + WebKit
pnpm e2e:ui                     # Playwright UI mode (recommended for debugging)
pnpm e2e:headed                 # headed Chrome with normal page UI
```

Targeted runs (Phase 2 added the cross-browser matrix):

```sh
pnpm --filter muya-e2e e2e:chromium   # Chromium only (isolated Playwright build)
pnpm --filter muya-e2e e2e:firefox    # Firefox only (bundled binary)
pnpm --filter muya-e2e e2e:webkit     # WebKit only (bundled binary)
```

Playwright uses its isolated Chromium / Firefox / WebKit builds both locally and on CI, so tests never attach renderer processes to a desktop browser session. Install them once with:

```sh
pnpm --filter muya-e2e exec playwright install chromium firefox webkit
# or, to install all three at once:
pnpm e2e:install
```

To diagnose a system-Chrome-specific issue locally:

```sh
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm e2e
```

Inspect failures:

```sh
pnpm --filter muya-e2e exec playwright show-report   # HTML report from the latest run
```

## Large-document benchmark

The benchmark is separate from the regression suite: it builds the E2E host as
a production bundle, runs Chromium with one worker, does not affect pull-request
CI, and writes machine-readable results to
`test-results/large-document-benchmark.json`.

The standard profile generates an exact 800 KiB mixed-Markdown document in the
browser and runs it three times. It records synchronous `setContent`, the first
double-`requestAnimationFrame` paint opportunity, direct middle/bottom jumps,
middle-viewport text editing, cursor movement, Backspace, Enter, undo/redo,
full-document serialization, long tasks, mounted block and DOM bounds, and
Chromium JavaScript heap growth over the empty-host baseline. Middle editing
samples run GC before starting their key-to-paint timer so earlier screenshots
and assertions cannot move a browser collection pause into the next action.
The editing path also asserts that the source-backed sparse model remains
active throughout the history round trip.

```sh
pnpm -C packages/muya/e2e benchmark
```

The 128 MiB stress profile is deliberately opt-in. It runs once and keeps the
same bounded viewport-rendering and direct middle/bottom jump contract as the
standard profile:

```sh
MUYA_BENCHMARK_PROFILE=stress pnpm -C packages/muya/e2e benchmark
```

Every setting can be overridden without changing a checked-in fixture:

```sh
MUYA_BENCHMARK_BYTES=1048576 \
MUYA_BENCHMARK_RUNS=5 \
MUYA_BENCHMARK_DIRECT_JUMPS=1 \
MUYA_BENCHMARK_OUTPUT=test-results/custom-benchmark.json \
pnpm -C packages/muya/e2e benchmark
```

Screenshots and the JSON report are also attached to
`playwright-report-benchmark/index.html`.
Performance numbers are comparable only when the report's browser, hardware,
platform, viewport, build mode, and source revision match.
The default three runs are intended for development comparisons; use at least
20 runs before treating the reported p95 as a release-quality percentile.

## Conventions

- **`page.keyboard.type` with `delay: 0` drops characters.** muya's content-change pipeline re-renders synchronously per keystroke; Playwright's default 0ms inter-key delay can outrun snabbdom patches. Use `slowType()` from `tests/helpers/keyboard.ts` (30ms per char) for any typing > 4 chars.
- **Float plugins hide via `opacity: 0`, not `display: none`.** `expect(...).toBeHidden()` won't work — assert on computed opacity or rely on a subsequent action to settle state.
- **`getMarkdown()` reads state asynchronously after the last keystroke.** Use `expect(domNode).toContainText(...)` as a sync barrier before reading markdown.
- **No `(window as any).muya`.** `types.d.ts` declares `Window.muya?: Muya`; the project bans `any` (`ts/no-explicit-any: 'error'`), so explicit casts will fail lint.
- **One global E2E sandbox per workspace.** The host pre-registers every UI plugin. Specs that want a clean slate call `window.muya!.setContent('')` in a `before*` or first step.

## Adding a new spec

1. Pick a folder by category (`tests/<category>/your-feature.spec.ts`).
2. `import { test, expect } from '../fixtures/muya'` — gives you a Page with `window.muya` already initialised.
3. Use selectors from `tests/helpers/selectors.ts` (or extend it). Don't hard-code `.mu-*` classes inside spec files.
4. Bias toward asserting via the public API (`getMarkdown` / `getState` / `getTOC`) over DOM regex matching — markdown serialization is deterministic where snabbdom output can shift.

## Roadmap

This is **Phase 1 — P0 smoke + key interaction skeleton**. See [BACKLOG.md](./BACKLOG.md) for the full 4-phase plan.
