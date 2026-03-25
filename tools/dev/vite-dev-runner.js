#!/usr/bin/env node

const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')
const chokidar = require('chokidar')

const viteBin = path.resolve(`node_modules/.bin/${process.platform === 'win32' ? 'vite.cmd' : 'vite'}`)
const electronBin = path.resolve(`node_modules/.bin/${process.platform === 'win32' ? 'electron.cmd' : 'electron'}`)
const mainBundlePath = path.resolve('dist/electron/main.js')
const preloadBundlePath = path.resolve('dist/electron/preload.js')
const rendererDevServerUrl = 'http://127.0.0.1:9091'
const runnerStartTime = Date.now()

let electronProcess = null
let restartTimer = null
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

const waitForFile = (filePath, minimumMTime = 0) => {
  return new Promise(resolve => {
    const check = () => {
      if (fs.existsSync(filePath) && fs.statSync(filePath).mtimeMs >= minimumMTime) {
        return resolve()
      }
      setTimeout(check, 200)
    }
    check()
  })
}

const waitForRendererServer = (url, timeout = 30000) => {
  const deadline = Date.now() + timeout

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, response => {
        response.resume()
        resolve()
      })

      request.on('error', maybeRetry)
      request.setTimeout(1000, () => {
        request.destroy(new Error(`Timed out waiting for ${url}`))
      })
    }

    const maybeRetry = error => {
      if (Date.now() >= deadline) {
        reject(error)
        return
      }

      setTimeout(attempt, 200)
    }

    attempt()
  })
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
    mainBundlePath
  ], {
    NODE_ENV: 'development'
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
    if (!child.killed) {
      child.kill()
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

spawnChild(viteBin, [
  'build',
  '--watch',
  '--mode',
  'development',
  '--config',
  'vite.main.config.js'
], {
  NODE_ENV: 'development'
})

spawnChild(viteBin, [
  'build',
  '--watch',
  '--mode',
  'development',
  '--config',
  'vite.preload.config.js'
], {
  NODE_ENV: 'development'
})

spawnChild(viteBin, [
  '--host',
  '127.0.0.1',
  '--port',
  '9091',
  '--strictPort',
  '--config',
  'vite.renderer.config.js'
], {
  NODE_ENV: 'development'
})

chokidar.watch([mainBundlePath, preloadBundlePath], {
  ignoreInitial: true
})
  .on('add', scheduleElectronRestart)
  .on('change', scheduleElectronRestart)

Promise.all([
  waitForFile(mainBundlePath, runnerStartTime),
  waitForFile(preloadBundlePath, runnerStartTime),
  waitForRendererServer(rendererDevServerUrl)
]).then(() => {
  startElectron()
}).catch(error => {
  console.error(error)
  cleanup()
  process.exit(1)
})
