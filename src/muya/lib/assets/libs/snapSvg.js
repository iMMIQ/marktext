import snapSvgSource from './snap.svg-min.js?raw'

if (!window.Snap) {
  // Evaluate the legacy UMD bundle as a plain script so Vite does not try to
  // resolve Snap.svg's optional CommonJS `eve` dependency during dev serve.
  new Function(snapSvgSource)()
}

export default window.Snap
