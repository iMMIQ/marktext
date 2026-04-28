import snapSvgUrl from './snap.svg-min.js?url'

let loadSnapPromise = null

export const ensureSnap = () => {
  if (typeof window === 'undefined') {
    return Promise.resolve(undefined)
  }

  if (window.Snap) {
    return Promise.resolve(window.Snap)
  }

  if (!loadSnapPromise) {
    loadSnapPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = snapSvgUrl
      script.async = true
      script.onload = () => resolve(window.Snap)
      script.onerror = () => reject(new Error('Failed to load Snap.svg.'))
      document.head.appendChild(script)
    })
  }

  return loadSnapPromise
}

export default ensureSnap
