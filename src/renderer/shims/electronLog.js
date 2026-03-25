const noop = () => {}

const electronLog = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  log: (...args) => console.log(...args),
  debug: (...args) => console.debug(...args),
  transports: {
    console: {
      level: false
    },
    file: {
      level: false,
      sync: false,
      resolvePath: noop
    },
    mainConsole: null
  }
}

export default electronLog
