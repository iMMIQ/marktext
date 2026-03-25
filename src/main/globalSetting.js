import path from 'path'

const staticPath = process.env.NODE_ENV === 'development'
  ? path.resolve(process.cwd(), 'static')
  : path.resolve(__dirname, 'static')

global.__static = staticPath.replace(/\\/g, '\\\\')
