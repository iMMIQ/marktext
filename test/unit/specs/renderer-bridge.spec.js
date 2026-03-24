import nativeApi from '../../../src/renderer/services/nativeApi'

describe('renderer native API facade', () => {
  it('exposes the expected top-level modules', () => {
    expect(Object.keys(nativeApi).sort()).to.deep.equal([
      'app',
      'clipboard',
      'events',
      'menu',
      'shell',
      'window'
    ])
  })
})
