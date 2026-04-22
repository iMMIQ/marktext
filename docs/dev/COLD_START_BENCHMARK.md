# Cold Start Benchmark

This benchmark measures MarkText cold startup and breaks the time down into main milestones so we can localize startup bottlenecks.

Cold start completion is defined as: **after launch, the benchmark can type one character into the editor paragraph node and the content changes**.

## Prerequisites

Build the app entrypoint first:

```sh
bun run pack
```

## Run

Default (20 measured runs + 3 warmup runs):

```sh
bun run benchmark:cold-start
```

Customize run count and timeout:

```sh
bun run benchmark:cold-start --runs 30 --warmup 5 --timeout 45000
```

Disable JSON report output:

```sh
bun run benchmark:cold-start --no-out
```

Write report to a custom file:

```sh
bun run benchmark:cold-start --out test-results/cold-start-linux.json
```

## Output Metrics

The benchmark records these startup phases:

- `main:entry -> app:ready`
- `app:ready -> window:create-start`
- `window:create-start -> browser-window-created`
- `browser-window-created -> did-finish-load`
- `did-finish-load -> renderer-ready`
- `did-finish-load -> input-ready` (typing one character succeeds)
- `renderer-ready -> input-ready`
- `renderer-ready -> bootstrap-renderer`
- `main:entry -> input-ready` (cold-start KPI)
- `main:entry -> renderer-ready` (secondary KPI)

Summary output includes `p50`, `p95`, `mean`, `min`, and `max`.

## Optimization Workflow

1. Establish a baseline report from your current branch.
2. Implement one startup change at a time.
3. Re-run the same benchmark command on the same machine conditions.
4. Compare `main:entry -> input-ready` and the slowest segment p50/p95.
5. If a change regresses p95, revert or rework it before moving on.

## Notes

- Each run uses a fresh temporary `--user-data-dir` to keep startup cold.
- `--disable-gpu` is enabled by default for lower variance.
- Benchmark instrumentation is disabled unless `MARKTEXT_STARTUP_BENCHMARK=1`.
