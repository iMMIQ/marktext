import app from './services/nativeApi/app'
import { initializeRuntime } from './services/runtime'

let exceptionLogger = s => console.error(s)

const configureLogger = () => {}

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
