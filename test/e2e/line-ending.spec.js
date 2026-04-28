const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemById, clickMenuItemByPath, getMenuItemChecked, launchElectron } = require('./helpers')

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

    await clickMenuItemById(app, 'crlfLineEndingMenuEntry')

    await expect.poll(() => {
      return getMenuItemChecked(app, 'crlfLineEndingMenuEntry')
    }).toBe(true)

    await clickMenuItemByPath(app, ['File', 'Save'])

    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('first\r\nsecond')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
