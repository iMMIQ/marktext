const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test: base } = require('@playwright/test')
const {
  clickMenuItemById,
  clickMenuItemByPath,
  getMenuItemChecked,
  launchElectron
} = require('./helpers')

const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const test = base.extend({
  workspace: async ({ browserName }, use) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `marktext-${browserName}-story-`))
    const write = (relativePath, content) => {
      const filePath = path.join(root, relativePath)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content, 'utf8')
      return filePath
    }

    try {
      await use({ root, write })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },

  launchApp: async ({ browserName, workspace }, use) => {
    const sessions = []
    const unexpectedNativeDialogs = []
    await use(async (args = []) => {
      const session = await launchElectron(args)
      session.browserName = browserName
      session.workspaceRoot = workspace.root
      sessions.push(session)
      return session
    })

    for (const { app } of sessions.reverse()) {
      try {
        const calls = await app.evaluate(({ dialog }) => dialog.__marktextE2ENativeDialogCalls || [])
        unexpectedNativeDialogs.push(...calls)
      } catch {} finally {
        await app.close()
      }
    }
    expect(unexpectedNativeDialogs, 'Unexpected native dialog calls').toEqual([])
  },

  captureStory: async ({ browserName }, use, testInfo) => {
    await use(async (page, name) => {
      await page.evaluate(() => document.fonts.ready)
      await page.mouse.move(0, 0)
      const viewportState = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      }))
      expect(viewportState.documentWidth, `${name} has horizontal viewport overflow`)
        .toBeLessThanOrEqual(viewportState.viewportWidth + 1)
      const screenshotPath = testInfo.outputPath(`${slugify(name)}-${browserName}.png`)
      await page.screenshot({
        path: screenshotPath,
        animations: 'disabled',
        caret: 'hide'
      })
      await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' })
      return screenshotPath
    })
  }
})

const expectNoRendererErrors = session => {
  expect(session.rendererErrors, session.rendererErrors.join('\n\n')).toEqual([])
}

const stubOpenDialog = (app, filePaths, callKey = '__marktextOpenDialogCalls') => {
  return app.evaluate(({ dialog }, { paths, key }) => {
    dialog.__marktextE2ECallCounts = dialog.__marktextE2ECallCounts || {}
    dialog.__marktextE2ECallCounts[key] = 0
    dialog.showOpenDialog = async () => {
      dialog.__marktextE2ECallCounts[key] += 1
      return { filePaths: paths, canceled: false }
    }
  }, { paths: filePaths, key: callKey })
}

const stubSaveDialog = (app, filePath, callKey = '__marktextSaveDialogCalls') => {
  return app.evaluate(({ dialog }, { targetPath, key }) => {
    dialog.__marktextE2ECallCounts = dialog.__marktextE2ECallCounts || {}
    dialog.__marktextE2ECallCounts[key] = 0
    dialog.showSaveDialog = async () => {
      dialog.__marktextE2ECallCounts[key] += 1
      return { filePath: targetPath, canceled: false }
    }
  }, { targetPath: filePath, key: callKey })
}

const getMainProcessCallCount = (app, callKey) => {
  return app.evaluate(({ dialog }, key) => dialog.__marktextE2ECallCounts?.[key] || global[key] || 0, callKey)
}

module.exports = {
  clickMenuItemById,
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  getMenuItemChecked,
  stubOpenDialog,
  stubSaveDialog,
  test
}
