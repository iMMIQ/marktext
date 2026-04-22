const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test('editor undo/redo restores typed text', async () => {
  const { app, page } = await launchElectron()
  try {
    const input = 'undo redo smoke'
    const editor = page.locator('.ag-paragraph-content').first()

    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type(input)
    await expect(page.locator('.editor-component')).toContainText(input)

    await page.keyboard.press(`${MOD}+Z`)
    await expect(page.locator('.editor-component')).not.toContainText(input)

    await page.keyboard.press(`Shift+${MOD}+Z`)
    await expect(page.locator('.editor-component')).toContainText(input)
  } finally {
    await app.evaluate(({ app, BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.destroy()
        } catch {}
      }
      app.exit(0)
    }).catch(() => {})
  }
})
