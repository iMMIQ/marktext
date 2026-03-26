import { createRequire } from 'node:module'
import log from 'electron-log'

const require = createRequire(import.meta.url)

let nativeKeymap = null
let nativeKeymapLoader = null

const EMPTY_KEYBOARD_INFO = {
  layout: '',
  keymap: {}
}

const requireNativeKeymap = () => require('native-keymap')

const loadNativeKeymap = () => {
  if (nativeKeymap !== null) {
    return nativeKeymap
  }

  try {
    const load = nativeKeymapLoader || requireNativeKeymap
    nativeKeymap = load()
  } catch (error) {
    log.error('Unable to load native-keymap:', error)
    nativeKeymap = false
  }

  return nativeKeymap
}

export const getCurrentKeyboardInfo = () => {
  const api = loadNativeKeymap()
  if (!api) {
    return EMPTY_KEYBOARD_INFO
  }

  try {
    return {
      layout: api.getCurrentKeyboardLayout() || '',
      keymap: api.getKeyMap() || {}
    }
  } catch (error) {
    log.error('Unable to read keyboard information:', error)
    return EMPTY_KEYBOARD_INFO
  }
}

export const subscribeToKeyboardLayoutChange = callback => {
  const api = loadNativeKeymap()
  if (!api || typeof callback !== 'function') {
    return () => {}
  }

  try {
    const unsubscribe = api.onDidChangeKeyboardLayout(callback)
    return typeof unsubscribe === 'function' ? unsubscribe : () => {}
  } catch (error) {
    log.error('Unable to subscribe to keyboard layout changes:', error)
    return () => {}
  }
}

export const setNativeKeymapLoader = loader => {
  nativeKeymapLoader = loader
  nativeKeymap = null
}

export const resetNativeKeymapLoader = () => {
  nativeKeymapLoader = null
  nativeKeymap = null
}
