import app from './app'
import clipboard from './clipboard'
import events from './events'
import filesystem from './filesystem'
import fonts from './fonts'
import keyboard from './keyboard'
import menu from './menu'
import preferences from './preferences'
import project from './project'
import runtime from './runtime'
import search from './search'
import shell from './shell'
import spellchecker from './spellchecker'
import window from './window'

const nativeApi = {
  app,
  clipboard,
  events,
  filesystem,
  fonts,
  keyboard,
  menu,
  preferences,
  project,
  runtime,
  search,
  shell,
  spellchecker,
  window
}

Object.defineProperties(nativeApi, {
  name: {
    value: 'nativeApi'
  },
  nativeApi: {
    value: nativeApi
  }
})

export default nativeApi
