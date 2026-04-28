const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('edit menu replace opens the replace bar and replaces a match', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-replace-smoke-'))
  const filePath = path.join(tempDir, 'replace-smoke.md')
  const token = `replace-target-${Date.now()}`
  const replacement = `replace-result-${Date.now()}`
  fs.writeFileSync(filePath, `# Replace smoke\n\nBefore ${token} after\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText(token)

    await clickMenuItemByPath(app, ['Edit', 'Replace'])

    const searchBar = page.locator('.search-bar')
    await expect(searchBar).toBeVisible()
    await expect(searchBar.locator('section.replace')).toBeVisible()

    await searchBar.locator('input[placeholder="Search"]').click()
    await page.keyboard.type(token)
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 1')
    await expect(page.locator('.ag-highlight')).toHaveCount(1)

    await searchBar.locator('input[placeholder="Replacement"]').fill(replacement)
    await searchBar.locator('section.replace .button-group .button').first().evaluate(button => button.click())

    await expect(page.locator('.editor-component')).toContainText(replacement)
    await expect(page.locator('.editor-component')).not.toContainText(token)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
