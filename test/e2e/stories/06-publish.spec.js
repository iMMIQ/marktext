const fs = require('fs')
const path = require('path')
const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  getMainProcessCallCount,
  stubSaveDialog,
  test
} = require('../fixtures')

const confirmExport = async page => {
  const dialog = page.locator('.print-settings-dialog .el-dialog')
  await expect(dialog).toBeVisible()
  await page.getByRole('button', { name: 'Export...' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('US-06 publish', () => {
  test('[US-06.AC-01] exports the current document to styled HTML', async ({ captureStory, launchApp, workspace }) => {
    const token = `html-export-${Date.now()}`
    const markdownPath = workspace.write('publish.md', `# Publish\n\n${token}\n`)
    const htmlPath = path.join(workspace.root, 'publish.html')
    const session = await launchApp([markdownPath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText(token)
    await stubSaveDialog(app, htmlPath, '__htmlExportCalls')
    await clickMenuItemByPath(app, ['File', 'Export', 'HTML'])
    await expect(page.locator('.print-settings-dialog .el-dialog')).toBeVisible()
    await captureStory(page, 'US-06 export settings')
    await confirmExport(page)

    await expect.poll(() => getMainProcessCallCount(app, '__htmlExportCalls')).toBe(1)
    await expect.poll(() => fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '', { timeout: 15000 }).toContain(token)
    expectNoRendererErrors(session)
  })

  test('[US-06.AC-02] exports the current document to PDF', async ({ launchApp, workspace }) => {
    const markdownPath = workspace.write('pdf.md', '# Printable PDF\n\nPDF body text\n')
    const pdfPath = path.join(workspace.root, 'print.pdf')
    const session = await launchApp([markdownPath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText('PDF body text')
    await stubSaveDialog(app, pdfPath, '__pdfDialogCalls')
    await app.evaluate(({ BrowserWindow }) => {
      global.__printToPdfCalls = 0
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.printToPDF = async () => {
        global.__printToPdfCalls += 1
        return Buffer.from('%PDF-1.4\n% MarkText story test\n')
      }
    })

    await clickMenuItemByPath(app, ['File', 'Export', 'PDF'])
    await confirmExport(page)
    await expect.poll(() => getMainProcessCallCount(app, '__pdfDialogCalls')).toBe(1)
    await expect.poll(() => getMainProcessCallCount(app, '__printToPdfCalls')).toBe(1)
    await expect.poll(() => fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath, 'utf8') : '').toContain('%PDF-1.4')
    expectNoRendererErrors(session)
  })

  test('[US-06.AC-03] submits the current document to print', async ({ launchApp, workspace }) => {
    const markdownPath = workspace.write('print.md', '# Printable\n\nPrint body text\n')
    const session = await launchApp([markdownPath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText('Print body text')
    await app.evaluate(({ BrowserWindow }) => {
      global.__printCalls = 0
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.print = (options, callback) => {
        global.__printCalls += 1
        // Electron's print callback receives a success boolean, not an error.
        // eslint-disable-next-line n/no-callback-literal
        callback(true)
      }
    })

    await clickMenuItemByPath(app, ['File', 'Print'])
    await confirmExport(page)
    await expect.poll(() => getMainProcessCallCount(app, '__printCalls')).toBe(1)
    expectNoRendererErrors(session)
  })

  test('[US-06.AC-04] cancels export settings without opening a native save dialog', async ({ launchApp, workspace }) => {
    const markdownPath = workspace.write('cancel-export.md', '# Keep editing\n\nNo export requested.\n')
    const session = await launchApp([markdownPath])
    const { app, page } = session

    await expect(page.locator('.editor-component')).toContainText('No export requested.')
    await clickMenuItemByPath(app, ['File', 'Export', 'HTML'])
    const dialog = page.locator('.print-settings-dialog .el-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(await getMainProcessCallCount(app, '__saveAsCalls')).toBe(0)
    await expect(page.locator('.editor-component')).toContainText('No export requested.')
    expectNoRendererErrors(session)
  })
})
