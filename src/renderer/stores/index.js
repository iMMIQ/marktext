const cloneLegacyState = value => {
  if (Array.isArray(value)) {
    return value.map(cloneLegacyState)
  }

  if (value && typeof value === 'object') {
    const clone = Object.create(Object.getPrototypeOf(value))
    for (const key of Object.keys(value)) {
      clone[key] = cloneLegacyState(value[key])
    }
    return clone
  }

  return value
}

const resetLegacyState = (target, snapshot) => {
  for (const key of Object.keys(target)) {
    delete target[key]
  }

  Object.assign(target, cloneLegacyState(snapshot))
  return target
}

const createLegacyState = source => {
  const snapshot = cloneLegacyState(source)
  return () => resetLegacyState(source, snapshot)
}

export {
  cloneLegacyState,
  createLegacyState
}
