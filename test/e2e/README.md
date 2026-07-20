# End-to-end tests

The suite follows the user stories in `docs/quality/USER_STORY_E2E.md`.

## Run

```sh
bun run e2e
bun run e2e test/e2e/stories/01-document-lifecycle.spec.js
```

On Linux, including CI, the runner requires `bwrap`, `dbus-run-session`, and `Xvfb`. It hides the host X11, Wayland, and desktop portal sockets, isolates abstract Unix sockets with a private network namespace, and starts Electron on a private display. The suite fails closed when isolation is unavailable; there is no active-desktop or `CI` escape hatch.

Run `bun run e2e:preflight` to validate those boundaries without starting Electron or Playwright.

A dedicated Electron test entrypoint blocks every native file, message, certificate, and print dialog before MarkText's main process loads. Individual stories replace only the boundary they exercise with an in-process stub, and teardown destroys test windows without entering MarkText's unsaved-document close flow.

## Structure

- `fixtures.js`: lifecycle, temporary workspace, renderer error capture, and screenshots.
- `stories/*.spec.js`: user-visible workflows named with the story ID.
- `contracts/*.spec.js`: narrow runtime/build/security contracts that are not user journeys.
- `data/`: checked-in hostile or representative documents.

Screenshots are written into the Playwright test output directory and attached to the HTML report. Tests assert state and side effects before capture; screenshots are reviewed evidence, not the only assertion.

Each acceptance criterion is tagged as `US-xx.AC-xx` in the quality document and exactly one story test title. Keep implementation-only checks such as worker protocol details and bridge shape in `contracts/` or unit tests.
