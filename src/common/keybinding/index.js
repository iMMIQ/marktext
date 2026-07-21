const getPlatform = () => {
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform
  }
  if (typeof navigator === 'undefined') {
    return ''
  }

  const value = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase()
  if (value.includes('mac')) return 'darwin'
  if (value.includes('win')) return 'win32'
  if (value.includes('linux')) return 'linux'
  return ''
}

const isOsx = getPlatform() === 'darwin'

const _normalizeAccelerator = accelerator => {
  return accelerator.toLowerCase()
    .replace('commandorcontrol', isOsx ? 'cmd' : 'ctrl')
    .replace('cmdorctrl', isOsx ? 'cmd' : 'ctrl')
    .replace('control', 'ctrl')
    .replace('meta', 'cmd') // meta := cmd (macOS only) or super
    .replace('command', 'cmd')
    .replace('option', 'alt')
}

export const isEqualAccelerator = (a, b) => {
  a = _normalizeAccelerator(a)
  b = _normalizeAccelerator(b)
  const i1 = a.indexOf('+')
  const i2 = b.indexOf('+')
  if (i1 === -1 && i2 === -1) {
    return a === b
  } else if (i1 === -1 || i2 === -1) {
    return false
  }

  const partsA = a.split('+')
  const partsB = b.split('+')
  if (partsA.length !== partsB.length) {
    return false
  }

  const intersection = new Set([...partsA, ...partsB])
  return intersection.size === partsB.length
}
