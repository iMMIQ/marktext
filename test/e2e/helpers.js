const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { _electron } = require('playwright')

const mainEntrypoint = 'test/e2e/electron-main.cjs'
const FORCE_CLOSE_TIMEOUT = 2000

const assertLinuxIsolation = () => {
  if (process.env.MARKTEXT_E2E_ISOLATED !== '1' || process.env.MARKTEXT_E2E_SANDBOXED !== '1') {
    throw new Error('Linux E2E must run through "bun run e2e" inside the desktop-isolation sandbox.')
  }

  for (const name of ['net', 'pid', 'ipc']) {
    const hostNamespace = process.env[`MARKTEXT_E2E_HOST_${name.toUpperCase()}_NS`]
    if (!hostNamespace || fs.readlinkSync(`/proc/self/ns/${name}`) === hostNamespace) {
      throw new Error(`Linux E2E ${name} namespace isolation is missing.`)
    }
  }

  const display = process.env.DISPLAY || ''
  const displayNumber = display.match(/^:(\d+)$/)?.[1]
  if (!displayNumber || !fs.existsSync(`/tmp/.X11-unix/X${displayNumber}`)) {
    throw new Error('Linux E2E private X11 display is missing.')
  }

  const runtimeDir = `/run/user/${process.getuid()}`
  if (fs.existsSync(path.join(runtimeDir, 'bus')) ||
      fs.readdirSync(runtimeDir).some(name => name.startsWith('wayland-'))) {
    throw new Error('Linux E2E can still reach the host DBus or Wayland session.')
  }
}

if (process.platform === 'linux') {
  assertLinuxIsolation()
}

const getTempPath = () => {
  const name = `marktext-e2etest-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return path.join(os.tmpdir(), name)
}

const getElectronPath = () => {
  return require('electron')
}

const clickMenuItemByPath = (app, labels) => {
  return app.evaluate(({ BrowserWindow, Menu }, menuPath) => {
    const windows = BrowserWindow.getAllWindows()
    const win = BrowserWindow.getFocusedWindow() || windows.find(window => window.isVisible()) || windows[0]
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
    const windows = BrowserWindow.getAllWindows()
    const win = BrowserWindow.getFocusedWindow() || windows.find(window => window.isVisible()) || windows[0]
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
      // A graceful close intentionally asks about unsaved tabs. Test teardown
      // must never enter that product flow because it can open a native dialog.
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

const blockNativeDialogs = app => {
  return app.evaluate(({ dialog }) => {
    if (dialog.__marktextE2ENativeDialogsBlocked !== true) {
      throw new Error('Native dialogs were not blocked before MarkText startup.')
    }
    dialog.__marktextE2ENativeDialogsBlocked = true
  })
}

const launchElectron = async userArgs => {
  userArgs = userArgs || []
  const executablePath = getElectronPath()
  const userDataDir = getTempPath()
  const isolationArgs = process.env.MARKTEXT_E2E_ISOLATED === '1'
    ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    : []
  const args = [mainEntrypoint, ...isolationArgs, '--user-data-dir', userDataDir].concat(userArgs)
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
  await blockNativeDialogs(app)
  const page = await app.firstWindow()
  const rendererErrors = []
  page.on('pageerror', error => rendererErrors.push(error.stack || error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.editor-container').waitFor({ state: 'visible', timeout: 30000 })
  return { app, page, rendererErrors, userDataDir }
}

module.exports = {
  clickMenuItemById,
  clickMenuItemByPath,
  getElectronPath,
  getMenuItemChecked,
  launchElectron
}
