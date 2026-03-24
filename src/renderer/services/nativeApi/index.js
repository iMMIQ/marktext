import app from './app'
import clipboard from './clipboard'
import events from './events'
import menu from './menu'
import shell from './shell'
import window from './window'

const nativeApi = {
  app,
  clipboard,
  events,
  menu,
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
