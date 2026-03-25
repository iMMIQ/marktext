import path from 'path'
import log from 'electron-log'
import app from './services/nativeApi/app'
import { getRuntime, initializeRuntime } from './services/runtime'

let exceptionLogger = s => console.error(s)

const configureLogger = () => {
  const { env, paths } = getRuntime()
  const { debug, windowId } = env
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'info' : false // mirror to window console
  log.transports.mainConsole = null
  log.transports.file.resolvePath = () => path.join(paths.logPath, `editor-${windowId}.log`)
  log.transports.file.level = debug ? 'debug' : 'info'
  log.transports.file.sync = false
  exceptionLogger = log.error
}

const parseUrlArgs = () => {
  const params = new URLSearchParams(window.location.search)
  const codeFontFamily = params.get('cff')
  const codeFontSize = params.get('cfs')
  const hideScrollbar = params.get('hsb') === '1'
  const theme = params.get('theme')
  const titleBarStyle = params.get('tbs')

  return {
    initialState: {
      codeFontFamily,
      codeFontSize,
      hideScrollbar,
      theme,
      titleBarStyle
    }
  }
}

const bootstrapRenderer = async () => {
  // Register renderer exception handler
  window.addEventListener('error', event => {
    if (event.error) {
      const { message, name, stack } = event.error
      const copy = {
        message,
        name,
        stack
      }

      exceptionLogger(event.error)

      // Pass exception to main process exception handler to show a error dialog.
      app.send('mt::handle-renderer-error', copy)
    } else {
      console.error(event)
    }
  })

  const { initialState } = parseUrlArgs()
  await initializeRuntime({ initialState })
  configureLogger()
}

export default bootstrapRenderer
