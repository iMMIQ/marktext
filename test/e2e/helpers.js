const os = require('os')
const path = require('path')
const { _electron } = require('playwright')

const mainEntrypoint = 'dist/electron/main.js'
const CLOSE_TIMEOUT = 5000

const getTempPath = () => {
  const name = `marktext-e2etest-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(os.tmpdir(), name)
}

const getElectronPath = () => {
  const launcherName = process.platform === 'win32' ? 'electron.cmd' : 'electron'
  return path.resolve(path.join('node_modules', '.bin', launcherName))
}

const withForcedClose = app => {
  const originalClose = app.close.bind(app)

  app.close = async () => {
    try {
      await Promise.race([
        originalClose(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), CLOSE_TIMEOUT))
      ])
    } catch {
      // MarkText intercepts window close to handle unsaved tabs. For tests, force
      // quit if graceful shutdown does not finish in time.
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
  }

  return app
}

const launchElectron = async userArgs => {
  userArgs = userArgs || []
  const executablePath = getElectronPath()
  const args = [mainEntrypoint, '--user-data-dir', getTempPath()].concat(userArgs)
  const app = withForcedClose(await _electron.launch({
    executablePath,
    args,
    timeout: 30000
  }))
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { app, page }
}

module.exports = { getElectronPath, launchElectron}
