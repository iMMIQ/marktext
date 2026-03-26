import registerAppHandlers from './app'
import registerClipboardHandlers from './clipboard'
import registerFilesystemHandlers from './filesystem'
import registerFontsHandlers from './fonts'
import registerKeyboardHandlers from './keyboard'
import registerMenuHandlers from './menu'
import registerRuntimeHandlers from './runtime'
import registerSearchHandlers from './search'
import registerShellHandlers from './shell'
import registerWindowHandlers from './window'

const registerRendererIpc = app => {
  registerWindowHandlers(app._accessor.windowManager)
  registerMenuHandlers(app._accessor.menu)
  registerClipboardHandlers()
  registerFilesystemHandlers()
  registerFontsHandlers()
  registerKeyboardHandlers()
  registerRuntimeHandlers(app)
  registerSearchHandlers()
  registerShellHandlers()
  registerAppHandlers(app)
}

export default registerRendererIpc
