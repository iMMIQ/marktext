import { performance } from 'perf_hooks'

const MAX_EVENTS = 512
const ENABLE_BENCHMARK = process.env.MARKTEXT_STARTUP_BENCHMARK === '1'
const ENABLE_STDOUT = process.env.MARKTEXT_STARTUP_BENCHMARK_STDOUT === '1'

const roundMilliseconds = value => Math.round(value * 1000) / 1000

let state = null
if (ENABLE_BENCHMARK) {
  state = {
    enabled: true,
    pid: process.pid,
    platform: process.platform,
    startedEpochMs: Date.now(),
    startedMonotonicMs: performance.now(),
    events: []
  }
}

if (state) {
  globalThis.__MARKTEXT_STARTUP_METRICS__ = state
}

const markStartupPhase = (phase, details = {}) => {
  if (!state || !phase) {
    return
  }

  const monotonicMs = performance.now()
  const event = {
    phase,
    monotonicMs: roundMilliseconds(monotonicMs),
    elapsedMs: roundMilliseconds(monotonicMs - state.startedMonotonicMs),
    wallClockMs: Date.now()
  }

  if (details && typeof details === 'object') {
    for (const [key, value] of Object.entries(details)) {
      if (typeof value !== 'undefined') {
        event[key] = value
      }
    }
  }

  state.events.push(event)
  if (state.events.length > MAX_EVENTS) {
    state.events.shift()
  }

  if (ENABLE_STDOUT) {
    process.stdout.write(`[marktext-startup] ${JSON.stringify(event)}\n`)
  }
}

const getStartupMetricsSnapshot = () => {
  if (!state) {
    return null
  }

  return {
    ...state,
    events: [...state.events]
  }
}

const isStartupBenchmarkEnabled = () => !!state

export { getStartupMetricsSnapshot, isStartupBenchmarkEnabled, markStartupPhase }
