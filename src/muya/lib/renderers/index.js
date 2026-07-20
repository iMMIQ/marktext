const rendererCache = new Map()
const loadExternalVendor = name => import(new URL(`../vendor/${name}.js`, import.meta.url).href)
/**
 *
 * @param {string} name the renderer name: katex, sequence, plantuml, flowchart, mermaid, vega-lite
 */
const loadRenderer = async (name) => {
  if (!rendererCache.has(name)) {
    let m
    switch (name) {
      case 'sequence':
        await import('../assets/libs/snapSvg').then(({ ensureSnap }) => ensureSnap())
        m = await import('../parser/render/sequence')
        rendererCache.set(name, m.default)
        break
      case 'plantuml':
        m = await import('../parser/render/plantuml')
        rendererCache.set(name, m.default)
        break
      case 'flowchart':
        m = await import('flowchart.js')
        rendererCache.set(name, m.default)
        break
      case 'mermaid':
        m = await loadExternalVendor('mermaid')
        rendererCache.set(name, m.default)
        break
      case 'vega-lite':
        m = await loadExternalVendor('vega-embed')
        rendererCache.set(name, m.default)
        break
      default:
        throw new Error(`Unknown diagram name ${name}`)
    }
  }

  return rendererCache.get(name)
}

export default loadRenderer
