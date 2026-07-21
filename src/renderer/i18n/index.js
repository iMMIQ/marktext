import { createI18n } from 'vue-i18n'
import {
  DEFAULT_LOCALE,
  messages,
  normalizeLocale,
  translateLegacyText
} from 'common/i18n'

let rendererI18n = null

export const createRendererI18n = locale => {
  rendererI18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: normalizeLocale(locale),
    fallbackLocale: DEFAULT_LOCALE,
    messages,
    missingWarn: false,
    fallbackWarn: false
  })
  return rendererI18n
}

export const setRendererLocale = locale => {
  const normalizedLocale = normalizeLocale(locale)
  document.documentElement.lang = normalizedLocale
  if (rendererI18n) {
    rendererI18n.global.locale.value = normalizedLocale
  }
}

export const installLegacyTranslator = app => {
  app.config.globalProperties.$tr = text => {
    const locale = rendererI18n?.global.locale.value || DEFAULT_LOCALE
    return translateLegacyText(text, locale)
  }
}

export const getRendererLocale = () => {
  return rendererI18n?.global.locale.value || DEFAULT_LOCALE
}
