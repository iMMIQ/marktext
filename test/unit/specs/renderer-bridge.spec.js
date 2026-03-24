import nativeApi from '../../../src/renderer/services/nativeApi'

describe('renderer native API facade', () => {
  afterEach(() => {
    delete window.mtNative
  })

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

  it('routes tabs context menu requests through the bridge payload contract', () => {
    const calls = []
    window.mtNative = {
      menu: {
        popupApplicationMenu: payload => calls.push(payload)
      }
    }

    nativeApi.menu.popupTabsMenu({
      position: { x: 12, y: 34 },
      tabId: 'tab-1',
      hasPath: true
    })

    expect(calls).to.deep.equal([{
      scope: 'tabs',
      position: { x: 12, y: 34 },
      tabId: 'tab-1',
      hasPath: true
    }])
  })

  it('routes sidebar context menu requests through the bridge payload contract', () => {
    const calls = []
    window.mtNative = {
      menu: {
        popupApplicationMenu: payload => calls.push(payload)
      }
    }

    nativeApi.menu.popupSideBarMenu({
      position: { x: 56, y: 78 },
      hasPathCache: false
    })

    expect(calls).to.deep.equal([{
      scope: 'sidebar',
      position: { x: 56, y: 78 },
      hasPathCache: false
    }])
  })

  it('routes clipboard access through the bridge contract', async () => {
    const clipboardWrites = []
    window.mtNative = {
      clipboard: {
        readFilePath: () => Promise.resolve('/tmp/example.png'),
        readFilePathSync: () => '/tmp/example.png',
        writeText: value => clipboardWrites.push(value)
      }
    }

    const filePath = await nativeApi.clipboard.readFilePath()
    const syncFilePath = nativeApi.clipboard.readFilePathSync()
    nativeApi.clipboard.writeText('copied-value')

    expect(filePath).to.equal('/tmp/example.png')
    expect(syncFilePath).to.equal('/tmp/example.png')
    expect(clipboardWrites).to.deep.equal(['copied-value'])
  })
})
