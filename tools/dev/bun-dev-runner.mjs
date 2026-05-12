#!/usr/bin/env bun

import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildPack, distDir, serveBuiltRenderer } from '../build/marktextBun.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const electronBin = path.resolve(projectRoot, `node_modules/.bin/${process.platform === 'win32' ? 'electron.cmd' : 'electron'}`)
const staticSourceDir = path.join(projectRoot, 'static')
const staticTargetDir = path.join(distDir, 'static')
const devServerHost = '127.0.0.1'
const preferredDevServerPort = Number(process.env.MARKTEXT_DEV_SERVER_PORT || 9091)

let electronProcess = null
let restartTimer = null
let rebuildInFlight = false
let rebuildQueued = false
let rendererDevServerUrl = null
const childProcesses = new Set()

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

const copyStaticAssets = async () => {
  await fs.mkdir(staticTargetDir, { recursive: true })
  await fs.cp(staticSourceDir, staticTargetDir, { recursive: true })
}

const stopElectron = () => {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill()
  }
  electronProcess = null
}

const startElectron = () => {
  stopElectron()
  electronProcess = spawnChild(electronBin, [
    '--inspect=5858',
    '--remote-debugging-port=8315',
    '--nolazy',
    path.join(distDir, 'main.js')
  ], {
    NODE_ENV: 'development',
    MARKTEXT_DEV_SERVER_URL: rendererDevServerUrl || `http://${devServerHost}:${preferredDevServerPort}`
  })
}

const scheduleElectronRestart = () => {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    startElectron()
  }, 250)
}

const cleanup = () => {
  clearTimeout(restartTimer)
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

const runBuild = async production => {
  await copyStaticAssets()
  const [mainResult, preloadResult, rendererResult] = await buildPack({ production })

  if (!mainResult.success || !preloadResult.success || !rendererResult.success) {
    if (!mainResult.success) printBuildFailure('main', mainResult)
    if (!preloadResult.success) printBuildFailure('preload', preloadResult)
    if (!rendererResult.success) printBuildFailure('renderer', rendererResult)
    return false
  }

  return true
}

const rebuildAndRestart = async () => {
  if (rebuildInFlight) {
    rebuildQueued = true
    return
  }

  rebuildInFlight = true

  try {
    const success = await runBuild(false)
    if (success) {
      scheduleElectronRestart()
    }
  } finally {
    rebuildInFlight = false
    if (rebuildQueued) {
      rebuildQueued = false
      void rebuildAndRestart()
    }
  }
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

  for (let port = preferredDevServerPort; port < preferredDevServerPort + 100; port++) {
    try {
      server = serveBuiltRenderer(port)
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

  try {
    const success = await runBuild(false)
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
  }).on('all', () => {
    void rebuildAndRestart()
  })

  startElectron()
}

run().catch(error => {
  console.error(error)
  cleanup()
  process.exit(1)
})
