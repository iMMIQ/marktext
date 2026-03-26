import { createRequire } from 'node:module'
import log from 'electron-log'

const require = createRequire(import.meta.url)

let fontManager = null

const loadFontManager = () => {
  if (fontManager !== null) {
    return fontManager
  }

  try {
    fontManager = require('fontmanager-redux')
  } catch (error) {
    log.error('Unable to load fontmanager-redux:', error)
    fontManager = false
  }

  return fontManager
}

export const listFontFamilies = async ({ onlyMonospace = false } = {}) => {
  const api = loadFontManager()
  if (!api || typeof api.getAvailableFontsSync !== 'function') {
    return []
  }

  try {
    const fonts = api.getAvailableFontsSync()
    return [...new Set(fonts
      .filter(font => font.family && (!onlyMonospace || font.monospace))
      .map(font => font.family))].sort((a, b) => a.localeCompare(b))
  } catch (error) {
    log.error('Unable to list system fonts:', error)
    return []
  }
}
