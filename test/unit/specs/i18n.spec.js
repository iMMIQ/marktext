import { describe, expect, it } from 'vitest'
import {
  localizeMenuTemplate,
  normalizeLocale,
  translateLegacyText
} from '../../../src/common/i18n'

describe('internationalization', () => {
  it('normalizes supported locale variants and rejects unsupported locales', () => {
    expect(normalizeLocale('zh_CN')).toBe('zh-CN')
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('fr')).toBe('en')
  })

  it('translates direct labels and composed command descriptions', () => {
    expect(translateLegacyText('Save', 'zh-CN')).toBe('保存')
    expect(translateLegacyText('File: New Window', 'zh-CN')).toBe('文件：新建窗口')
    expect(translateLegacyText('Misc: Switch tab to the 2nd', 'zh-CN')).toBe('其他：切换到第 2 个标签页')
    expect(translateLegacyText('/tmp/File: New Window', 'en')).toBe('/tmp/File: New Window')
  })

  it('localizes nested menu templates without mutating the source', () => {
    const source = [{ label: '&File', submenu: [{ label: 'Save' }] }]
    const localized = localizeMenuTemplate(source, 'zh-CN')

    expect(localized).toEqual([{ label: '文件(&F)', submenu: [{ label: '保存' }] }])
    expect(source).toEqual([{ label: '&File', submenu: [{ label: 'Save' }] }])
  })
})
