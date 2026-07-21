import appApi from './services/nativeApi/app'
import { initializeRuntime } from './services/runtime'

let exceptionLogger = s => console.error(s)

const configureLogger = () => {}

const THEMES_COLOR = {
  'one-dark': 'rgba(77, 120, 204, 1)',
  dark: '#409eff',
  graphite: 'rgb(104, 134, 170)',
  'material-dark': '#f48237',
  light: 'rgba(33, 181, 111, 1)',
  ulysses: 'rgb(12, 139, 186)'
}

const parseUrlArgs = () => {
  const params = new URLSearchParams(window.location.search)
  const codeFontFamily = params.get('cff')
  const codeFontSize = params.get('cfs')
  const hideScrollbar = params.get('hsb') === '1'
  const language = params.get('lang')
  const theme = params.get('theme')
  const titleBarStyle = params.get('tbs')

  return {
    initialState: {
      codeFontFamily,
      codeFontSize,
      hideScrollbar,
      language,
      theme,
      titleBarStyle
    }
  }
}

const hydrateLoadingTheme = () => {
  const params = new URLSearchParams(window.location.search)
  const color = THEMES_COLOR[params.get('theme')] || 'rgba(33, 181, 111, 1)'

  document.querySelectorAll('.dot').forEach(dot => {
    dot.style.background = color
  })
}

const bootstrapRenderer = async () => {
  hydrateLoadingTheme()

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
      appApi.handleRendererError(copy)
    } else {
      console.error(event)
    }
  })

  const { initialState } = parseUrlArgs()
  await initializeRuntime({ initialState })
  configureLogger()
}

export default bootstrapRenderer
