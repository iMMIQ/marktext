# High-Risk Tooling Upgrade Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the tightly coupled Vite toolchain (`vite`, `@vitejs/plugin-vue`, `vitest`) to the current major line and keep pack, unit, and lint workflows working in this repo.

**Architecture:** Treat the Vite build pipeline and Vitest harness as one migration unit because they share plugin loading, config shape, transform behavior, and jsdom execution. Keep the migration scoped to build/test tooling only; do not bundle unrelated runtime major upgrades such as CodeMirror 6, Marked 17, Mermaid 11, or the ESLint 10 stack into this round.

**Tech Stack:** Yarn 1, Node 24.x, Vite, Vitest, Vue 3, Electron, jsdom

---

### Task 1: Baseline and dependency contract update

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Test: `test/unit/specs/renderer-vue3-deps.spec.js`

- [ ] Capture the current `yarn outdated` state for the Vite toolchain.
- [ ] Update only `vite`, `@vitejs/plugin-vue`, and `vitest` in `package.json`.
- [ ] Refresh `yarn.lock` with `yarn install --ignore-scripts`.
- [ ] Re-run dependency contract tests or full unit coverage if the contract tests are insufficient.

### Task 2: Vite build configuration compatibility

**Files:**
- Modify: `vite.main.config.js`
- Modify: `vite.preload.config.js`
- Modify: `vite.renderer.config.js`
- Modify: `tools/vite/marktextEnvironment.js`
- Test: `test/unit/specs/vite-build-config.spec.js`

- [ ] Compare existing config usage with the official Vite migration guides for the skipped majors.
- [ ] Update config or helper code only where the new major requires it.
- [ ] Run `yarn run pack` to validate the build outputs.

### Task 3: Vitest harness compatibility

**Files:**
- Modify: `vitest.config.js`
- Modify: `test/unit/setup.js`
- Modify: targeted failing specs only if the new runtime changes behavior
- Test: `test/unit/specs/renderer-boundary-eslint.spec.js`
- Test: `test/unit/specs/renderer-bridge.spec.js`

- [ ] Compare existing Vitest config with the official Vitest migration guide.
- [ ] Update config shape, jsdom compatibility, or test helpers only where the new major requires it.
- [ ] Re-run `yarn run unit` and fix migration regressions before touching anything else.

### Task 4: Verification and handoff

**Files:**
- Modify: `docs/dev/BUILD.md` only if commands or caveats changed materially

- [ ] Run `yarn run lint`.
- [ ] Run `yarn run unit`.
- [ ] Run `yarn run pack`.
- [ ] Summarize remaining high-risk upgrade items that were intentionally deferred.
