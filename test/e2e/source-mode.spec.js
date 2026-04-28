const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

const toggleSourceCodeMode = async app => {
  return app.evaluate(({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const viewMenu = Menu.getApplicationMenu().items.find(item => item.label.replace('&', '') === 'View')
    const sourceModeItem = viewMenu.submenu.items.find(item => item.label === 'Source Code Mode')
    sourceModeItem.click(undefined, win)
    return sourceModeItem.checked
  })
}

test('source code mode edits sync back to the rich editor', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-mode-smoke-'))
  const filePath = path.join(tempDir, 'source-mode-smoke.md')
  const token = `source-mode-token-${Date.now()}`
  fs.writeFileSync(filePath, '# Source mode smoke\n\nInitial paragraph\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('Initial paragraph')

    expect(await toggleSourceCodeMode(app)).toBe(true)

    const sourceEditor = page.locator('.source-code .cm-content')
    await expect(sourceEditor).toBeVisible()
    await expect(sourceEditor).toContainText('Initial paragraph')

    await sourceEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(`\n${token}`)
    await expect(sourceEditor).toContainText(token)

    expect(await toggleSourceCodeMode(app)).toBe(false)
    await expect(page.locator('.source-code')).toHaveCount(0)
    await expect(page.locator('.editor-component')).toContainText(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
