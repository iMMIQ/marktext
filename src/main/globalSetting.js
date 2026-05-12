import path from 'path'
import { app } from 'electron'

const staticPath = app.isPackaged
  ? path.join(app.getAppPath(), 'dist/electron/static')
  : path.resolve(process.cwd(), 'static')

global.__static = staticPath.replace(/\\/g, '\\\\')
