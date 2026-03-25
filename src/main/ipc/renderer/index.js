import registerAppHandlers from './app'
import registerClipboardHandlers from './clipboard'
import registerMenuHandlers from './menu'
import registerRuntimeHandlers from './runtime'
import registerShellHandlers from './shell'
import registerWindowHandlers from './window'

const registerRendererIpc = app => {
  registerWindowHandlers(app._accessor.windowManager)
  registerMenuHandlers(app._accessor.menu)
  registerClipboardHandlers()
  registerRuntimeHandlers(app)
  registerShellHandlers()
  registerAppHandlers(app)
}

export default registerRendererIpc
