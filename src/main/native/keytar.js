import log from 'electron-log'

let keytarPromise = null

const loadKeytar = async () => {
  if (keytarPromise) {
    return keytarPromise
  }

  keytarPromise = import('keytar')
    .then(module => module.default ?? module)
    .catch(error => {
      log.error('Unable to load keytar:', error)
      return false
    })

  return keytarPromise
}

export const getPassword = async (serviceName, account) => {
  const api = await loadKeytar()
  if (!api) {
    return ''
  }

  try {
    return await api.getPassword(serviceName, account) || ''
  } catch (error) {
    log.error('Unable to read password from keytar:', error)
    return ''
  }
}

export const setPassword = async (serviceName, account, password) => {
  const api = await loadKeytar()
  if (!api) {
    return false
  }

  try {
    await api.setPassword(serviceName, account, password)
    return true
  } catch (error) {
    log.error('Unable to write password to keytar:', error)
    return false
  }
}
