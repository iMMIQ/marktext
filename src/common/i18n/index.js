import en from './locales/en'
import zhCN from './locales/zh-CN'

export const DEFAULT_LOCALE = 'en'
export const SUPPORTED_LOCALES = ['en', 'zh-CN']
export const messages = {
  en,
  'zh-CN': zhCN
}

const legacyLookups = Object.fromEntries(Object.entries(messages).map(([locale, message]) => [
  locale,
  Object.fromEntries(Object.entries(message.legacy || {}).map(([key, value]) => [key.toLowerCase(), value]))
]))

export const normalizeLocale = locale => {
  if (typeof locale !== 'string') return DEFAULT_LOCALE
  const normalized = locale.replace('_', '-').toLowerCase()
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans') {
    return 'zh-CN'
  }
  return DEFAULT_LOCALE
}

export const translateLegacyText = (text, locale) => {
  if (typeof text !== 'string' || !text) return text
  const normalizedLocale = normalizeLocale(locale)
  const legacy = messages[normalizedLocale].legacy || {}
  const lookup = legacyLookups[normalizedLocale]
  const direct = legacy[text] || lookup[text.toLowerCase()]
  if (direct) return direct

  if (text.includes(': ')) {
    const segments = text.split(': ')
    const prefix = segments.shift()
    const translatedPrefix = legacy[prefix] || legacy[`${prefix}:`] ||
      lookup[prefix.toLowerCase()] || lookup[`${prefix}:`.toLowerCase()]
    if (!translatedPrefix) return text

    const translatedSegments = segments.map(segment => {
      return legacy[segment] || lookup[segment.toLowerCase()] || segment
    })
    return [translatedPrefix.replace(/[：:]$/, ''), ...translatedSegments].join('：')
  }
  return text
}

export const localizeMenuTemplate = (template, locale) => {
  if (!Array.isArray(template)) return template
  return template.map(item => {
    const localized = { ...item }
    if (localized.label) {
      localized.label = translateLegacyText(localized.label, locale)
    }
    if (Array.isArray(localized.submenu)) {
      localized.submenu = localizeMenuTemplate(localized.submenu, locale)
    }
    return localized
  })
}
