const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { launchElectron } = require('./helpers')

test('editor renders sequence diagram blocks under the renderer CSP', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-sequence-smoke-'))
  const filePath = path.join(tempDir, 'sequence-smoke.md')
  fs.writeFileSync(filePath, [
    '# Sequence smoke',
    '',
    'Intro paragraph.',
    '',
    '```sequence',
    'Alice->Bob: Hello Bob',
    'Bob-->Alice: Hello Alice',
    '```',
    ''
  ].join('\n'), 'utf8')

  let app
  try {
    const launched = await launchElectron([filePath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    const sequencePreview = page.locator('.ag-container-preview').filter({ has: page.locator('svg.sequence') }).first()
    await expect(sequencePreview.locator('svg.sequence')).toBeVisible({ timeout: 15000 })
    await expect(sequencePreview).toContainText('Hello Bob')
    await expect(sequencePreview).not.toContainText('Invalid Sequence')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
