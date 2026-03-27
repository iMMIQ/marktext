# High-Risk Tooling Upgrade Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the next small batch of higher-risk dependencies that look compatible with the current architecture, while keeping pack, unit, lint, and local dev runtime behavior intact.

**Architecture:** Keep this round scoped to isolated dependency seams instead of core editor/runtime rewrites. Prefer packages used at the edge of the app or in development-only paths, and stop if an upgrade cascades into major framework migrations.

**Tech Stack:** Yarn 1, Node 24.x, Electron, Vue 3, Pinia, Chokidar, Vite/Vitest

---

### Task 1: Candidate selection and contract review

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Test: `test/unit/specs/phase-5-tooling-contract.spec.js`
- Test: `test/unit/specs/renderer-vue3-deps.spec.js`

- [ ] Re-check `yarn outdated` and confirm the remaining candidates.
- [ ] Review code usage for `electron-devtools-installer`, `pinia`, and `chokidar`.
- [ ] Select only the packages that do not force a broader migration in this round.

### Task 2: Compatibility upgrades

**Files:**
- Modify: `package.json`
- Modify: `yarn.lock`
- Modify: app or tool files touched by the selected packages
- Modify: targeted unit specs only if dependency behavior changes

- [ ] Update the selected package versions in `package.json`.
- [ ] Refresh the lockfile with `yarn install --ignore-scripts`.
- [ ] Repair any import, API, or runtime compatibility issues introduced by the upgrades.

### Task 3: Verification and handoff

**Files:**
- Modify: `docs/dev/BUILD.md` only if workflow caveats changed materially

- [ ] Run `yarn run lint`.
- [ ] Run `yarn run unit`.
- [ ] Run `yarn run pack`.
- [ ] Run a short `yarn run dev` smoke check if runtime-sensitive packages changed.
- [ ] Summarize what remains deferred after this round.
