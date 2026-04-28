const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('line ending menu converts line endings on save', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-line-ending-smoke-'))
  const filePath = path.join(tempDir, 'line-ending-smoke.md')
  fs.writeFileSync(filePath, '# Line ending smoke\n\nfirst\nsecond\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('first')

    await app.evaluate(({ BrowserWindow, Menu }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const editMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'Edit')
      const lineEndingMenu = editMenu.submenu.items.find(item => item.label === 'Line Ending')
      const crlfItem = lineEndingMenu.submenu.items.find(item => item.id === 'crlfLineEndingMenuEntry')
      crlfItem.click(undefined, win)
    })

    await expect.poll(() => {
      return app.evaluate(({ Menu }) => {
        return Menu.getApplicationMenu().getMenuItemById('crlfLineEndingMenuEntry').checked
      })
    }).toBe(true)

    await app.evaluate(({ BrowserWindow, Menu }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const fileMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'File')
      const saveItem = fileMenu.submenu.items.find(item => item.label === 'Save')
      saveItem.click(undefined, win)
    })

    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('first\r\nsecond')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
