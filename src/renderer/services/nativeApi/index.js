import app from './app'
import clipboard from './clipboard'
import events from './events'
import filesystem from './filesystem'
import menu from './menu'
import runtime from './runtime'
import search from './search'
import shell from './shell'
import window from './window'

const nativeApi = {
  app,
  clipboard,
  events,
  filesystem,
  menu,
  runtime,
  search,
  shell,
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
