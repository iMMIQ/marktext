const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')
const fs = require('fs')
const os = require('os')
const path = require('path')

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

test('undo after editing a long file keeps blocks above the cursor rendered', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-undo-render-'))
  const filePath = path.join(tempDir, 'undo-render-long-file.md')
  const topToken = `top-visible-token-${Date.now()}`
  const editToken = `edit-token-${Date.now()}`
  const lines = [`# Undo render smoke`, '', topToken, '']
  for (let i = 1; i <= 80; i++) {
    lines.push(`paragraph ${i}`)
    lines.push('')
  }
  lines.push('target paragraph')
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')

  let app
  try {
    const launched = await launchElectron()
    app = launched.app
    const { page } = launched
    const editorComponent = page.locator('.editor-component')

    await app.evaluate(({ dialog }, targetPath) => {
      global.__marktextUndoRenderOpenDialogCalls = 0
      dialog.showOpenDialog = async () => {
        global.__marktextUndoRenderOpenDialogCalls += 1
        return { filePaths: [targetPath], canceled: false }
      }
    }, filePath)

    await clickMenuItemByPath(app, ['File', 'Open File...'])
    await expect.poll(() => app.evaluate(() => global.__marktextUndoRenderOpenDialogCalls || 0)).toBe(1)
    await expect(editorComponent).toContainText(topToken)

    await page.evaluate(() => {
      const container = document.querySelector('.editor-component')
      if (container) {
        container.scrollTop = container.scrollHeight
        container.dispatchEvent(new Event('scroll'))
      }
    })

    await expect(page.locator('.ag-paragraph-content').filter({ hasText: 'target paragraph' }).first()).toBeVisible()
    const target = page.locator('.ag-paragraph-content').filter({ hasText: 'target paragraph' }).first()
    await target.click()
    await page.keyboard.type(` ${editToken}`)
    await expect(editorComponent).toContainText(editToken)

    await page.keyboard.press(`${MOD}+Z`)
    await expect(editorComponent).not.toContainText(editToken)
    await expect(editorComponent).toContainText(topToken)

    await page.evaluate(() => {
      const container = document.querySelector('.editor-component')
      if (container) {
        container.scrollTop = 0
        container.dispatchEvent(new Event('scroll'))
      }
    })

    await expect(page.locator('.ag-paragraph-content').filter({ hasText: topToken }).first()).toBeVisible()
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
