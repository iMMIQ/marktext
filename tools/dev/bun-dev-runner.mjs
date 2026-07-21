#!/usr/bin/env bun

import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  buildMain,
  buildPreload,
  buildRenderer,
  buildRendererWorker,
  distDir,
  serveBuiltRenderer
} from '../build/marktextBun.mjs'
import { ALL_DEV_BUILD_TARGETS, planDevChange } from './devBuildPlan.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const electronBin = path.resolve(projectRoot, `node_modules/.bin/${process.platform === 'win32' ? 'electron.cmd' : 'electron'}`)
const staticSourceDir = path.join(projectRoot, 'static')
const staticTargetDir = path.join(distDir, 'static')
const devServerHost = '127.0.0.1'
const preferredDevServerPort = Number(process.env.MARKTEXT_DEV_SERVER_PORT || 9091)

let electronProcess = null
let rebuildInFlight = false
let rendererDevServerUrl = null
let rendererRevision = 0
let inspectPort = Number(process.env.MARKTEXT_INSPECT_PORT || 5858)
let remoteDebuggingPort = Number(process.env.MARKTEXT_REMOTE_DEBUGGING_PORT || 8315)
let rebuildTimer = null
let restartAfterBuild = false
let reloadAfterBuild = false
const pendingBuildTargets = new Set()
const pendingStaticChanges = new Map()
const childProcesses = new Set()

const builders = {
  main: buildMain,
  preload: buildPreload,
  renderer: buildRenderer,
  worker: buildRendererWorker
}

const spawnChild = (command, args, extraEnv = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv
    }
  })

  childProcesses.add(child)
  child.on('exit', () => {
    childProcesses.delete(child)
  })
  return child
}

const copyAllStaticAssets = async () => {
  await fs.mkdir(staticTargetDir, { recursive: true })
  await fs.cp(staticSourceDir, staticTargetDir, { recursive: true })
}

const syncStaticAsset = async (event, relativePath) => {
  const sourcePath = path.join(projectRoot, relativePath)
  const targetPath = path.join(staticTargetDir, path.relative('static', relativePath))

  if (event === 'unlink' || event === 'unlinkDir') {
    await fs.rm(targetPath, { recursive: true, force: true })
    return
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
}

const findAvailablePort = port => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.unref()
  server.once('error', error => {
    if (error.code === 'EADDRINUSE') {
      resolve(findAvailablePort(port + 1))
    } else {
      reject(error)
    }
  })
  server.listen(port, '127.0.0.1', () => {
    server.close(() => resolve(port))
  })
})

const stopElectron = () => {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill()
  }
  electronProcess = null
}

const startElectron = () => {
  stopElectron()
  electronProcess = spawnChild(electronBin, [
    `--inspect=${inspectPort}`,
    `--remote-debugging-port=${remoteDebuggingPort}`,
    '--nolazy',
    path.join(distDir, 'main.js')
  ], {
    NODE_ENV: 'development',
    MARKTEXT_DEV_SERVER_URL: rendererDevServerUrl || `http://${devServerHost}:${preferredDevServerPort}`
  })
}

const cleanup = () => {
  clearTimeout(rebuildTimer)
  stopElectron()
  for (const child of childProcesses) {
    if (!child.killed) child.kill()
  }
}

const printBuildFailure = (label, result) => {
  console.error(`\n${label} build failed`)
  for (const log of result.logs || []) {
    console.error(log.message || log.text || String(log))
  }
}

const runBuild = async (targets, production = false) => {
  for (const target of targets) {
    const result = await builders[target]({ production })
    if (!result.success) {
      printBuildFailure(target, result)
      return false
    }
  }

  return true
}

const rebuildAndRestart = async () => {
  if (rebuildInFlight) {
    return
  }

  rebuildInFlight = true

  try {
    const targets = [...pendingBuildTargets]
    const staticChanges = [...pendingStaticChanges]
    const shouldRestart = restartAfterBuild
    const shouldReload = reloadAfterBuild
    pendingBuildTargets.clear()
    pendingStaticChanges.clear()
    restartAfterBuild = false
    reloadAfterBuild = false

    for (const [relativePath, event] of staticChanges) {
      await syncStaticAsset(event, relativePath)
    }

    const success = await runBuild(targets)
    if (success) {
      if (shouldRestart) {
        startElectron()
      } else if (shouldReload || staticChanges.length) {
        rendererRevision += 1
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    rebuildInFlight = false
    if (pendingBuildTargets.size || pendingStaticChanges.size) {
      rebuildAndRestart()
    }
  }
}

const scheduleBuild = () => {
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(rebuildAndRestart, 75)
}

const queueFileChange = (event, relativePath) => {
  const plan = planDevChange(relativePath)

  if (plan.staticAsset) {
    pendingStaticChanges.set(relativePath, event)
    reloadAfterBuild ||= plan.reload
    scheduleBuild()
    return
  }

  for (const target of plan.targets) pendingBuildTargets.add(target)
  restartAfterBuild ||= plan.restart
  reloadAfterBuild ||= plan.reload

  scheduleBuild()
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

const run = async () => {
  const { watch } = await import('chokidar')
  let server = null

  ;[inspectPort, remoteDebuggingPort] = await Promise.all([
    findAvailablePort(inspectPort),
    findAvailablePort(remoteDebuggingPort)
  ])

  for (let port = preferredDevServerPort; port < preferredDevServerPort + 100; port++) {
    try {
      server = serveBuiltRenderer(port, { getRevision: () => rendererRevision })
      rendererDevServerUrl = `http://${devServerHost}:${port}`
      break
    } catch (error) {
      if (error && error.code === 'EADDRINUSE') {
        continue
      }

      throw error
    }
  }

  if (!server || !rendererDevServerUrl) {
    throw new Error(`Unable to start renderer dev server on ports ${preferredDevServerPort}-${preferredDevServerPort + 99}`)
  }

  console.log(`Renderer dev server listening on ${rendererDevServerUrl}`)
  console.log(`Main inspector listening on 127.0.0.1:${inspectPort}`)
  console.log(`Renderer debugger listening on 127.0.0.1:${remoteDebuggingPort}`)

  try {
    await copyAllStaticAssets()
    const success = await runBuild(ALL_DEV_BUILD_TARGETS)
    if (!success) {
      throw new Error('Initial Bun build failed')
    }
  } catch (error) {
    console.error(error)
    cleanup()
    server.stop()
    process.exit(1)
  }

  watch([
    'src/main/**/*',
    'src/common/**/*',
    'src/renderer/**/*',
    'src/muya/**/*',
    'static/**/*',
    'tools/build/**/*',
    'package.json'
  ], {
    cwd: projectRoot,
    ignoreInitial: true,
    ignored: ['**/dist/**', '**/node_modules/**']
  }).on('all', (event, relativePath) => {
    queueFileChange(event, relativePath.replace(/\\/g, '/'))
  })

  startElectron()
}

run().catch(error => {
  console.error(error)
  cleanup()
  process.exit(1)
})
