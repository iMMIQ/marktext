const fs = require('fs')
const path = require('path')
const {
  clickMenuItemByPath,
  expect,
  expectNoRendererErrors,
  test
} = require('../fixtures')

const getApplicationMenuLabels = app => app.evaluate(({ Menu }) => {
  const normalize = label => (label || '')
    .replace(/&/g, '')
    .replace(/\([A-Za-z]\)$/, '')
  return Menu.getApplicationMenu().items.map(item => ({
    label: normalize(item.label),
    children: item.submenu?.items.map(child => normalize(child.label)) || []
  }))
})

test.describe('US-08 localization', () => {
  test('[US-08.AC-01, US-08.AC-02, US-08.AC-03] switches to Simplified Chinese across renderer and native menus, supports Chinese command search, and persists a compact layout', async ({ captureStory, launchApp, workspace }) => {
    const filePath = workspace.write('localization.md', '# Localization\n\nChinese interface story fixture.\n')
    const session = await launchApp([filePath])
    const { app, page, userDataDir } = session
    const preferencesPath = path.join(userDataDir, 'preferences.json')

    await page.evaluate(() => { window.location.hash = '#/preference/general' })
    const languageSetting = page.locator('.pref-select-item')
      .filter({ hasText: 'User interface language' })
    await expect(languageSetting).toBeVisible()
    await languageSetting.locator('.el-select').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Simplified Chinese' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('.pref-sidebar h3')).toHaveText('偏好设置')
    await expect(page.locator('.pref-general h4')).toHaveText('通用')
    await expect(page.locator('.pref-general')).toContainText('自动保存')
    await expect.poll(() => {
      if (!fs.existsSync(preferencesPath)) return null
      return JSON.parse(fs.readFileSync(preferencesPath, 'utf8')).language
    }).toBe('zh-CN')

    await expect.poll(() => getApplicationMenuLabels(app)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: '文件',
        children: expect.arrayContaining(['偏好设置...'])
      }),
      expect.objectContaining({ label: '编辑' }),
      expect.objectContaining({ label: '视图' })
    ]))
    await captureStory(page, 'US-08 Chinese preferences')

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(650, 500)
    })
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(650)
    const compactLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      sidebarRight: document.querySelector('.pref-sidebar').getBoundingClientRect().right,
      contentLeft: document.querySelector('.pref-content').getBoundingClientRect().left
    }))
    expect(compactLayout.documentWidth).toBeLessThanOrEqual(compactLayout.viewportWidth + 1)
    expect(compactLayout.contentLeft).toBeGreaterThanOrEqual(compactLayout.sidebarRight - 1)

    await page.locator('.pref-sidebar .category .item[title="快捷键"]').click()
    await expect(page.locator('.pref-keybindings')).toBeVisible()
    const shortcutSearch = page.locator('.keybindings-search input')
    await shortcutSearch.fill('向前切换标签页')
    await expect(page.locator('.pref-keybindings .el-table__row')).toHaveCount(1)
    await expect(page.locator('.pref-keybindings .el-table__row')).toContainText('其他：向前切换标签页')
    await captureStory(page, 'US-08 Chinese keybindings')

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 720)
    })
    await page.evaluate(() => { window.location.hash = '#/editor' })
    await expect(page.locator('.editor-container')).toBeVisible()

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(550, 500)
    })
    const wordCounter = page.locator('.title-bar .word-count')
    const counterLabels = [
      /^\d+ 个单词$/,
      /^\d+ 个段落$/,
      /^\d+ 个字符$/,
      /^\d+ 个字符（含空格）$/
    ]
    for (const label of counterLabels) {
      await expect(wordCounter).toHaveText(label)
      const layout = await wordCounter.evaluate(element => {
        const text = element.querySelector('.text-center-vertical')
        const titleBar = element.closest('.title-bar')
        const documentTitle = titleBar.querySelector('.document-title')
        const windowControls = titleBar.querySelector(':scope > .right-toolbar')
        const counterRect = element.getBoundingClientRect()
        const textRect = text.getBoundingClientRect()
        const titleRect = documentTitle.getBoundingClientRect()
        const controlsRect = windowControls.getBoundingClientRect()
        return {
          whiteSpace: getComputedStyle(text).whiteSpace,
          textHeight: textRect.height,
          titleBarHeight: titleBar.getBoundingClientRect().height,
          counterRight: counterRect.right,
          titleLeft: titleRect.left,
          titleRight: titleRect.right,
          controlsLeft: controlsRect.left
        }
      })
      expect(layout.whiteSpace).toBe('nowrap')
      expect(layout.textHeight).toBeLessThanOrEqual(layout.titleBarHeight)
      expect(layout.counterRight).toBeLessThanOrEqual(layout.titleLeft)
      expect(layout.titleRight).toBeLessThanOrEqual(layout.controlsLeft)
      await wordCounter.click()
    }
    await wordCounter.click({ clickCount: 3 })
    await expect(wordCounter).toHaveText(counterLabels[3])
    await captureStory(page, 'US-08 compact Chinese word counter')

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(1100, 720)
    })
    await clickMenuItemByPath(app, ['编辑', '查找'])
    const searchBar = page.locator('.search-bar')
    await expect(searchBar.locator('input[placeholder="查找"]')).toBeVisible()
    await searchBar.locator('input[placeholder="查找"]').click()
    await page.keyboard.type('fixture')
    await expect(searchBar.locator('.search-result')).toHaveText('1 / 1')

    await clickMenuItemByPath(app, ['视图', '命令面板...'])
    const palette = page.locator('.command-palette .el-dialog')
    await expect(palette).toBeVisible()
    await expect(palette.locator('input.search')).toHaveAttribute('placeholder', '输入要执行的命令')
    await palette.locator('input.search').fill('新建窗口')
    await expect(palette.locator('ul.commands li.active')).toContainText('文件：新建窗口')
    await captureStory(page, 'US-08 Chinese editor and command palette')

    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    const newWindowPromise = app.waitForEvent('window')
    await clickMenuItemByPath(app, ['文件', '新建窗口'])
    const newPage = await newWindowPromise
    newPage.on('pageerror', error => session.rendererErrors.push(error.stack || error.message))
    await newPage.waitForLoadState('domcontentloaded')
    await expect(newPage.locator('.editor-container')).toBeVisible()
    await expect(newPage.locator('html')).toHaveAttribute('lang', 'zh-CN')

    expectNoRendererErrors(session)
  })
})
