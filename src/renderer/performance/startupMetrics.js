const MAX_EVENTS = 512

const roundMilliseconds = value => Math.round(value * 1000) / 1000

const isBenchmarkEnabled = () => {
  try {
    const runtimeFlag = globalThis.process?.env?.MARKTEXT_STARTUP_BENCHMARK === '1'
    const urlFlag = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('benchmark') === '1'
    return runtimeFlag || urlFlag
  } catch (_) {
    return false
  }
}

let state = null

if (isBenchmarkEnabled()) {
  const monotonicMs = performance.now()
  state = {
    enabled: true,
    startedEpochMs: Date.now(),
    startedMonotonicMs: monotonicMs,
    events: []
  }
  globalThis.__MARKTEXT_RENDERER_STARTUP_METRICS__ = state
}

const markRendererStartupPhase = (phase, details = {}) => {
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
}

const getRendererStartupMetricsSnapshot = () => {
  if (!state) {
    return null
  }

  return {
    ...state,
    events: [...state.events]
  }
}

export {
  getRendererStartupMetricsSnapshot,
  markRendererStartupPhase
}
