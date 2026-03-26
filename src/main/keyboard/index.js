import { shell } from 'electron'
import log from 'electron-log'
import EventEmitter from 'events'
import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { getCurrentKeyboardInfo, subscribeToKeyboardLayoutChange } from '../native/nativeKeymap'

let currentKeyboardInfo = null
const loadKeyboardInfo = () => {
  currentKeyboardInfo = getCurrentKeyboardInfo()
  return currentKeyboardInfo
}

export const getKeyboardInfo = () => {
  if (!currentKeyboardInfo) {
    return loadKeyboardInfo()
  }
  return currentKeyboardInfo
}

const KEYBOARD_LAYOUT_MONITOR_CHANNEL_ID = 'onDidChangeKeyboardLayout'
class KeyboardLayoutMonitor extends EventEmitter {
  constructor () {
    super()
    this._isSubscribed = false
    this._emitTimer = null
  }

  addListener (callback) {
    this._ensureNativeListener()
    this.on(KEYBOARD_LAYOUT_MONITOR_CHANNEL_ID, callback)
  }

  removeListener (callback) {
    super.removeListener(KEYBOARD_LAYOUT_MONITOR_CHANNEL_ID, callback)
  }

  _ensureNativeListener () {
    if (!this._isSubscribed) {
      this._isSubscribed = true
      subscribeToKeyboardLayoutChange(() => {
        // The keyboard layout change event may be emitted multiple times.
        clearTimeout(this._emitTimer)
        this._emitTimer = setTimeout(() => {
          this.emit(KEYBOARD_LAYOUT_MONITOR_CHANNEL_ID, loadKeyboardInfo())
          this._emitTimer = null
        }, 150)
      })
    }
  }
}

// Export a single-instance of the monitor.
export const keyboardLayoutMonitor = new KeyboardLayoutMonitor()

export const dumpKeyboardInfo = async () => {
  const dumpPath = path.join(os.tmpdir(), 'marktext_keyboard_info.json')
  const content = JSON.stringify(getKeyboardInfo(), null, 2)

  try {
    await fsPromises.writeFile(dumpPath, content, 'utf8')
    console.log(`Keyboard information written to "${dumpPath}".`)
    await shell.openPath(dumpPath)
  } catch (error) {
    log.error('Error dumping keyboard information:', error)
  }
}
