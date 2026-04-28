const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect, test } = require('@playwright/test')
const { clickMenuItemByPath, launchElectron } = require('./helpers')

test('file menu exports the opened markdown file as PDF', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-pdf-export-smoke-'))
  const markdownPath = path.join(tempDir, 'pdf-export-smoke.md')
  const pdfPath = path.join(tempDir, 'pdf-export-smoke.pdf')
  fs.writeFileSync(markdownPath, '# PDF export smoke\n\nBody text\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([markdownPath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('Body text')

    await app.evaluate(({ BrowserWindow, dialog }, targetPath) => {
      global.__marktextPdfDialogCalls = 0
      global.__marktextPrintToPdfCalls = 0
      dialog.showSaveDialog = async () => {
        global.__marktextPdfDialogCalls += 1
        return { filePath: targetPath, canceled: false }
      }

      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.printToPDF = async () => {
        global.__marktextPrintToPdfCalls += 1
        return Buffer.from('%PDF-1.4\n% MarkText e2e smoke\n')
      }
    }, pdfPath)

    await clickMenuItemByPath(app, ['File', 'Export', 'PDF'])

    const exportDialog = page.locator('.print-settings-dialog .el-dialog')
    await expect(exportDialog).toBeVisible()
    await page.getByRole('button', { name: 'Export...' }).click()
    await expect(exportDialog).toBeHidden()

    await expect.poll(() => app.evaluate(() => global.__marktextPdfDialogCalls || 0)).toBe(1)
    await expect.poll(() => app.evaluate(() => global.__marktextPrintToPdfCalls || 0)).toBe(1)
    await expect.poll(() => {
      if (!fs.existsSync(pdfPath)) return ''
      return fs.readFileSync(pdfPath, 'utf8')
    }).toContain('%PDF-1.4')
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('file menu print sends the document to the print service', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-print-smoke-'))
  const markdownPath = path.join(tempDir, 'print-smoke.md')
  fs.writeFileSync(markdownPath, '# Print smoke\n\nBody text\n', 'utf8')

  let app
  try {
    const launched = await launchElectron([markdownPath])
    app = launched.app
    const { page } = launched

    await expect(page.locator('.editor-container')).toBeVisible()
    await expect(page.locator('.editor-component')).toContainText('Body text')

    await app.evaluate(({ BrowserWindow }) => {
      global.__marktextPrintCalls = 0
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.print = (options, callback) => {
        global.__marktextPrintCalls += 1
        callback(true)
      }
    })

    await clickMenuItemByPath(app, ['File', 'Print'])

    const exportDialog = page.locator('.print-settings-dialog .el-dialog')
    await expect(exportDialog).toBeVisible()
    await page.getByRole('button', { name: 'Export...' }).click()
    await expect(exportDialog).toBeHidden()

    await expect.poll(() => app.evaluate(() => global.__marktextPrintCalls || 0)).toBe(1)
  } finally {
    if (app) {
      await app.close()
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
