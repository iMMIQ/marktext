const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { _electron } = require('playwright')

const mainEntrypoint = 'dist/electron/main.js'
const CLOSE_TIMEOUT = 5000
const FORCE_CLOSE_TIMEOUT = 2000

const getTempPath = () => {
  const name = `marktext-e2etest-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(os.tmpdir(), name)
}

const getElectronPath = () => {
  return require('electron')
}

const clickMenuItemByPath = (app, labels) => {
  return app.evaluate(({ BrowserWindow, Menu }, menuPath) => {
    const win = BrowserWindow.getAllWindows()[0]
    const normalizeLabel = label => (label || '').replace(/&/g, '')
    let items = Menu.getApplicationMenu().items
    let menuItem

    for (const label of menuPath) {
      menuItem = items.find(item => normalizeLabel(item.label) === label)
      if (!menuItem) {
        throw new Error(`Cannot find menu item "${label}" in path "${menuPath.join(' > ')}"`)
      }
      items = menuItem.submenu ? menuItem.submenu.items : []
    }

    menuItem.click(undefined, win)
  }, labels)
}

const clickMenuItemById = (app, id) => {
  return app.evaluate(({ BrowserWindow, Menu }, itemId) => {
    const win = BrowserWindow.getAllWindows()[0]
    const menuItem = Menu.getApplicationMenu().getMenuItemById(itemId)
    if (!menuItem) {
      throw new Error(`Cannot find menu item by id "${itemId}"`)
    }

    menuItem.click(undefined, win)
  }, id)
}

const getMenuItemChecked = (app, id) => {
  return app.evaluate(({ Menu }, itemId) => {
    const menuItem = Menu.getApplicationMenu().getMenuItemById(itemId)
    if (!menuItem) {
      throw new Error(`Cannot find menu item by id "${itemId}"`)
    }

    return menuItem.checked
  }, id)
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const waitForChildExit = childProcess => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    const finish = () => {
      childProcess.removeListener('exit', finish)
      childProcess.removeListener('close', finish)
      resolve()
    }

    childProcess.once('exit', finish)
    childProcess.once('close', finish)
  })
}

const waitForAppExit = (app, childProcess, timeout) => {
  return Promise.race([
    Promise.any([
      app.waitForEvent('close').catch(() => {}),
      waitForChildExit(childProcess)
    ]),
    delay(timeout).then(() => {
      throw new Error('close timeout')
    })
  ])
}

const withForcedClose = (app, userDataDir) => {
  const originalClose = app.close.bind(app)
  const childProcess = app.process()
  let closePromise = null

  const cleanupUserDataDir = () => {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {}
  }

  const forceQuitFromMain = async () => {
    try {
      await app.evaluate(({ app, BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.removeAllListeners('close')
          } catch {}
          try {
            win.destroy()
          } catch {}
        }

        app.exit(0)
      })
    } catch {}
  }

  app.close = async () => {
    if (closePromise) return closePromise

    closePromise = (async () => {
      try {
        // Kick off Playwright context shutdown, but treat process termination as
        // the real success condition because unsaved-tab guards can stall close().
        originalClose().catch(() => {})
        await waitForAppExit(app, childProcess, CLOSE_TIMEOUT)
        return
      } catch {}

      // MarkText intercepts window close to handle unsaved tabs. For tests, force
      // quit if graceful shutdown does not finish in time.
      await forceQuitFromMain()

      try {
        await waitForAppExit(app, childProcess, FORCE_CLOSE_TIMEOUT)
        return
      } catch {}

      if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
        try {
          childProcess.kill('SIGTERM')
        } catch {}
      }

      try {
        await Promise.race([
          waitForChildExit(childProcess),
          delay(FORCE_CLOSE_TIMEOUT).then(() => {
            throw new Error('sigterm timeout')
          })
        ])
        return
      } catch {}

      if (childProcess && childProcess.exitCode === null && childProcess.signalCode === null) {
        try {
          childProcess.kill('SIGKILL')
        } catch {}
      }

      await Promise.race([
        waitForChildExit(childProcess),
        delay(FORCE_CLOSE_TIMEOUT).then(() => {
          throw new Error('sigkill timeout')
        })
      ])
    })().finally(cleanupUserDataDir)

    return closePromise
  }

  return app
}

const launchElectron = async userArgs => {
  userArgs = userArgs || []
  const executablePath = getElectronPath()
  const userDataDir = getTempPath()
  const args = [mainEntrypoint, '--user-data-dir', userDataDir].concat(userArgs)
  const rendererUrl = process.env.MARKTEXT_DEV_SERVER_URL ||
    pathToFileURL(path.join(process.cwd(), 'dist/electron/index.html')).toString()
  let electronApp

  try {
    electronApp = await _electron.launch({
      executablePath,
      args,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        MARKTEXT_DEV_SERVER_URL: rendererUrl
      },
      timeout: 30000
    })
  } catch (error) {
    error.message = `Failed to launch Electron via ${executablePath} with args ${args.join(' ')}\n${error.message}`
    throw error
  }

  const app = withForcedClose(electronApp, userDataDir)
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { app, page }
}

module.exports = {
  clickMenuItemById,
  clickMenuItemByPath,
  getElectronPath,
  getMenuItemChecked,
  launchElectron
}
