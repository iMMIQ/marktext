const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('editor saves typed content to the opened markdown file', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-save-smoke-'))
  const filePath = path.join(tempDir, 'save-smoke.md')
  const token = `saved content ${Date.now()}`
  fs.writeFileSync(filePath, '# Save smoke\n\nInitial paragraph\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('Initial paragraph')

    const editor = page.locator('.ag-paragraph-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type(` ${token}`)
    await expect(page.locator('.editor-component')).toContainText(token)
    await expect(page.locator('.tabs-container li.active.unsaved')).toHaveCount(1)

    await clickMenuItemByPath(app, ['File', 'Save'])
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
