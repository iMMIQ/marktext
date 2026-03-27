import os from 'os'
import path from 'path'
import process from 'process'
import { performance } from 'perf_hooks'
import fs from 'fs/promises'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright')

const electronExecutablePath = require('electron')
const MAIN_ENTRYPOINT = 'dist/electron/main.js'
const REQUIRED_PHASE = 'window:renderer-ready-ipc'
const POLL_INTERVAL_MS = 100
const EDITOR_PARAGRAPH_SELECTOR = '.ag-paragraph-content'
const INPUT_PROBE_CHARACTER = 'x'
const DEFAULT_OPTIONS = {
  runs: 20,
  warmup: 3,
  timeoutMs: 30000,
  outFile: path.join('test-results', 'cold-start-benchmark.json'),
  disableGpu: true,
  keepUserData: false
}

const METRIC_DEFINITIONS = [
  { key: 'totalMainToInputReady', label: 'main:entry -> input-ready' },
  { key: 'totalMainToRendererReady', label: 'main:entry -> renderer-ready' },
  { key: 'totalMainToBootstrap', label: 'main:entry -> bootstrap-renderer' },
  { key: 'mainToAppReady', label: 'main:entry -> app:ready' },
  { key: 'appReadyToWindowCreate', label: 'app:ready -> window:create-start' },
  { key: 'windowCreateToBrowserCreated', label: 'window:create-start -> browser-window-created' },
  { key: 'browserCreatedToDidFinishLoad', label: 'browser-window-created -> did-finish-load' },
  { key: 'didFinishLoadToRendererReady', label: 'did-finish-load -> renderer-ready' },
  { key: 'didFinishLoadToInputReady', label: 'did-finish-load -> input-ready' },
  { key: 'rendererReadyToInputReady', label: 'renderer-ready -> input-ready' },
  { key: 'rendererReadyToBootstrap', label: 'renderer-ready -> bootstrap-renderer' },
  { key: 'rendererModuleToMountComplete', label: 'renderer:module-evaluated -> mount-complete' },
  { key: 'rendererImportsToNotifyReady', label: 'renderer:imports-complete -> notify-ready' },
  { key: 'rendererNotifyReadyToMountComplete', label: 'renderer:notify-ready -> mount-complete' },
  { key: 'rendererMountCompleteToInputReady', label: 'renderer:mount-complete -> input-ready' },
  { key: 'editorInitToPluginsRegistered', label: 'editor:init-start -> plugins-registered' },
  { key: 'editorPluginsToMuyaCreated', label: 'editor:plugins-registered -> muya-created' },
  { key: 'editorMuyaToInitComplete', label: 'editor:muya-created -> init-complete' },
  { key: 'editorInitToInitComplete', label: 'editor:init-start -> init-complete' },
  { key: 'editorInitCompleteToInputReady', label: 'editor:init-complete -> input-ready' }
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value)
const round = value => Math.round(value * 1000) / 1000
const REMOVE_RETRY_DELAYS_MS = [50, 100, 200, 400, 800]

const percentile = (sorted, p) => {
  if (!sorted.length) {
    return null
  }

  if (sorted.length === 1) {
    return sorted[0]
  }

  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) {
    return sorted[low]
  }
  const ratio = index - low
  return sorted[low] + ((sorted[high] - sorted[low]) * ratio)
}

const summarizeMetric = values => {
  const filtered = values.filter(isFiniteNumber).sort((a, b) => a - b)
  if (!filtered.length) {
    return { n: 0 }
  }

  const mean = filtered.reduce((acc, value) => acc + value, 0) / filtered.length
  const variance = filtered.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / filtered.length

  return {
    n: filtered.length,
    min: round(filtered[0]),
    p50: round(percentile(filtered, 0.5)),
    p90: round(percentile(filtered, 0.9)),
    p95: round(percentile(filtered, 0.95)),
    mean: round(mean),
    max: round(filtered[filtered.length - 1]),
    stdev: round(Math.sqrt(variance))
  }
}

const getFirstPhaseElapsed = (events, phase) => {
  if (!Array.isArray(events)) {
    return null
  }

  const event = events.find(item => item && item.phase === phase && isFiniteNumber(item.elapsedMs))
  return event ? event.elapsedMs : null
}

const delta = (start, end) => {
  if (!isFiniteNumber(start) || !isFiniteNumber(end) || end < start) {
    return null
  }
  return round(end - start)
}

const getFirstParagraphLength = async page => {
  return page.evaluate(selector => {
    const paragraph = document.querySelector(selector)
    if (!paragraph) {
      return null
    }
    const value = paragraph.textContent
    return typeof value === 'string' ? value.length : 0
  }, EDITOR_PARAGRAPH_SELECTOR)
}

const waitForLengthIncrease = async (page, initialLength, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const currentLength = await getFirstParagraphLength(page)
    if (typeof currentLength === 'number' && currentLength >= initialLength + 1) {
      return true
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return false
}

const getRendererMetricsSnapshot = async page => {
  return page.evaluate(() => {
    const source = globalThis.__MARKTEXT_RENDERER_STARTUP_METRICS__
    if (!source || !Array.isArray(source.events)) {
      return null
    }
    return {
      ...source,
      events: source.events.map(event => ({ ...event }))
    }
  }).catch(() => null)
}

const measureInputReadyElapsed = async (app, page, timeoutMs) => {
  await page.waitForSelector(EDITOR_PARAGRAPH_SELECTOR, { state: 'visible', timeout: timeoutMs })
  const initialLength = await getFirstParagraphLength(page)
  if (!Number.isInteger(initialLength)) {
    throw new Error(`Cannot read paragraph length from selector "${EDITOR_PARAGRAPH_SELECTOR}".`)
  }

  await page.click(EDITOR_PARAGRAPH_SELECTOR, { timeout: timeoutMs })
  await page.keyboard.type(INPUT_PROBE_CHARACTER)

  const typed = await waitForLengthIncrease(page, initialLength, timeoutMs)
  if (!typed) {
    throw new Error(`Typing probe character "${INPUT_PROBE_CHARACTER}" was not reflected in editor content.`)
  }

  const mainElapsedMs = await app.evaluate(() => {
    const metrics = globalThis.__MARKTEXT_STARTUP_METRICS__
    if (!metrics || typeof metrics.startedMonotonicMs !== 'number') {
      return null
    }
    return Math.round((performance.now() - metrics.startedMonotonicMs) * 1000) / 1000
  })

  const rendererElapsedMs = await page.evaluate(() => {
    const metrics = globalThis.__MARKTEXT_RENDERER_STARTUP_METRICS__
    if (!metrics || typeof metrics.startedMonotonicMs !== 'number') {
      return null
    }
    return Math.round((performance.now() - metrics.startedMonotonicMs) * 1000) / 1000
  }).catch(() => null)

  if (!isFiniteNumber(mainElapsedMs)) {
    throw new Error('Cannot compute input-ready elapsed time from startup metrics state.')
  }

  return {
    mainElapsedMs,
    rendererElapsedMs
  }
}

const extractMetrics = (mainSnapshot, rendererSnapshot, inputReady) => {
  const mainEvents = Array.isArray(mainSnapshot?.events) ? mainSnapshot.events : []
  const rendererEvents = Array.isArray(rendererSnapshot?.events) ? rendererSnapshot.events : []
  const mainPhase = name => getFirstPhaseElapsed(mainEvents, name)
  const rendererPhase = name => getFirstPhaseElapsed(rendererEvents, name)

  const tMainEntry = mainPhase('main:entry')
  const tAppReady = mainPhase('app:ready')
  const tWindowCreateStart = mainPhase('window:create-start')
  const tBrowserCreated = mainPhase('window:browser-window-created')
  const tDidFinishLoad = mainPhase('window:did-finish-load')
  const tRendererReady = mainPhase('window:renderer-ready-ipc')
  const tBootstrap = mainPhase('window:bootstrap-renderer')
  const tInputReady = inputReady.mainElapsedMs
  const tRendererInputReady = inputReady.rendererElapsedMs
  const tRendererModuleEvaluated = rendererPhase('renderer:module-evaluated')
  const tRendererImportsComplete = rendererPhase('renderer:imports-complete')
  const tRendererNotifyReady = rendererPhase('renderer:notify-ready')
  const tRendererMountComplete = rendererPhase('renderer:mount-complete')
  const tEditorInitStart = rendererPhase('editor:init-start')
  const tEditorPluginsRegistered = rendererPhase('editor:plugins-registered')
  const tEditorMuyaCreated = rendererPhase('editor:muya-created')
  const tEditorInitComplete = rendererPhase('editor:init-complete')

  return {
    phases: {
      'main:entry': tMainEntry,
      'app:ready': tAppReady,
      'window:create-start': tWindowCreateStart,
      'window:browser-window-created': tBrowserCreated,
      'window:did-finish-load': tDidFinishLoad,
      'window:renderer-ready-ipc': tRendererReady,
      'window:bootstrap-renderer': tBootstrap,
      'synthetic:input-ready': tInputReady,
      'renderer:module-evaluated': tRendererModuleEvaluated,
      'renderer:imports-complete': tRendererImportsComplete,
      'renderer:notify-ready': tRendererNotifyReady,
      'renderer:mount-complete': tRendererMountComplete,
      'editor:init-start': tEditorInitStart,
      'editor:plugins-registered': tEditorPluginsRegistered,
      'editor:muya-created': tEditorMuyaCreated,
      'editor:init-complete': tEditorInitComplete,
      'synthetic:renderer-input-ready': tRendererInputReady
    },
    totalMainToInputReady: delta(tMainEntry, tInputReady),
    totalMainToRendererReady: delta(tMainEntry, tRendererReady),
    totalMainToBootstrap: delta(tMainEntry, tBootstrap),
    mainToAppReady: delta(tMainEntry, tAppReady),
    appReadyToWindowCreate: delta(tAppReady, tWindowCreateStart),
    windowCreateToBrowserCreated: delta(tWindowCreateStart, tBrowserCreated),
    browserCreatedToDidFinishLoad: delta(tBrowserCreated, tDidFinishLoad),
    didFinishLoadToRendererReady: delta(tDidFinishLoad, tRendererReady),
    didFinishLoadToInputReady: delta(tDidFinishLoad, tInputReady),
    rendererReadyToInputReady: delta(tRendererReady, tInputReady),
    rendererReadyToBootstrap: delta(tRendererReady, tBootstrap),
    rendererModuleToMountComplete: delta(tRendererModuleEvaluated, tRendererMountComplete),
    rendererImportsToNotifyReady: delta(tRendererImportsComplete, tRendererNotifyReady),
    rendererNotifyReadyToMountComplete: delta(tRendererNotifyReady, tRendererMountComplete),
    rendererMountCompleteToInputReady: delta(tRendererMountComplete, tRendererInputReady),
    editorInitToPluginsRegistered: delta(tEditorInitStart, tEditorPluginsRegistered),
    editorPluginsToMuyaCreated: delta(tEditorPluginsRegistered, tEditorMuyaCreated),
    editorMuyaToInitComplete: delta(tEditorMuyaCreated, tEditorInitComplete),
    editorInitToInitComplete: delta(tEditorInitStart, tEditorInitComplete),
    editorInitCompleteToInputReady: delta(tEditorInitComplete, tRendererInputReady)
  }
}

const formatMilliseconds = value => (isFiniteNumber(value) ? `${value.toFixed(1)} ms` : 'n/a')

const parsePositiveInteger = (value, fieldName) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be an integer >= 0.`)
  }
  return parsed
}

const parseArgs = argv => {
  const options = { ...DEFAULT_OPTIONS }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--runs') {
      options.runs = parsePositiveInteger(argv[++i], '--runs')
    } else if (arg === '--warmup') {
      options.warmup = parsePositiveInteger(argv[++i], '--warmup')
    } else if (arg === '--timeout') {
      options.timeoutMs = parsePositiveInteger(argv[++i], '--timeout')
    } else if (arg === '--out') {
      options.outFile = argv[++i]
    } else if (arg === '--no-out') {
      options.outFile = null
    } else if (arg === '--no-disable-gpu') {
      options.disableGpu = false
    } else if (arg === '--keep-user-data') {
      options.keepUserData = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (options.runs === 0) {
    throw new Error('--runs must be >= 1.')
  }

  return options
}

const closeElectronApp = async app => {
  if (!app) {
    return
  }

  try {
    await app.evaluate(({ app, BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.destroy()
        } catch {}
      }
      app.exit(0)
    })
  } catch {}
}

const removeDirectoryWithRetry = async directory => {
  let lastError = null
  for (const delayMs of [0, ...REMOVE_RETRY_DELAYS_MS]) {
    if (delayMs > 0) {
      await sleep(delayMs)
    }
    try {
      await fs.rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw lastError
  }
}

const waitForMetrics = async (app, timeoutMs) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snapshot = await app.evaluate(() => {
      const source = globalThis.__MARKTEXT_STARTUP_METRICS__
      if (!source || !Array.isArray(source.events)) {
        return null
      }
      return {
        ...source,
        events: source.events.map(event => ({ ...event }))
      }
    })

    if (snapshot?.events?.some(event => event.phase === REQUIRED_PHASE)) {
      return snapshot
    }

    await sleep(POLL_INTERVAL_MS)
  }

  const snapshot = await app.evaluate(() => {
    const source = globalThis.__MARKTEXT_STARTUP_METRICS__
    if (!source || !Array.isArray(source.events)) {
      return null
    }
    return {
      ...source,
      events: source.events.map(event => ({ ...event }))
    }
  }).catch(() => null)

  const phaseList = snapshot?.events?.map(event => event.phase).join(', ') || '(no phases captured)'
  throw new Error(`Timed out waiting for "${REQUIRED_PHASE}". Captured phases: ${phaseList}`)
}

const runIteration = async (iterationIndex, options) => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktext-cold-start-'))
  let app = null

  try {
    const args = [MAIN_ENTRYPOINT, '--user-data-dir', userDataDir]
    if (options.disableGpu) {
      args.push('--disable-gpu')
    }

    app = await electron.launch({
      executablePath: electronExecutablePath,
      args,
      timeout: options.timeoutMs,
      env: {
        ...process.env,
        MARKTEXT_STARTUP_BENCHMARK: '1',
        MARKTEXT_EXIT_ON_ERROR: '1',
        MARKTEXT_ERROR_INTERACTION: '1'
      }
    })

    const page = await app.firstWindow()
    const mainSnapshot = await waitForMetrics(app, options.timeoutMs)
    const inputReady = await measureInputReadyElapsed(app, page, options.timeoutMs)
    const rendererSnapshot = await getRendererMetricsSnapshot(page)
    const metrics = extractMetrics(mainSnapshot, rendererSnapshot, inputReady)

    return { ok: true, iterationIndex, metrics, mainSnapshot, rendererSnapshot }
  } catch (error) {
    return {
      ok: false,
      iterationIndex,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await closeElectronApp(app)

    if (!options.keepUserData) {
      await removeDirectoryWithRetry(userDataDir)
    }
  }
}

const printUsage = () => {
  console.log('Usage: node tools/perf/cold-start-benchmark.mjs [options]')
  console.log('')
  console.log('Options:')
  console.log('  --runs <N>            Measured runs (default: 20)')
  console.log('  --warmup <N>          Warmup runs not included in stats (default: 3)')
  console.log('  --timeout <ms>        Per-run timeout in milliseconds (default: 30000)')
  console.log('  --out <path>          Write JSON report (default: test-results/cold-start-benchmark.json)')
  console.log('  --no-out              Do not write JSON report')
  console.log('  --no-disable-gpu      Do not pass --disable-gpu to MarkText')
  console.log('  --keep-user-data      Keep per-run temp user-data directories')
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printUsage()
    return
  }

  const totalRuns = options.warmup + options.runs
  const measured = []
  const failures = []

  console.log(`Benchmarking cold start with ${options.runs} measured run(s) + ${options.warmup} warmup run(s).`)
  console.log(`Electron executable: ${electronExecutablePath}`)
  console.log(`Entry point: ${MAIN_ENTRYPOINT}`)
  console.log('')

  for (let index = 0; index < totalRuns; index++) {
    const isWarmup = index < options.warmup
    const label = isWarmup ? 'warmup' : 'measure'
    const seq = `${index + 1}/${totalRuns}`
    const start = performance.now()
    const result = await runIteration(index + 1, options)
    const elapsed = round(performance.now() - start)

    if (!result.ok) {
      console.log(`[${seq}] ${label} failed in ${formatMilliseconds(elapsed)}: ${result.error}`)
      if (!isWarmup) {
        failures.push({ run: index + 1, error: result.error })
      }
      continue
    }

    const { metrics } = result
    console.log(
      `[${seq}] ${label} input-ready=${formatMilliseconds(metrics.totalMainToInputReady)} ` +
      `renderer-ready=${formatMilliseconds(metrics.totalMainToRendererReady)} ` +
      `main->ready=${formatMilliseconds(metrics.mainToAppReady)} ` +
      `didFinishLoad->rendererReady=${formatMilliseconds(metrics.didFinishLoadToRendererReady)}`
    )

    if (!isWarmup) {
      measured.push({
        run: index + 1 - options.warmup,
        metrics,
        phases: metrics.phases
      })
    }
  }

  if (!measured.length) {
    throw new Error('No successful measured runs. Benchmark cannot produce summary.')
  }

  const summary = {}
  for (const definition of METRIC_DEFINITIONS) {
    summary[definition.key] = summarizeMetric(measured.map(run => run.metrics[definition.key]))
  }

  console.log('')
  console.log('Summary (ms):')
  for (const definition of METRIC_DEFINITIONS) {
    const row = summary[definition.key]
    const left = definition.label.padEnd(44, ' ')
    if (!row.n) {
      console.log(`${left} n=0`)
      continue
    }
    console.log(
      `${left} n=${row.n} p50=${row.p50.toFixed(1)} p95=${row.p95.toFixed(1)} ` +
      `mean=${row.mean.toFixed(1)} min=${row.min.toFixed(1)} max=${row.max.toFixed(1)}`
    )
  }

  const bottleneckRanking = METRIC_DEFINITIONS
    .filter(definition => !['totalMainToInputReady', 'totalMainToRendererReady', 'totalMainToBootstrap'].includes(definition.key))
    .map(definition => ({ definition, stats: summary[definition.key] }))
    .filter(item => item.stats.n > 0)
    .sort((a, b) => (b.stats.p50 ?? -Infinity) - (a.stats.p50 ?? -Infinity))

  if (bottleneckRanking.length > 0) {
    const top = bottleneckRanking[0]
    console.log('')
    console.log(`Primary bottleneck by p50: ${top.definition.label} (${top.stats.p50.toFixed(1)} ms)`)
  }

  if (failures.length > 0) {
    console.log('')
    console.log(`Measured run failures: ${failures.length}`)
    for (const failure of failures) {
      console.log(`  run ${failure.run}: ${failure.error}`)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    samples: measured,
    summary,
    failures
  }

  if (options.outFile) {
    const outputPath = path.resolve(options.outFile)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
    console.log('')
    console.log(`Saved report to ${outputPath}`)
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Cold-start benchmark failed: ${message}`)
  process.exit(1)
})
